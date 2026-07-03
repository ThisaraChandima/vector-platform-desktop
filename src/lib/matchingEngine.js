/**
 * /lib/matchingEngine.js
 * Vector Platform — Team Formation Algorithm
 *
 * Uses a greedy complementarity-first algorithm to form balanced capstone teams:
 *   1. Filter eligible students (onboarding complete, not yet in a team)
 *   2. Build/refresh vectors for all eligible students
 *   3. Pick the highest-skilled anchor student per team
 *   4. Greedily fill each team with the most complementary matches
 *   5. Validate schedule overlap (min 2 shared slots)
 *   6. Assign roles based on desiredRole and skill strengths
 *   7. Detect skill gaps against faculty-required roles
 *   8. Distribute any stranded students to existing teams
 *
 * Returns an array of team objects ready to be saved to teams.json.
 */

import crypto from 'crypto';
import {
  buildStudentVector,
  complementarityScore,
  countScheduleOverlap,
  detectSkillGaps,
  teamSkillCoverage,
} from './vectorEngine.js';

// Roles we fill per team (in priority order)
const ROLE_PRIORITY = ['frontend', 'backend', 'uiux', 'qa', 'devops', 'fullstack', 'manager'];

// Default faculty rules if none supplied
const DEFAULT_FACULTY_RULES = {
  teamSize: 4,
  requiredRoles: ['frontend', 'backend', 'uiux', 'qa'],
  minScheduleOverlap: 2,
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Form teams from a pool of students.
 *
 * @param {Object[]} allStudents - All student records from students.json
 * @param {number} teamSize - Target members per team
 * @param {Object} facultyRules - { teamSize, requiredRoles, minScheduleOverlap }
 * @returns {Promise<{
 *   teams: Object[],
 *   updatedStudents: Object[],
 *   summary: Object
 * }>}
 */
export async function formTeams(allStudents, teamSize, facultyRules = {}) {
  const rules = { ...DEFAULT_FACULTY_RULES, ...facultyRules, teamSize: teamSize ?? DEFAULT_FACULTY_RULES.teamSize };

  // ── Step 1: Filter eligible students ──────────────────────────────────────
  let eligible = allStudents.filter(
    (s) => s.onboardingComplete === true && (s.teamId === null || s.teamId === undefined)
  );

  if (eligible.length === 0) {
    return {
      teams: [],
      updatedStudents: allStudents,
      summary: { teamsFormed: 0, studentsPlaced: 0, strandedStudents: 0, message: 'No eligible students found.' },
    };
  }

  // ── Step 2: Build/refresh vectors ─────────────────────────────────────────
  eligible = eligible.map((s) => ({
    ...s,
    vector: s.vector && s.vector.length === 20 ? s.vector : buildStudentVector(s.profile),
  }));

  // ── Step 3: Form teams greedily ───────────────────────────────────────────
  const teams = [];
  let unassigned = [...eligible];

  while (unassigned.length >= rules.teamSize) {
    // Pick anchor: the student with the highest overall skill sum
    const anchor = _pickAnchor(unassigned);

    // Find most complementary matches for remaining slots
    const teammates = _pickTeammates(anchor, unassigned, rules);

    const teamMembers = [anchor, ...teammates];
    const memberIds = teamMembers.map((s) => s.id);

    // Assign roles
    const roles = _assignRoles(teamMembers, rules.requiredRoles);

    // Detect skill gaps
    const memberVectors = teamMembers.map((s) => s.vector);
    const skillGaps = detectSkillGaps(memberVectors, rules.requiredRoles);

    // Compute schedule conflicts
    const scheduleConflicts = _detectScheduleConflicts(teamMembers, rules.minScheduleOverlap);

    // Compute formation score (0–100)
    const formationScore = _computeFormationScore(teamMembers, skillGaps, scheduleConflicts, rules);

    // Build team name
    const teamName = _generateTeamName(teams.length + 1);

    const team = {
      id: crypto.randomUUID(),
      name: teamName,
      memberIds,
      projectId: null,
      roles,
      skillGaps,
      scheduleConflicts,
      status: skillGaps.length > 0 || scheduleConflicts.length > 0 ? 'flagged' : 'forming',
      aiEvaluationLog: [],
      formationScore,
      createdAt: new Date().toISOString(),
    };

    teams.push(team);

    // Remove placed students from the pool
    const placedIds = new Set(memberIds);
    unassigned = unassigned.filter((s) => !placedIds.has(s.id));
  }

  // ── Step 8: Distribute stranded students ──────────────────────────────────
  // Any leftover students (count < teamSize) must join existing teams.
  const strandedCount = unassigned.length;
  if (unassigned.length > 0 && teams.length > 0) {
    for (const stranded of unassigned) {
      const targetTeam = _findBestTeamForStranded(stranded, teams, eligible);
      if (targetTeam) {
        targetTeam.memberIds.push(stranded.id);

        // Re-evaluate roles and gaps after addition
        const updatedMembers = eligible.filter((s) => targetTeam.memberIds.includes(s.id));
        targetTeam.roles = _assignRoles(updatedMembers, rules.requiredRoles);
        const updatedVectors = updatedMembers.map((s) => s.vector);
        targetTeam.skillGaps = detectSkillGaps(updatedVectors, rules.requiredRoles);
        targetTeam.status = targetTeam.skillGaps.length > 0 ? 'flagged' : 'forming';
        targetTeam.formationScore = _computeFormationScore(
          updatedMembers, targetTeam.skillGaps, targetTeam.scheduleConflicts, rules
        );
      }
    }
  }

  // ── Build updated student array with teamId assigned ──────────────────────
  const teamMembershipMap = {};
  for (const team of teams) {
    for (const memberId of team.memberIds) {
      teamMembershipMap[memberId] = team.id;
    }
  }

  const updatedStudents = allStudents.map((s) => {
    if (teamMembershipMap[s.id]) {
      return { ...s, teamId: teamMembershipMap[s.id], vector: s.vector ?? buildStudentVector(s.profile) };
    }
    return s;
  });

  const studentsPlaced = Object.keys(teamMembershipMap).length;

  return {
    teams,
    updatedStudents,
    summary: {
      teamsFormed: teams.length,
      studentsPlaced,
      strandedStudents: strandedCount,
      message: `Formed ${teams.length} team(s) with ${studentsPlaced} students. ${strandedCount} stranded students redistributed.`,
    },
  };
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Pick the "anchor" student — the one with highest combined skill score.
 * The anchor seeds the team and others are chosen to complement them.
 * @param {Object[]} students
 * @returns {Object}
 */
function _pickAnchor(students) {
  return students.reduce((best, s) => {
    const skillSum = (s.vector ?? []).slice(0, 11).reduce((sum, v) => sum + v, 0);
    const bestSum = (best.vector ?? []).slice(0, 11).reduce((sum, v) => sum + v, 0);
    return skillSum > bestSum ? s : best;
  }, students[0]);
}

/**
 * Greedily pick teammates for the anchor from the unassigned pool.
 * Prioritises complementarity score and schedule overlap.
 *
 * @param {Object} anchor
 * @param {Object[]} unassigned - All unassigned students (including anchor)
 * @param {Object} rules
 * @returns {Object[]} Teammates (not including anchor)
 */
function _pickTeammates(anchor, unassigned, rules) {
  const pool = unassigned.filter((s) => s.id !== anchor.id);
  const picked = [];
  let remaining = [...pool];
  let teamSoFar = [anchor];

  const slotsToFill = rules.teamSize - 1;

  for (let i = 0; i < slotsToFill && remaining.length > 0; i++) {
    // Compute complementarity of each candidate vs the current team collectively
    const scored = remaining.map((candidate) => {
      // Average complementarity against each current team member
      const avgComp =
        teamSoFar.reduce((sum, member) => sum + complementarityScore(member.vector, candidate.vector), 0) /
        teamSoFar.length;

      // Schedule overlap with anchor (at least minScheduleOverlap preferred)
      const overlap = countScheduleOverlap(anchor.vector, candidate.vector);
      const overlapBonus = overlap >= rules.minScheduleOverlap ? 0.1 : 0;

      return { candidate, score: avgComp + overlapBonus };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].candidate;

    picked.push(best);
    teamSoFar.push(best);
    remaining = remaining.filter((s) => s.id !== best.id);
  }

  return picked;
}

/**
 * Assign roles to team members.
 * Priority: match desiredRole first, then assign by highest skill in needed roles.
 *
 * @param {Object[]} members
 * @param {string[]} requiredRoles
 * @returns {Object} { frontend: id|null, backend: id|null, ... }
 */
function _assignRoles(members, requiredRoles) {
  const roleDimMap = {
    frontend: 0, backend: 1, uiux: 2, qa: 3,
    devops: 4, mobile: 5, dataScience: 6,
  };

  const roles = {
    frontend: null, backend: null, uiux: null,
    qa: null, devops: null, leader: null,
  };

  const assignedMembers = new Set();

  // Pass 1: Honour desiredRole (first-come, first-served)
  for (const member of members) {
    const desired = member.profile?.desiredRole;
    if (desired && roles[desired] === null && !assignedMembers.has(member.id)) {
      // Validate they have at least some skill in that role
      const dim = roleDimMap[desired];
      if (dim !== undefined) {
        const skillScore = (member.vector ?? [])[dim] ?? 0;
        if (skillScore >= 0.3) {
          // at least score 3/10
          roles[desired] = member.id;
          assignedMembers.add(member.id);
        }
      } else if (desired === 'fullstack' || desired === 'manager') {
        // fullstack / manager don't have a single dimension — assign leader
        if (roles.leader === null) {
          roles.leader = member.id;
          assignedMembers.add(member.id);
        }
      }
    }
  }

  // Pass 2: Fill remaining required roles by highest skill
  for (const role of requiredRoles) {
    if (roles[role] !== null) continue; // already filled
    const dim = roleDimMap[role];
    if (dim === undefined) continue;

    const best = members
      .filter((m) => !assignedMembers.has(m.id))
      .sort((a, b) => ((b.vector ?? [])[dim] ?? 0) - ((a.vector ?? [])[dim] ?? 0))[0];

    if (best) {
      roles[role] = best.id;
      assignedMembers.add(best.id);
    }
  }

  // Pass 3: Assign leader — highest leadership score among unassigned, or highest overall
  if (roles.leader === null) {
    const leaderDim = 7; // leadership dimension
    const leaderCandidates = members
      .filter((m) => !assignedMembers.has(m.id))
      .sort((a, b) => ((b.vector ?? [])[leaderDim] ?? 0) - ((a.vector ?? [])[leaderDim] ?? 0));

    if (leaderCandidates.length > 0) {
      roles.leader = leaderCandidates[0].id;
    } else {
      // All assigned already — pick highest leadership from full team
      const byLeadership = [...members].sort(
        (a, b) => ((b.vector ?? [])[leaderDim] ?? 0) - ((a.vector ?? [])[leaderDim] ?? 0)
      );
      if (byLeadership.length > 0) roles.leader = byLeadership[0].id;
    }
  }

  return roles;
}

/**
 * Detect schedule conflicts: pairs within the team who have fewer than
 * minScheduleOverlap shared slots.
 *
 * @param {Object[]} members
 * @param {number} minOverlap
 * @returns {string[]} Human-readable conflict descriptions
 */
function _detectScheduleConflicts(members, minOverlap = 2) {
  const conflicts = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const overlap = countScheduleOverlap(members[i].vector, members[j].vector);
      if (overlap < minOverlap) {
        conflicts.push(
          `${members[i].name} and ${members[j].name} share only ${overlap} availability slot(s) (minimum: ${minOverlap}).`
        );
      }
    }
  }
  return conflicts;
}

/**
 * Compute a formation quality score (0–100) for a team.
 *   - 50 points: skill coverage (teamSkillCoverage × 50)
 *   - 30 points: deducted by skill gaps (each gap = -10, capped at -30)
 *   - 20 points: deducted by schedule conflicts (each conflict = -5, capped at -20)
 *
 * @param {Object[]} members
 * @param {string[]} skillGaps
 * @param {string[]} scheduleConflicts
 * @param {Object} rules
 * @returns {number}
 */
function _computeFormationScore(members, skillGaps, scheduleConflicts, rules) {
  const vectors = members.map((s) => s.vector ?? []);
  const coverage = teamSkillCoverage(vectors); // 0–1

  const coveragePoints = Math.round(coverage * 50);
  const gapPenalty = Math.min(30, skillGaps.length * 10);
  const conflictPenalty = Math.min(20, scheduleConflicts.length * 5);

  return Math.max(0, coveragePoints + 50 - gapPenalty - conflictPenalty);
}

/**
 * Find the best existing team to absorb a stranded student.
 * Picks the team where the student contributes the highest complementarity
 * to the team's existing collective vector.
 *
 * @param {Object} stranded
 * @param {Object[]} teams
 * @param {Object[]} allEligible
 * @returns {Object|null} The target team object (mutated in-place)
 */
function _findBestTeamForStranded(stranded, teams, allEligible) {
  let bestTeam = null;
  let bestScore = -Infinity;

  for (const team of teams) {
    const members = allEligible.filter((s) => team.memberIds.includes(s.id));
    if (members.length === 0) continue;

    const avgComp =
      members.reduce((sum, m) => sum + complementarityScore(m.vector, stranded.vector), 0) /
      members.length;

    if (avgComp > bestScore) {
      bestScore = avgComp;
      bestTeam = team;
    }
  }

  return bestTeam;
}

/**
 * Generate a memorable team name based on the team number.
 * @param {number} index - 1-based team index
 * @returns {string}
 */
function _generateTeamName(index) {
  const adjectives = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
    'Iota', 'Kappa', 'Lambda', 'Sigma',
  ];
  const nouns = [
    'Pioneers', 'Architects', 'Innovators', 'Builders', 'Creators',
    'Visionaries', 'Engineers', 'Strategists', 'Catalysts', 'Navigators',
    'Disruptors', 'Trailblazers',
  ];
  const adj = adjectives[(index - 1) % adjectives.length] ?? `Team${index}`;
  const noun = nouns[(index - 1) % nouns.length] ?? 'Crew';
  return `${adj} ${noun}`;
}
