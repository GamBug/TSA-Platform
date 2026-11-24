// Read-only snapshot of the whole Bank for the local admin page: every question version in every workflow state,
// with its answer key, explanation, passage and image metadata. It is read with the migration-owner connection while
// that connection is open at startup (or from the retained Bank after an admin job) and kept in memory; request
// handlers never hold a database connection that can read private keys.

import { findPracticePool } from '../practice-pool.mjs';

const SNAPSHOT_SQL = `
  SELECT v.id, v.question_id, v.version_no, v.schema_version, v.section::text AS section, v.domain_id, v.skill_ids,
         v.cognitive_level::text AS cognitive_level, v.difficulty, v.content, v.interaction, v.origin::text AS origin,
         v.created_by, v.created_at, v.stimulus_version_id, v.taxonomy_version_id,
         t.name AS taxonomy_name, t.version_no AS taxonomy_version_no,
         COALESCE(w.state::text, 'DRAFT') AS state, w.quarantine_reason,
         (q.eligible_version_id = v.id) AS eligible,
         s.answer_key, s.explanation,
         sv.content AS stimulus_content,
         r.exchange_question_id, r.batch_id,
         (SELECT array_agg(DISTINCT src.title ORDER BY src.title)
            FROM tsa.question_provenance p
            JOIN tsa.source_versions srcv ON srcv.id = p.source_version_id
            JOIN tsa.sources src ON src.id = srcv.source_id
           WHERE p.question_version_id = v.id) AS source_titles
    FROM tsa.question_versions v
    JOIN tsa.questions q ON q.id = v.question_id
    JOIN tsa.taxonomy_versions t ON t.id = v.taxonomy_version_id
    LEFT JOIN tsa.question_workflow w ON w.question_version_id = v.id
    LEFT JOIN tsa_private.question_secrets s ON s.question_version_id = v.id
    LEFT JOIN tsa.stimulus_versions sv ON sv.id = v.stimulus_version_id
    LEFT JOIN tsa_private.exchange_import_receipts r ON r.question_version_id = v.id
   ORDER BY v.section, v.created_at, v.question_id, v.version_no`;

const IMAGE_SQL = `
  SELECT a.id, a.content_hash, a.mime, a.byte_size, l.asset_code
    FROM tsa.asset_versions a
    LEFT JOIN tsa.image_asset_versions l ON l.asset_version_id = a.id
   WHERE a.mime IN ('image/png', 'image/jpeg', 'image/webp')`;

// The owner works with three states (decision 2026-11-24). IN_REVIEW is a draft waiting for Publish; REJECTED and
// RETIRED versions are out of service like a withheld one. The Bank keeps its own states underneath.
const ADMIN_STATES = Object.freeze({ DRAFT: 'DRAFT', IN_REVIEW: 'DRAFT', APPROVED: 'APPROVED', QUARANTINED: 'QUARANTINED',
  REJECTED: 'QUARANTINED', RETIRED: 'QUARANTINED' });
export const adminState = (state) => ADMIN_STATES[state] ?? 'QUARANTINED';

/** The short id the owner searches for: the exchange id of an imported question, else Q- and its first 8 hex digits. Pure. */
export const displayId = (exchangeId, questionId) => exchangeId ?? `Q-${String(questionId).slice(0, 8).toUpperCase()}`;

/** Every image asset version id used anywhere in a version (stem, options, passage, explanation). Pure. */
export function imageIds(...values) {
  const found = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    if (value.type === 'image' && typeof value.assetVersionId === 'string') found.add(value.assetVersionId);
    Object.values(value).forEach(walk);
  };
  values.forEach(walk);
  return [...found];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Plain text of content blocks, for search and list previews. Pure. */
export function blocksText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return '';
    if (block.type === 'text') return block.text ?? '';
    if (block.type === 'math') return block.tex ?? '';
    if (block.type === 'table') return [block.caption, ...(block.headers ?? []), ...(block.rows ?? []).flat()].filter(Boolean).join(' ');
    if (block.type === 'image') return block.alt ?? '';
    return '';
  }).join(' ').replace(/\s+/g, ' ').trim();
}

function toDetail(row) {
  return Object.freeze({
    versionId: row.id,
    questionId: row.question_id,
    versionNo: row.version_no,
    schemaVersion: row.schema_version,
    section: row.section,
    state: adminState(row.state),
    workflowState: row.state,
    displayId: displayId(row.exchange_question_id ?? null, row.question_id),
    eligible: row.eligible === true,
    quarantineReason: row.quarantine_reason ?? null,
    domainId: row.domain_id,
    skillIds: row.skill_ids ?? [],
    cognitiveLevel: row.cognitive_level ?? null,
    difficulty: row.difficulty ?? null,
    interactionType: row.interaction?.type ?? 'UNKNOWN',
    content: row.content ?? [],
    interaction: row.interaction ?? {},
    passage: row.stimulus_content ?? null,
    stimulusVersionId: row.stimulus_version_id ?? null,
    answerKey: row.answer_key ?? null,
    explanation: row.explanation ?? [],
    origin: row.origin,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    taxonomy: `${row.taxonomy_name} v${row.taxonomy_version_no}`,
    taxonomyName: row.taxonomy_name,
    taxonomyVersionId: row.taxonomy_version_id,
    exchangeId: row.exchange_question_id ?? null,
    batchId: row.batch_id ?? null,
    sources: row.source_titles ?? [],
  });
}

/** The list row the page filters and searches; the full version comes from detail(). Pure. */
export function toSummary(detail) {
  return Object.freeze({
    versionId: detail.versionId,
    questionId: detail.questionId,
    versionNo: detail.versionNo,
    displayId: detail.displayId,
    imageCodes: Object.values(detail.imageCodes),
    section: detail.section,
    state: detail.state,
    eligible: detail.eligible,
    interactionType: detail.interactionType,
    domainId: detail.domainId,
    taxonomy: detail.taxonomy,
    taxonomyName: detail.taxonomyName,
    exchangeId: detail.exchangeId,
    hasPassage: detail.passage !== null,
    hasKey: detail.answerKey !== null,
    preview: blocksText(detail.content).slice(0, 220),
    createdAt: detail.createdAt,
  });
}

/** Read the whole Bank through a connection that may read private keys (the migration owner). */
export async function readBankSnapshot(pool) {
  const [versions, images, practicePoolTaxonomyId] = await Promise.all([pool.query(SNAPSHOT_SQL), pool.query(IMAGE_SQL),
    findPracticePool(pool)]);
  const codeOf = new Map(images.rows.map((row) => [row.id, row.asset_code ?? `IMG-${row.id.slice(0, 8).toUpperCase()}`]));
  // Each version carries the readable code of every image it shows, keyed by asset version id.
  const details = versions.rows.map((row) => {
    const detail = toDetail(row);
    const codes = Object.fromEntries(imageIds(detail.content, detail.interaction, detail.passage, detail.explanation)
      .map((id) => [id, codeOf.get(id) ?? `IMG-${id.slice(0, 8).toUpperCase()}`]));
    return Object.freeze({ ...detail, imageCodes: Object.freeze(codes) });
  });
  const byId = new Map(details.map((detail) => [detail.versionId, detail]));
  const imageMeta = new Map(images.rows.map((row) => [row.id,
    Object.freeze({ contentHash: row.content_hash, mediaType: row.mime, byteSize: Number(row.byte_size) })]));
  const counts = {};
  for (const detail of details) {
    counts[detail.section] ??= {};
    counts[detail.section][detail.state] = (counts[detail.section][detail.state] ?? 0) + 1;
  }
  return Object.freeze({
    readAt: new Date().toISOString(),
    practicePoolTaxonomyId,
    total: details.length,
    counts,
    summaries: Object.freeze(details.map(toSummary)),
    detail: (versionId) => (UUID.test(versionId ?? '') ? byId.get(versionId) ?? null : null),
    image: (assetVersionId) => (UUID.test(assetVersionId ?? '') ? imageMeta.get(assetVersionId) ?? null : null),
  });
}
