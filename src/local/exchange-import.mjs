// Import validated exchange questions (tsa-question/1) into the Bank as DRAFTs through the existing author route.
// Planning is read-only and all-or-nothing: any problem in the set stops the whole import before anything is written.
// Nothing here submits, reviews, approves or publishes, and no source or rights record is created or changed.
import { createHash } from 'node:crypto';
import { INTERNAL_SCHEMA_BY_TYPE, toInternalParts } from '../../packages/contracts/dist/question-exchange.js';
import { validateExchange } from '../../tools/question-bank/validate.mjs';
import { activeAssetCodes, ensureAssetVersion, getImageAsset } from '../modules/bank/image-library.mjs';
import { ensureStimulus, passageHash, passageImageIds } from './exchange-passage.mjs';

export const IMPORT_ROUTE = Object.freeze({ 'question/1': 'v1', 'question/2': 'v2', 'question/3': 'v4' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function importConfirmation(count) { return `IMPORT ${count}`; }

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
};
export const questionHash = (question) => `sha256:${createHash('sha256').update(JSON.stringify(sortKeys(question))).digest('hex')}`;

/** Image ids with the purpose they are shown for: prompt, options and statements are QUESTION; the explanation is EXPLANATION. */
export function imageUses(question) {
  const uses = [];
  const walk = (blocks, purpose) => { for (const block of blocks) if (block.type === 'image') uses.push({ assetId: block.asset_id, purpose }); };
  walk(question.content_blocks, 'QUESTION');
  walk(question.explanation, 'EXPLANATION');
  for (const option of question.options ?? []) walk(option.content_blocks, 'QUESTION');
  for (const statement of question.response_config?.statements ?? []) walk(statement.content_blocks, 'QUESTION');
  return uses;
}

async function libraryCodes(client) {
  const present = (await client.query(`SELECT to_regclass('tsa.image_assets') AS name`)).rows[0].name !== null;
  return present ? activeAssetCodes(client) : [];
}

/**
 * Read-only plan. `problems` is empty only when every question can be imported. Each item says what would happen:
 * CREATE (new Bank question), NEW_VERSION (higher content_version of an imported question) or SKIP (already imported).
 */
export async function planExchangeImport(client, document, { sourceVersionId, topicMap = {}, taxonomyVersionId = null } = {}) {
  const problems = [];
  const items = [];
  const problem = (questionId, code, message) => problems.push({ questionId, code, message });
  if (typeof sourceVersionId !== 'string' || !UUID.test(sourceVersionId)) {
    return { ok: false, problems: [{ questionId: null, code: 'SOURCE_VERSION_REQUIRED', message: 'Name an existing source version with --source-version <uuid>' }], items, report: null };
  }
  const report = validateExchange(document, { assets: await libraryCodes(client) });
  if (!report.ok) {
    for (const issue of report.errors) problem(null, issue.code, `${issue.path || '(document)'}: ${issue.message}`);
    return { ok: false, problems, items, report };
  }
  const set = report.value;

  const source = (await client.query(`SELECT sv.id, sr.decision_id FROM tsa.source_versions sv LEFT JOIN tsa.source_rights sr ON sr.source_version_id = sv.id WHERE sv.id = $1`,
    [sourceVersionId])).rows[0];
  if (!source) problem(null, 'SOURCE_VERSION_NOT_FOUND', 'The named source version does not exist');
  else if (!source.decision_id) problem(null, 'SOURCE_RIGHTS_MISSING', 'The named source version has no recorded rights decision; this importer never creates one');

  const receipts = (await client.query(`SELECT r.exchange_question_id, r.content_version, r.document_hash, r.question_id, r.question_version_id, w.state::text AS state
      FROM tsa_private.exchange_import_receipts r JOIN tsa.question_workflow w ON w.question_version_id = r.question_version_id
     WHERE r.exchange_question_id = ANY($1::text[]) ORDER BY r.exchange_question_id, r.content_version DESC`, [set.questions.map((question) => question.question_id)])).rows;
  const latest = new Map();
  for (const receipt of receipts) if (!latest.has(receipt.exchange_question_id)) latest.set(receipt.exchange_question_id, receipt);

  for (const question of set.questions) {
    const id = question.question_id;
    const passage = question.passage_ref === undefined ? null : set.passages.find((candidate) => candidate.passage_id === question.passage_ref) ?? null;
    if (passage) {
      for (const assetId of new Set(passageImageIds(passage))) {
        let asset;
        try { asset = await getImageAsset(client, assetId); } catch (error) { problem(id, error.code ?? 'ASSET_NOT_FOUND', `Passage ${passage.passage_id}: ${error.message}`); continue; }
        if (asset.status !== 'ACTIVE') problem(id, 'ASSET_RETIRED', `Image asset ${assetId} in passage ${passage.passage_id} is retired and cannot be used in new questions`);
      }
      if ([...passage.content_blocks].some((block) => block.type === 'image_request')) problem(id, 'ASSET_REQUIRED', `Passage ${passage.passage_id} has an image_request block; register the image and replace the block first`);
    }
    if ([...question.content_blocks, ...question.explanation].some((block) => block.type === 'image_request')) {
      problem(id, 'ASSET_REQUIRED', 'The question has an image_request block; register the image and replace the block with an image block first');
    }
    const skillCode = topicMap[question.topic] ?? question.topic;
    const candidates = (await client.query(`SELECT tv.id AS taxonomy_version_id, d.id AS domain_node, s.id AS skill_node
        FROM tsa.taxonomy_versions tv
        JOIN tsa.taxonomy_nodes d ON d.taxonomy_version_id = tv.id AND d.kind = 'DOMAIN' AND d.code = $1
        JOIN tsa.taxonomy_nodes s ON s.taxonomy_version_id = tv.id AND s.kind = 'SKILL' AND s.parent_id = d.id AND s.code = $2
       WHERE ($3::uuid IS NULL OR tv.id = $3) ORDER BY tv.id`, [question.subject, skillCode, taxonomyVersionId])).rows;
    let taxonomy = null;
    if (candidates.length === 1) taxonomy = candidates[0];
    else if (candidates.length === 0) {
      const available = (await client.query(`SELECT DISTINCT s.code FROM tsa.taxonomy_nodes s JOIN tsa.taxonomy_nodes d ON d.id = s.parent_id AND d.taxonomy_version_id = s.taxonomy_version_id
        WHERE s.kind = 'SKILL' AND d.kind = 'DOMAIN' AND d.code = $1 ORDER BY s.code`, [question.subject])).rows.map((row) => row.code);
      problem(id, 'TOPIC_UNMAPPED', `Topic ${question.topic} is not a registered ${question.subject} skill${taxonomyVersionId ? ' in that taxonomy version' : ''}. Registered skills: ${available.join(', ') || '(none)'}. Map it with --topic-map or fix the topic`);
    } else problem(id, 'TOPIC_AMBIGUOUS', `Topic ${question.topic} exists in ${candidates.length} taxonomy versions; choose one with --taxonomy-version`);

    for (const use of imageUses(question)) {
      let asset;
      try { asset = await getImageAsset(client, use.assetId); } catch (error) { problem(id, error.code ?? 'ASSET_NOT_FOUND', error.message); continue; }
      if (asset.status !== 'ACTIVE') problem(id, 'ASSET_RETIRED', `Image asset ${use.assetId} is retired and cannot be used in new questions`);
    }

    // A passage change must not hide behind an unchanged question, so the passage is part of the hash. Questions without a passage keep their original hash.
    const hash = passage ? questionHash({ question, passage: passageHash(passage) }) : questionHash(question);
    const previous = latest.get(id);
    const version = question.metadata.content_version;
    let action = 'CREATE';
    let parent = null;
    if (previous) {
      if (version === previous.content_version) {
        if (previous.document_hash === hash) action = 'SKIP';
        else problem(id, 'CONTENT_VERSION_CONFLICT', `${id} content_version ${version} was already imported with different content; raise content_version for a changed question`);
      } else if (version < previous.content_version) {
        problem(id, 'CONTENT_VERSION_REGRESSION', `${id} content_version ${version} is lower than the imported version ${previous.content_version}`);
      } else {
        action = 'NEW_VERSION';
        // The Bank question may have gained versions that are not imports (a correction), and a new version must follow the latest.
        const latestVersion = (await client.query(`SELECT v.id, w.state::text AS state FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id = v.id
          WHERE v.question_id = $1 ORDER BY v.version_no DESC LIMIT 1`, [previous.question_id])).rows[0];
        parent = { questionId: previous.question_id, versionId: latestVersion.id, contentVersion: previous.content_version };
        if (latestVersion.state === 'QUARANTINED') problem(id, 'PARENT_QUARANTINED', 'The latest imported version is quarantined, so a new version of it could never be served; import it as a new question id instead');
      }
    }
    items.push({ questionId: id, action, contentVersion: version, documentHash: hash, schemaVersion: INTERNAL_SCHEMA_BY_TYPE[question.question_type], taxonomy, parent, question, passage });
  }
  return { ok: problems.length === 0, problems, items, report };
}

/**
 * Build the author draft for each item that will be written. Explanation images need their own asset version and a
 * passage needs its stimulus; both are created here on the maintenance connection (the only writes before the draft
 * routes run), and both are found again rather than copied when an import is repeated.
 */
export async function materializeDrafts(ownerPool, plan, { sourceVersionId, batchId }) {
  const rights = (await ownerPool.query('SELECT decision_id FROM tsa.source_rights WHERE source_version_id = $1', [sourceVersionId])).rows[0].decision_id;
  const drafts = [];
  const stimuli = new Map();
  for (const item of plan.items.filter((entry) => entry.action !== 'SKIP')) {
    const resolved = new Map();
    for (const use of imageUses(item.question)) {
      const key = `${use.assetId}|${use.purpose}`;
      if (!resolved.has(key)) resolved.set(key, await ensureAssetVersion(ownerPool, use.assetId, use.purpose));
    }
    let stimulusVersionId = null;
    if (item.passage) {
      if (!stimuli.has(item.passage.passage_id)) stimuli.set(item.passage.passage_id, await ensureStimulus(ownerPool, item.passage, { sourceVersionId, rightsDecisionId: rights }));
      stimulusVersionId = stimuli.get(item.passage.passage_id);
    }
    const parts = toInternalParts(item.question, (assetId, purpose) => resolved.get(`${assetId}|${purpose}`));
    const question = item.question;
    const tags = question.tags.length ? ` tags: ${question.tags.join(', ')};` : '';
    drafts.push({
      item,
      draft: {
        schemaVersion: parts.schemaVersion, language: 'vi-VN', section: parts.section,
        taxonomyVersionId: item.taxonomy.taxonomy_version_id, domainId: item.taxonomy.domain_node, skillIds: [item.taxonomy.skill_node], subskillIds: [],
        cognitiveLevel: null, targetDifficulty: parts.targetDifficulty, content: parts.content, stimulusVersionId,
        interaction: parts.interaction, answerKey: parts.answerKey, explanation: parts.explanation,
        evidenceRefs: [rights], origin: 'MANUAL',
        provenance: [{ sourceVersionId, span: null,
          transformation: `Imported from exchange batch ${batchId}: question ${question.question_id}, content_version ${question.metadata.content_version};${tags} topic ${question.topic}${question.subtopic ? `; subtopic ${question.subtopic}` : ''}`.slice(0, 4_000) }],
      },
    });
  }
  return drafts;
}
