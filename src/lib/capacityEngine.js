/**
 * /lib/capacityEngine.js
 * Vector Platform — Capacity Token System
 *
 * Controls task assignment based on student weekly hour budgets.
 * Each task has a `complexityWeight` (1–10) which maps to estimated hours.
 * Students have `maxWeeklyHours` and `currentActiveHours` tracked in real time.
 *
 * Rules:
 *  - Assignment blocked if (currentActiveHours + complexityWeight) > maxWeeklyHours
 *  - Transfer log is immutable — entries are only appended, never deleted
 *  - On transfer: fromStudent tokens are freed, toStudent tokens are locked
 */

import { readDB, writeDB, findById, updateRecord } from './db.js';

// ─── Capacity Check ───────────────────────────────────────────────────────────

/**
 * Check whether a student has capacity to take on a task.
 *
 * @param {string} studentId
 * @param {number} taskComplexityWeight - Estimated hours the task will consume
 * @returns {Promise<{ canAssign: boolean, reason: string, remainingHours: number, student: Object|null }>}
 */
export async function checkCapacity(studentId, taskComplexityWeight) {
  const student = await findById('students', studentId);

  if (!student) {
    return {
      canAssign: false,
      reason: `Student with id "${studentId}" not found.`,
      remainingHours: 0,
      student: null,
    };
  }

  const tokens = student.capacityTokens ?? {};
  const maxHours = tokens.maxWeeklyHours ?? 0;
  const currentHours = tokens.currentActiveHours ?? 0;
  const remainingHours = maxHours - currentHours;

  if (taskComplexityWeight > remainingHours) {
    return {
      canAssign: false,
      reason: `${student.name} only has ${remainingHours}h remaining this week (task needs ${taskComplexityWeight}h).`,
      remainingHours,
      student,
    };
  }

  return {
    canAssign: true,
    reason: `${student.name} has ${remainingHours}h available — task needs ${taskComplexityWeight}h.`,
    remainingHours,
    student,
  };
}

// ─── Assign Task ──────────────────────────────────────────────────────────────

/**
 * Assign a task to a student after passing capacity check.
 * If the requested student is at capacity, automatically finds the
 * next available team member and assigns to them instead.
 *
 * @param {string} taskId
 * @param {string} studentId - Requested assignee
 * @returns {Promise<{
 *   success: boolean,
 *   assignedTo: string|null,
 *   redirected: boolean,
 *   redirectReason: string|null,
 *   task: Object|null,
 *   error: string|null
 * }>}
 */
export async function assignTask(taskId, studentId) {
  const tasks = await readDB('tasks');
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex === -1) {
    return { success: false, assignedTo: null, redirected: false, redirectReason: null, task: null, error: `Task "${taskId}" not found.` };
  }

  const task = tasks[taskIndex];

  // Capacity check for requested student
  const capacityResult = await checkCapacity(studentId, task.complexityWeight ?? 0);

  if (capacityResult.canAssign) {
    // Lock tokens for the student
    await _lockTokens(studentId, task.complexityWeight ?? 0, taskId);

    // Update the task
    tasks[taskIndex] = {
      ...task,
      assignedTo: studentId,
      status: 'active',
    };
    await writeDB('tasks', tasks);

    return {
      success: true,
      assignedTo: studentId,
      redirected: false,
      redirectReason: null,
      task: tasks[taskIndex],
      error: null,
    };
  }

  // Requested student is over capacity — find next available in the same team
  if (!task.teamId) {
    return {
      success: false,
      assignedTo: null,
      redirected: false,
      redirectReason: null,
      task,
      error: capacityResult.reason,
    };
  }

  const alternative = await _findNextAvailableTeamMember(
    task.teamId,
    task.complexityWeight ?? 0,
    [studentId]
  );

  if (!alternative) {
    return {
      success: false,
      assignedTo: null,
      redirected: false,
      redirectReason: capacityResult.reason,
      task,
      error: 'Entire team is at capacity. Consider calling a democratic vote to resolve.',
    };
  }

  // Assign to the alternative
  await _lockTokens(alternative.id, task.complexityWeight ?? 0, taskId);
  tasks[taskIndex] = {
    ...task,
    assignedTo: alternative.id,
    status: 'active',
  };
  await writeDB('tasks', tasks);

  return {
    success: true,
    assignedTo: alternative.id,
    redirected: true,
    redirectReason: `${capacityResult.reason} Redirected to ${alternative.name} who has ${alternative.remainingHours}h available.`,
    task: tasks[taskIndex],
    error: null,
  };
}

// ─── Transfer Task ────────────────────────────────────────────────────────────

/**
 * Transfer a task from one student to another.
 * Frees the fromStudent's tokens, locks the toStudent's tokens.
 * Appends an immutable log entry — never deletes history.
 *
 * @param {string} taskId
 * @param {string} fromStudentId
 * @param {string} toStudentId
 * @param {string} reason - Human-readable reason for the transfer
 * @returns {Promise<{
 *   success: boolean,
 *   task: Object|null,
 *   error: string|null
 * }>}
 */
export async function transferTask(taskId, fromStudentId, toStudentId, reason) {
  const tasks = await readDB('tasks');
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex === -1) {
    return { success: false, task: null, error: `Task "${taskId}" not found.` };
  }

  const task = tasks[taskIndex];

  // Validate fromStudent is actually assigned
  if (task.assignedTo !== fromStudentId) {
    return {
      success: false,
      task,
      error: `Task is not currently assigned to student "${fromStudentId}".`,
    };
  }

  // Check toStudent capacity
  const capacityResult = await checkCapacity(toStudentId, task.complexityWeight ?? 0);
  if (!capacityResult.canAssign) {
    return {
      success: false,
      task,
      error: `Cannot transfer: ${capacityResult.reason}`,
    };
  }

  // Get student names for the log
  const fromStudent = await findById('students', fromStudentId);
  const toStudent = capacityResult.student;

  // Build immutable log entry
  const logEntry = {
    timestamp: new Date().toISOString(),
    fromStudentId,
    fromStudentName: fromStudent?.name ?? fromStudentId,
    toStudentId,
    toStudentName: toStudent?.name ?? toStudentId,
    reason: reason || 'No reason provided',
  };

  // Free fromStudent tokens
  await _freeTokens(fromStudentId, task.complexityWeight ?? 0, taskId);

  // Lock toStudent tokens
  await _lockTokens(toStudentId, task.complexityWeight ?? 0, taskId);

  // Update task — append log entry (never delete)
  tasks[taskIndex] = {
    ...task,
    assignedTo: toStudentId,
    status: 'active',
    transferLog: [...(task.transferLog ?? []), logEntry],
  };
  await writeDB('tasks', tasks);

  return { success: true, task: tasks[taskIndex], error: null };
}

// ─── Capacity Matrix ──────────────────────────────────────────────────────────

/**
 * Return the capacity utilization for all members of a team.
 * Used for the task board and admin dashboard displays.
 *
 * @param {string} teamId
 * @returns {Promise<Array<{
 *   studentId: string,
 *   name: string,
 *   maxWeeklyHours: number,
 *   currentActiveHours: number,
 *   remainingHours: number,
 *   utilizationPercent: number,
 *   status: 'available'|'warning'|'full'
 * }>>}
 */
export async function getCapacityMatrix(teamId) {
  const team = await findById('teams', teamId);
  if (!team) return [];

  const students = await readDB('students');
  const members = students.filter((s) => team.memberIds.includes(s.id));

  return members.map((s) => {
    const tokens = s.capacityTokens ?? {};
    const maxHours = tokens.maxWeeklyHours ?? 0;
    const currentHours = tokens.currentActiveHours ?? 0;
    const remainingHours = Math.max(0, maxHours - currentHours);
    const utilizationPercent = maxHours > 0 ? Math.round((currentHours / maxHours) * 100) : 0;

    let status = 'available';
    if (utilizationPercent >= 100) status = 'full';
    else if (utilizationPercent >= 70) status = 'warning';

    return {
      studentId: s.id,
      name: s.name,
      maxWeeklyHours: maxHours,
      currentActiveHours: currentHours,
      remainingHours,
      utilizationPercent,
      status,
    };
  });
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Add hours to a student's currentActiveHours and record in taskHistory.
 * @param {string} studentId
 * @param {number} hours
 * @param {string} taskId
 */
async function _lockTokens(studentId, hours, taskId) {
  const student = await findById('students', studentId);
  if (!student) return;

  const tokens = student.capacityTokens ?? { maxWeeklyHours: 0, currentActiveHours: 0, taskHistory: [] };
  const history = [...(tokens.taskHistory ?? [])];
  history.push({ taskId, action: 'locked', hours, timestamp: new Date().toISOString() });

  await updateRecord('students', studentId, {
    capacityTokens: {
      ...tokens,
      currentActiveHours: (tokens.currentActiveHours ?? 0) + hours,
      taskHistory: history,
    },
  });
}

/**
 * Subtract hours from a student's currentActiveHours.
 * @param {string} studentId
 * @param {number} hours
 * @param {string} taskId
 */
async function _freeTokens(studentId, hours, taskId) {
  const student = await findById('students', studentId);
  if (!student) return;

  const tokens = student.capacityTokens ?? { maxWeeklyHours: 0, currentActiveHours: 0, taskHistory: [] };
  const history = [...(tokens.taskHistory ?? [])];
  history.push({ taskId, action: 'freed', hours, timestamp: new Date().toISOString() });

  await updateRecord('students', studentId, {
    capacityTokens: {
      ...tokens,
      currentActiveHours: Math.max(0, (tokens.currentActiveHours ?? 0) - hours),
      taskHistory: history,
    },
  });
}

/**
 * Find the next available team member who has capacity for a task.
 * Excludes any student IDs in `excludeIds`.
 *
 * @param {string} teamId
 * @param {number} requiredHours
 * @param {string[]} excludeIds
 * @returns {Promise<{ id: string, name: string, remainingHours: number }|null>}
 */
async function _findNextAvailableTeamMember(teamId, requiredHours, excludeIds = []) {
  const matrix = await getCapacityMatrix(teamId);

  const available = matrix
    .filter((m) => !excludeIds.includes(m.studentId))
    .filter((m) => m.remainingHours >= requiredHours)
    .sort((a, b) => b.remainingHours - a.remainingHours);

  if (available.length === 0) return null;

  return {
    id: available[0].studentId,
    name: available[0].name,
    remainingHours: available[0].remainingHours,
  };
}
