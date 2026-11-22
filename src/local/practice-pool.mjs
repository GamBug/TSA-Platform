// The separate practice pool for original questions written with ChatGPT (owner decision 2026-11-20).
// The pool is one taxonomy version of its own. The demo offers it only as extra section practice and never uses it for
// the full simulation, so the real 40/20/40 test keeps drawing from real published content only.
// Each pasted file becomes its own OWNED source version, so a published question can always be traced to its file.

export const PRACTICE_POOL_NAME = 'TSA practice pool - ChatGPT originals v1';
export const PRACTICE_POOL_DOMAINS = Object.freeze([
  Object.freeze({ domain: 'MATH', skills: Object.freeze(['MATH_REASONING']) }),
  Object.freeze({ domain: 'READING', skills: Object.freeze(['READING_REASONING']) }),
  Object.freeze({ domain: 'SCIENCE', skills: Object.freeze(['SCIENCE_REASONING']) }),
]);
/** Every question of a subject goes to that subject's one skill; the author's topic stays in the provenance text. */
export const poolSkill = (subject) => `${subject}_REASONING`;

/** Source titles of pasted files start with this prefix; owner publication accepts them alongside corpus sources. */
export const ORIGINAL_SOURCE_PREFIX = 'Practice original ';
export const ORIGINAL_RIGHTS = Object.freeze({
  status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2026-11-19T17:00:00Z', validTo: null,
  evidence: 'Original practice question written for the project owner with ChatGPT and imported from the owner\'s question inbox. '
    + 'Not copied from an exam, textbook or website. The owner reviews every question before publication. '
    + 'Recorded in docs/decisions/OPEN_DECISIONS.md, 2026-11-20.',
});

/**
 * Files whose batch id starts with SRC- are transcriptions: ChatGPT copied the questions from pictures or PDFs the owner
 * supplied (owner decision 2026-11-22). They stay in the same separate pool, but their source is recorded as external
 * corpus material under the owner's attested permission, never as an original work. The "Corpus " title prefix is what
 * owner publication accepts for corpus sources.
 */
export const TRANSCRIPTION_BATCH_PREFIX = 'SRC-';
export const TRANSCRIBED_SOURCE_PREFIX = 'Corpus transcription ';
export const TRANSCRIBED_RIGHTS = Object.freeze({
  status: 'LICENSED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2026-11-10T17:00:00Z', validTo: null,
  evidence: 'Questions transcribed with ChatGPT from pictures or PDFs the project owner supplied, imported from the owner\'s '
    + 'question inbox. The owner attests that the material is covered by the non-profit corpus permission recorded as '
    + 'OWNER_ATTESTED in docs/decisions/OPEN_DECISIONS.md (2026-11-11) and accepts responsibility. Keys solved by AI are '
    + 'reviewed by the owner before publication. Recorded in docs/decisions/OPEN_DECISIONS.md, 2026-11-22.',
});

/** True when a pasted question set is a transcription of supplied material rather than original work. Pure. */
export const isTranscription = (document) => typeof document?.batch_id === 'string' && document.batch_id.startsWith(TRANSCRIPTION_BATCH_PREFIX);

/** Offerings drawn from the pool carry this suffix so students can tell them from the real-content practice. */
export const PRACTICE_POOL_OFFERING_SUFFIX = ' — câu hỏi luyện thêm';

/** The pool's taxonomy version id, or null while it is not registered. Read-only. */
export async function findPracticePool(client) {
  return (await client.query('SELECT id FROM tsa.taxonomy_versions WHERE name = $1', [PRACTICE_POOL_NAME])).rows[0]?.id ?? null;
}
