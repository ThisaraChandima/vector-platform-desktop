/**
 * /lib/vectorEngine.js
 * Vector Platform — Student Vector Embedding Engine
 *
 * Builds 20-dimensional float vectors from student profiles,
 * computes cosine similarity, complementarity scores, and finds
 * best-matched team members using vector math.
 *
 * Dimensions (0-indexed):
 *  [0]  frontend          (technicalSkills.frontend / 10)
 *  [1]  backend           (technicalSkills.backend / 10)
 *  [2]  uiux              (technicalSkills.uiux / 10)
 *  [3]  qa                (technicalSkills.qa / 10)
 *  [4]  devops            (technicalSkills.devops / 10)
 *  [5]  mobile            (technicalSkills.mobile / 10)
 *  [6]  dataScience       (technicalSkills.dataScience / 10)
 *  [7]  leadership        (softSkills.leadership / 10)
 *  [8]  communication     (softSkills.communication / 10)
 *  [9]  problemSolving    (softSkills.problemSolving / 10)
 *  [10] teamwork          (softSkills.teamwork / 10)
 *  [11] mondayAfternoon   (0|1)
 *  [12] mondayEvening     (0|1)
 *  [13] tuesdayAfternoon  (0|1)
 *  [14] tuesdayEvening    (0|1)
 *  [15] wednesdayAfternoon(0|1)
 *  [16] wednesdayEvening  (0|1)
 *  [17] thursdayAfternoon (0|1)
 *  [18] thursdayEvening   (0|1)
 *  [19] availableWeekend  (0|1)
 */

// Dimension ranges
const SKILL_DIMS = { start: 0, end: 10 };    // indices 0–10 (inclusive)
const SCHEDULE_DIMS = { start: 11, end: 19 }; // indices 11–19 (inclusive)
const VECTOR_LENGTH = 20;

/**
 * Build a 20-dimension normalized float vector from a student profile object.
 * @param {Object} profile - Student profile (technicalSkills, softSkills, availability)
 * @returns {number[]} 20-element array with values in [0, 1]
 */
export function buildStudentVector(profile) {
  const ts = profile.technicalSkills ?? {};
  const ss = profile.softSkills ?? {};
  const av = profile.availability ?? {};

  const weekendAvailable = av.saturday || av.sunday ? 1 : 0;

  return [
    // Technical skills — normalized 0→1
    (ts.frontend ?? 0) / 10,
    (ts.backend ?? 0) / 10,
    (ts.uiux ?? 0) / 10,
    (ts.qa ?? 0) / 10,
    (ts.devops ?? 0) / 10,
    (ts.mobile ?? 0) / 10,
    (ts.dataScience ?? 0) / 10,
    // Soft skills — normalized 0→1
    (ss.leadership ?? 0) / 10,
    (ss.communication ?? 0) / 10,
    (ss.problemSolving ?? 0) / 10,
    (ss.teamwork ?? 0) / 10,
    // Availability — binary
    av.mondayAfternoon ? 1 : 0,
    av.mondayEvening ? 1 : 0,
    av.tuesdayAfternoon ? 1 : 0,
    av.tuesdayEvening ? 1 : 0,
    av.wednesdayAfternoon ? 1 : 0,
    av.wednesdayEvening ? 1 : 0,
    av.thursdayAfternoon ? 1 : 0,
    av.thursdayEvening ? 1 : 0,
    weekendAvailable,
  ];
}

/**
 * Compute the dot product of two equal-length vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dotProduct(a, b) {
  return a.reduce((sum, val, i) => sum + val * (b[i] ?? 0), 0);
}

/**
 * Compute the L2 (Euclidean) magnitude of a vector.
 * @param {number[]} v
 * @returns {number}
 */
function magnitude(v) {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

/**
 * Cosine similarity between two vectors.
 * Returns a value in [-1, 1]; higher = more similar profiles.
 * Returns 0 if either vector is the zero vector.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/**
 * Extract a sub-vector spanning [startIdx, endIdx] (inclusive).
 * @param {number[]} v
 * @param {number} startIdx
 * @param {number} endIdx
 * @returns {number[]}
 */
function subVector(v, startIdx, endIdx) {
  return v.slice(startIdx, endIdx + 1);
}

/**
 * Complementarity score between two student vectors.
 *
 * For SKILL dimensions (0–10):
 *   Uses inverse of cosine similarity — different skills = higher score.
 *   complementarity = 1 - cosineSimilarity(skillsA, skillsB)
 *
 * For SCHEDULE dimensions (11–19):
 *   Uses direct cosine similarity — shared slots = higher score.
 *
 * Final score = weighted average: 0.6 * skillComp + 0.4 * scheduleMatch
 * Range: [0, 1]; higher = better pairing for a balanced team.
 *
 * @param {number[]} vectorA
 * @param {number[]} vectorB
 * @returns {number}
 */
export function complementarityScore(vectorA, vectorB) {
  if (!vectorA || !vectorB) return 0;

  const skillsA = subVector(vectorA, SKILL_DIMS.start, SKILL_DIMS.end);
  const skillsB = subVector(vectorB, SKILL_DIMS.start, SKILL_DIMS.end);
  const scheduleA = subVector(vectorA, SCHEDULE_DIMS.start, SCHEDULE_DIMS.end);
  const scheduleB = subVector(vectorB, SCHEDULE_DIMS.start, SCHEDULE_DIMS.end);

  // How different are their skills? (1 = completely different, 0 = identical)
  const skillComplement = 1 - Math.max(0, cosineSimilarity(skillsA, skillsB));

  // How much schedule overlap do they share? (1 = perfect overlap)
  const scheduleMatch = Math.max(0, cosineSimilarity(scheduleA, scheduleB));

  // If both schedules are zero vectors (no availability set), treat as neutral 0.5
  const magSchA = magnitude(scheduleA);
  const magSchB = magnitude(scheduleB);
  const effectiveScheduleMatch = magSchA === 0 || magSchB === 0 ? 0.5 : scheduleMatch;

  return 0.6 * skillComplement + 0.4 * effectiveScheduleMatch;
}

/**
 * Count the number of overlapping availability slots between two vectors.
 * Slots are dimensions 11–19; overlap = both have value 1.
 * @param {number[]} vectorA
 * @param {number[]} vectorB
 * @returns {number} Count of shared available slots (0–9)
 */
export function countScheduleOverlap(vectorA, vectorB) {
  if (!vectorA || !vectorB) return 0;
  let count = 0;
  for (let i = SCHEDULE_DIMS.start; i <= SCHEDULE_DIMS.end; i++) {
    if ((vectorA[i] ?? 0) === 1 && (vectorB[i] ?? 0) === 1) count++;
  }
  return count;
}

/**
 * Find the best complementary student IDs for a given anchor student,
 * from a pool of unassigned students, to fill a team of `teamSize`.
 *
 * Algorithm:
 *  1. Compute complementarityScore between anchor and every other student
 *  2. Require at least 2 overlapping schedule slots (minimum collaboration window)
 *  3. Sort by descending complementarity score
 *  4. Return top (teamSize - 1) student IDs
 *
 * @param {string} anchorStudentId
 * @param {Array<Object>} allStudents - Full student objects (must have .vector)
 * @param {number} teamSize
 * @returns {string[]} Array of student IDs (excluding anchor)
 */
export function findComplementaryMatches(anchorStudentId, allStudents, teamSize) {
  const anchor = allStudents.find((s) => s.id === anchorStudentId);
  if (!anchor) return [];

  const others = allStudents.filter((s) => s.id !== anchorStudentId);

  const scored = others.map((student) => {
    const score = complementarityScore(anchor.vector, student.vector);
    const overlap = countScheduleOverlap(anchor.vector, student.vector);
    return { id: student.id, score, overlap };
  });

  // Prefer students with at least 2 overlapping slots; soft-penalise those without
  const adjusted = scored.map((s) => ({
    ...s,
    adjustedScore: s.overlap >= 2 ? s.score : s.score * 0.6,
  }));

  adjusted.sort((a, b) => b.adjustedScore - a.adjustedScore);

  return adjusted.slice(0, teamSize - 1).map((s) => s.id);
}

/**
 * Compute how "complete" a set of student vectors is in covering
 * all 7 technical skill dimensions (0–6). Used to evaluate skill coverage.
 *
 * Returns a value in [0, 1]; 1 = every skill dimension is well covered.
 * @param {number[][]} vectors - Array of student vectors for a team
 * @returns {number}
 */
export function teamSkillCoverage(vectors) {
  if (!vectors || vectors.length === 0) return 0;
  const skillCount = SKILL_DIMS.end - SKILL_DIMS.start + 1; // 11

  let totalCoverage = 0;
  for (let dim = SKILL_DIMS.start; dim <= SKILL_DIMS.end; dim++) {
    const maxInDim = Math.max(...vectors.map((v) => v[dim] ?? 0));
    totalCoverage += maxInDim;
  }
  return totalCoverage / skillCount;
}

/**
 * Determine which critical skill roles are missing from a team.
 * "Missing" means no team member has >= 0.5 (score >= 5) in that skill dimension.
 *
 * @param {number[][]} vectors - Team member vectors
 * @param {string[]} requiredRoles - e.g. ['frontend','backend','uiux','qa']
 * @returns {string[]} Array of missing role names
 */
export function detectSkillGaps(vectors, requiredRoles = ['frontend', 'backend', 'uiux', 'qa']) {
  const roleDimMap = {
    frontend: 0,
    backend: 1,
    uiux: 2,
    qa: 3,
    devops: 4,
    mobile: 5,
    dataScience: 6,
  };

  const gaps = [];
  for (const role of requiredRoles) {
    const dim = roleDimMap[role];
    if (dim === undefined) continue;
    const maxScore = vectors.length > 0
      ? Math.max(...vectors.map((v) => v[dim] ?? 0))
      : 0;
    if (maxScore < 0.5) {
      gaps.push(role);
    }
  }
  return gaps;
}
