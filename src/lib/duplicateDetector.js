/**
 * /lib/duplicateDetector.js
 * Vector Platform — Project Duplicate Detection
 *
 * Converts project title + description into a 50-dimension keyword TF
 * (Term Frequency) vector, then uses cosine similarity to flag duplicates.
 *
 * Threshold: similarity > 0.75 → flagged as duplicate → claim is blocked.
 */

// ─── Keyword Dimension List (50 keywords) ────────────────────────────────────
// Each index corresponds to one dimension in the project vector.
export const KEYWORDS = [
  'management',   // 0
  'system',       // 1
  'platform',     // 2
  'tracking',     // 3
  'monitoring',   // 4
  'inventory',    // 5
  'booking',      // 6
  'scheduling',   // 7
  'ecommerce',    // 8
  'marketplace',  // 9
  'mobile',       // 10
  'web',          // 11
  'dashboard',    // 12
  'analytics',    // 13
  'reporting',    // 14
  'student',      // 15
  'hospital',     // 16
  'library',      // 17
  'restaurant',   // 18
  'hotel',        // 19
  'healthcare',   // 20
  'finance',      // 21
  'education',    // 22
  'social',       // 23
  'network',      // 24
  'chat',         // 25
  'recommendation', // 26
  'machine learning', // 27
  'ai',           // 28
  'automation',   // 29
  'delivery',     // 30
  'payment',      // 31
  'notification', // 32
  'authentication', // 33
  'admin',        // 34
  'portal',       // 35
  'database',     // 36
  'api',          // 37
  'integration',  // 38
  'real-time',    // 39
  'cloud',        // 40
  'iot',          // 41
  'sensor',       // 42
  'game',         // 43
  'quiz',         // 44
  'feedback',     // 45
  'survey',       // 46
  'attendance',   // 47
  'grade',        // 48
  'course',       // 49
];

const DUPLICATE_THRESHOLD = 0.45;

// Synonym groups — keywords that expand each other's matches
// When one term appears, related terms get a fractional boost
const SYNONYM_GROUPS = [
  ['hospital', 'healthcare', 'medical', 'clinic', 'patient'],
  ['management', 'platform', 'system', 'portal'],
  ['tracking', 'monitoring', 'reporting'],
  ['booking', 'scheduling', 'appointment'],
  ['ecommerce', 'marketplace', 'shop', 'store'],
  ['student', 'education', 'university', 'academic', 'course'],
  ['delivery', 'shipping', 'logistics'],
  ['recommendation', 'ai', 'machine learning'],
  ['attendance', 'grade', 'student'],
  ['restaurant', 'hotel', 'hospitality'],
  ['dashboard', 'analytics', 'reporting'],
  ['authentication', 'admin', 'portal'],
];

/**
 * Build a synonym-expanded keyword dimension map.
 * Returns a record of { keywordIndex: boostValue } for synonyms found in text.
 * @param {string} text
 * @returns {Record<number, number>}
 */
function buildSynonymBoosts(text) {
  const boosts = {};
  for (const group of SYNONYM_GROUPS) {
    const foundInGroup = group.filter((term) => text.includes(term));
    if (foundInGroup.length > 0) {
      // Boost all group members that appear as keywords
      for (const term of group) {
        const idx = KEYWORDS.indexOf(term);
        if (idx !== -1) {
          const alreadyPresent = text.includes(term);
          // Only add a synonym boost if the term is NOT already present (avoid double-counting)
          if (!alreadyPresent) {
            boosts[idx] = (boosts[idx] ?? 0) + 0.3 * foundInGroup.length;
          }
        }
      }
    }
  }
  return boosts;
}


// ─── Vector Math ─────────────────────────────────────────────────────────────

function dotProduct(a, b) {
  return a.reduce((sum, val, i) => sum + val * (b[i] ?? 0), 0);
}

function magnitude(v) {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Build a 50-dimension vector for a project.
 *
 * Each dimension combines:
 *   - Binary presence in title   (weight 3× — topic identity)
 *   - TF in full text            (weight 1× — frequency signal)
 *   - Binary presence in body    (weight 1× — coverage signal)
 *   - Synonym boosts             (weight up to 0.9 — semantic expansion)
 *
 * Final value per dimension normalised to [0, 1].
 *
 * @param {string} title
 * @param {string} description
 * @returns {number[]} 50-element vector
 */
export function buildProjectVector(title, description) {
  const cleanTitle = (title ?? '').toLowerCase().replace(/[^a-z0-9\s\-]/g, ' ');
  const cleanBody = (description ?? '').toLowerCase().replace(/[^a-z0-9\s\-]/g, ' ');

  const bodyWords = cleanBody.split(/\s+/).filter(Boolean);
  const totalBodyWords = bodyWords.length || 1;

  const synonymBoosts = buildSynonymBoosts(`${cleanTitle} ${cleanBody}`);

  return KEYWORDS.map((kw, idx) => {
    const escaped = kw.replace(/[-]/g, '\\-').replace(/\s+/g, '\\s+');
    const regex = new RegExp(escaped, 'gi');

    // Title boost: keyword appears in title → strong signal
    const titleMatches = (cleanTitle.match(regex) || []).length;
    const titleBoost = titleMatches > 0 ? 3 : 0;

    // Body TF: how often keyword appears per word in body (scaled)
    const bodyMatches = (cleanBody.match(regex) || []).length;
    const tfScore = (bodyMatches / totalBodyWords) * 50;

    // Binary presence in body
    const bodyPresence = bodyMatches > 0 ? 1 : 0;

    // Synonym boost from related terms
    const synBoost = synonymBoosts[idx] ?? 0;

    // Combine and normalise to [0, 1]
    const raw = (titleBoost + tfScore + bodyPresence + synBoost) / 5;
    return Math.min(1, raw);
  });
}



/**
 * Check whether a new project is a duplicate of any existing project.
 *
 * @param {{ title: string, description: string }} newProject
 * @param {Array<{ id: string, title: string, duplicateCheckVector: number[] }>} existingProjects
 * @returns {{
 *   isDuplicate: boolean,
 *   similarProjects: Array<{ id: string, title: string, similarity: number }>,
 *   highestSimilarity: number,
 *   newVector: number[]
 * }}
 */
export function checkDuplicate(newProject, existingProjects) {
  const newVector = buildProjectVector(newProject.title, newProject.description);

  const similarities = existingProjects
    .filter((p) => p.duplicateCheckVector && p.duplicateCheckVector.length > 0)
    .map((p) => ({
      id: p.id,
      title: p.title,
      similarity: cosineSimilarity(newVector, p.duplicateCheckVector),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const highestSimilarity = similarities.length > 0 ? similarities[0].similarity : 0;
  const similarProjects = similarities.filter((p) => p.similarity > DUPLICATE_THRESHOLD);

  return {
    isDuplicate: similarProjects.length > 0,
    similarProjects,
    highestSimilarity,
    newVector,
  };
}

/**
 * Return the duplicate similarity threshold constant for UI display.
 * @returns {number}
 */
export function getDuplicateThreshold() {
  return DUPLICATE_THRESHOLD;
}
