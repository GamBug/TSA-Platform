// Owner publication of corpus DRAFTs in the retained Bank (OPEN_DECISIONS, 2026-11-11).
// Runtime publication stays disabled; this owner maintenance path runs on the migration
// owner connection and repeats every application publication check before approving.
import { createHash, randomUUID } from 'node:crypto';
import { resolveOriginalImportAttribution } from '../modules/bank/import-attribution.mjs';
import { appendWorkflowAudit, assertPublicationChecks, assertSingletonAllowed, loadWorkflowTarget } from '../modules/bank/publication-gates.mjs';
import { recordEquivalenceIncidents } from '../modules/bank/equivalence-incidents.mjs';
import { withTransaction } from '../modules/database/pool.mjs';
import { ORIGINAL_SOURCE_PREFIX } from './practice-pool.mjs';

export const OWNER_REVIEWER_ID = '00000000-0000-4000-8000-000000000202';
export const OWNER_SECTIONS = Object.freeze(['MATH', 'READING', 'SCIENCE']);
export const OWNER_RIGHTS = Object.freeze({
  status: 'LICENSED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2026-11-10T17:00:00Z', validTo: null,
  evidence: 'Project owner attestation, 2026-11-11: the source permits non-profit use of this corpus. The owner holds '
    + 'the written evidence privately and accepts responsibility. Recorded as OWNER_ATTESTED in docs/decisions/OPEN_DECISIONS.md.',
});
const APPROVAL_REASON = 'Owner approval through the owner publication command (the project owner operating the local reviewer '
  + 'account). Corpus permission OWNER_ATTESTED, docs/decisions/OPEN_DECISIONS.md 2026-11-11; owner practice originals, 2026-11-20. '
  + 'The owner is responsible for reviewing the stored keys, including agent-derived and AI-written keys.';
const RUBRIC = Object.freeze(Object.fromEntries(
  ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true])));

/** The exact confirmation phrase the owner must type for one publication run. */
export function confirmationPhrase(count, section) {
  return `PUBLISH ${count} ${section ?? 'ALL'}`;
}

// Corpus documents (2026-11-11) and the owner's own ChatGPT practice originals (2026-11-20) are publishable sources.
const CORPUS_TITLE = `s.title LIKE 'Corpus %'`;
const PUBLISHABLE_SOURCES = `SELECT sv.id FROM tsa.source_versions sv JOIN tsa.sources s ON s.id=sv.source_id
  WHERE ${CORPUS_TITLE} OR (s.title LIKE '${ORIGINAL_SOURCE_PREFIX}%' AND s.origin='OWNED')`;

/**
 * Latest unpublished imported or exchange versions whose every source is a corpus or practice-original source. A later
 * version the owner made of an exchange-imported question (for example after moving it to another section) counts as
 * an exchange version. Read-only.
 */
export async function listOwnerCandidates(client, { section = null } = {}) {
  if (section !== null && !OWNER_SECTIONS.includes(section)) throw new TypeError('section must be MATH, READING or SCIENCE');
  const versions = (await client.query(`
    SELECT v.id, v.section::text AS section, w.state::text AS state, w.revision::integer AS revision,
           v.content_hash AS "contentHash", v.created_by AS "createdBy", v.stimulus_version_id AS "stimulusVersionId",
           v.schema_version AS "schemaVersion",
           (EXISTS(SELECT 1 FROM tsa.question_assets qa WHERE qa.question_version_id=v.id)
             OR EXISTS(SELECT 1 FROM tsa.stimulus_assets sa WHERE sa.stimulus_version_id=v.stimulus_version_id)) AS "hasImages",
           ARRAY(SELECT s.id FROM tsa.bank_question_sources(v.id) s ORDER BY s.id) AS "sourceVersionIds",
           EXISTS(SELECT 1 FROM tsa.duplicate_group_members m WHERE m.question_id=v.question_id) AS grouped,
           EXISTS(SELECT 1 FROM tsa.bundle_members bm WHERE bm.question_version_id=v.id) AS bundled
      FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id
     WHERE (v.origin='IMPORTED' OR (v.origin='MANUAL' AND EXISTS
       (SELECT 1 FROM tsa_private.exchange_import_receipts er JOIN tsa.question_versions ev ON ev.id=er.question_version_id
         WHERE ev.question_id=v.question_id))) AND w.state IN ('DRAFT','IN_REVIEW') AND ($1::text IS NULL OR v.section::text=$1)
       AND NOT EXISTS(SELECT 1 FROM tsa.question_versions newer
         WHERE newer.question_id=v.question_id AND newer.version_no>v.version_no)
       AND EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) s)
       AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) s WHERE s.id NOT IN (${PUBLISHABLE_SOURCES}))
     ORDER BY v.section, v.id`, [section])).rows;
  const sources = (await client.query(`
    SELECT DISTINCT qs.id, COALESCE(sr.revision,0)::integer AS revision, tsa.bank_source_display_allowed(qs.id) AS allowed,
           (${CORPUS_TITLE}) AS corpus
      FROM unnest($1::uuid[]) v(id) CROSS JOIN LATERAL tsa.bank_question_sources(v.id) qs
      JOIN tsa.source_versions sv ON sv.id=qs.id JOIN tsa.sources s ON s.id=sv.source_id
      LEFT JOIN tsa.source_rights sr ON sr.source_version_id=qs.id ORDER BY qs.id`, [versions.map((row) => row.id)])).rows;
  return { versions, sources };
}

/** Create one ordered bundle per shared passage whose questions are all imported and not yet bundled. */
export async function createPassageBundles(ownerPool, stimulusVersionIds) {
  let created = 0;
  for (const stimulusVersionId of [...new Set(stimulusVersionIds)].sort()) {
    await withTransaction(ownerPool, async (client) => {
      const members = (await client.query(`
        SELECT v.id, EXISTS(SELECT 1 FROM tsa.bundle_members bm WHERE bm.question_version_id=v.id) AS bundled
          FROM tsa.question_versions v
          LEFT JOIN tsa_private.factory_import_receipts r ON r.question_version_id=v.id
          LEFT JOIN tsa_private.exchange_import_receipts er ON er.question_version_id=v.id
         WHERE v.stimulus_version_id=$1 AND (r.question_version_id IS NOT NULL OR er.question_version_id IS NOT NULL)
         ORDER BY er.exchange_question_id, r.batch_key, r.item_key, r.candidate_ordinal, v.version_no, v.id`, [stimulusVersionId])).rows;
      const all = (await client.query('SELECT count(*)::integer AS n FROM tsa.question_versions WHERE stimulus_version_id=$1', [stimulusVersionId])).rows[0].n;
      if (members.length === 0 || members.length !== all || members.some((member) => member.bundled)) return;
      const ids = members.map((member) => member.id), bundleId = randomUUID();
      await client.query('INSERT INTO tsa.bundles(id,stimulus_version_id,content_hash) VALUES($1,$2,$3)',
        [bundleId, stimulusVersionId, `sha256:${createHash('sha256').update(JSON.stringify(ids)).digest('hex')}`]);
      for (const [ordinal, id] of ids.entries()) {
        await client.query('INSERT INTO tsa.bundle_members(bundle_id,question_version_id,ordinal) VALUES($1,$2,$3)', [bundleId, id, ordinal]);
      }
      created += 1;
    });
  }
  return created;
}

/** Record that an IN_REVIEW version has no equivalent, as the reviewer service does. */
export async function ownerConfirmSingleton(ownerPool, versionId, { reviewerId = OWNER_REVIEWER_ID, recordExisting = false } = {}) {
  return withTransaction(ownerPool, async (client) => {
    const target = await loadWorkflowTarget(client, versionId);
    if (target.state !== 'IN_REVIEW') throw new Error(`Version ${versionId} is ${target.state}, not IN_REVIEW`);
    const attribution = await resolveOriginalImportAttribution(client, target);
    if (reviewerId === attribution.created_by || reviewerId === attribution.operator_id) {
      throw new Error('The confirming account must differ from the author and import operator');
    }
    const existing = await client.query('SELECT group_id FROM tsa.duplicate_group_members WHERE question_id=$1', [target.question_id]);
    const reason = 'Owner publication: one corpus item, no other version or equivalent exists.';
    if (existing.rowCount) {
      // A new version of an already confirmed question needs its own confirmation event, as the reviewer route records.
      if (!recordExisting) return false;
      await assertSingletonAllowed(client, target);
      await appendWorkflowAudit(client, { userId: reviewerId }, target, 'BANK_CONFIRM_SINGLETON', target.revision, reason);
      return true;
    }
    await assertSingletonAllowed(client, target);
    const groupId = randomUUID();
    await client.query('INSERT INTO tsa.duplicate_groups(id,reason,confirmed_by) VALUES($1,$2,$3)', [groupId, reason, reviewerId]);
    await client.query('INSERT INTO tsa.duplicate_group_members(group_id,question_id) VALUES($1,$2)', [groupId, target.question_id]);
    await client.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1, updated_at=clock_timestamp() WHERE id=1');
    await appendWorkflowAudit(client, { userId: reviewerId }, target, 'BANK_CONFIRM_SINGLETON', target.revision, reason);
    return true;
  });
}

/** Approve one IN_REVIEW version as the owner; every application publication check must pass. */
export async function ownerApprove(ownerPool, versionId, { reviewerId = OWNER_REVIEWER_ID, reason = APPROVAL_REASON, imageStore = null } = {}) {
  return withTransaction(ownerPool, async (client) => {
    const privileged = (await client.query(`SELECT r.rolsuper OR d.datdba=r.oid AS ok FROM pg_roles r
      JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`)).rows[0]?.ok;
    if (privileged !== true) throw new Error('Owner approval requires the migration owner connection');
    const target = await loadWorkflowTarget(client, versionId);
    if (target.state !== 'IN_REVIEW') throw new Error(`Version ${versionId} is ${target.state}, not IN_REVIEW`);
    const attribution = await resolveOriginalImportAttribution(client, target);
    if (reviewerId === attribution.created_by || reviewerId === attribution.operator_id) {
      throw new Error('The approving account must differ from the author and import operator');
    }
    // question/2 (numeric answers) needs the numeric opt-in; every other check is identical.
    await assertPublicationChecks(client, target, imageStore, { enableNumericQuestions: target.schema_version === 'question/2', enableClozeMatching: target.schema_version === 'question/3' });
    const reviewId = randomUUID();
    await client.query(`INSERT INTO tsa.reviews(id,question_version_id,content_hash,reviewer_id,decision,rubric,reason)
      VALUES($1,$2,$3,$4,'APPROVE',$5::jsonb,$6)`, [reviewId, versionId, target.content_hash, reviewerId, JSON.stringify(RUBRIC), reason]);
    const changed = await client.query(`UPDATE tsa.question_workflow SET state='APPROVED', revision=revision+1,
        approved_review_id=$3, quarantine_reason=NULL, updated_at=clock_timestamp()
      WHERE question_version_id=$1 AND revision=$2 AND state='IN_REVIEW' RETURNING revision`, [versionId, target.revision, reviewId]);
    if (changed.rowCount !== 1) throw new Error(`Version ${versionId} changed during approval`);
    await client.query('UPDATE tsa.questions SET eligible_version_id=$2 WHERE id=$1', [target.question_id, versionId]);
    await client.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1, updated_at=clock_timestamp() WHERE id=1');
    await appendWorkflowAudit(client, { userId: reviewerId }, target, 'BANK_REVIEW_APPROVE', Number(changed.rows[0].revision), reason);
    // The selection gate admits question/2 only while the numeric-practice setting is on, as it is when students are served.
    if (target.schema_version === 'question/2') await client.query("SELECT set_config('tsa.enable_numeric_practice','true',true)");
    if (target.schema_version === 'question/3') await client.query("SELECT set_config('tsa.enable_cloze_matching','true',true)");
    const selectable = (await client.query('SELECT tsa.bank_question_selection_allowed($1) AS ok', [versionId])).rows[0].ok;
    if (selectable !== true) throw new Error(`Version ${versionId} is approved but not selectable; rolled back`);
    return reviewId;
  });
}

const TWIN_REASON = 'Owner decision 2026-11-19: of two identical questions keep one. The pair is confirmed as one equivalence group, '
  + 'so no test attempt can contain both; both immutable versions are retained.';

/** OPEN exact-duplicate relations that involve any of the given versions. Read-only. */
export async function listOpenTwins(client, versionIds) {
  return (await client.query(`
    SELECT d.id, d.left_version_id AS "leftVersionId", d.right_version_id AS "rightVersionId",
           lw.state::text AS "leftState", rw.state::text AS "rightState"
      FROM tsa.duplicate_relations d
      JOIN tsa.question_workflow lw ON lw.question_version_id=d.left_version_id
      JOIN tsa.question_workflow rw ON rw.question_version_id=d.right_version_id
     WHERE d.resolution='OPEN' AND d.kind='EXACT'
       AND (d.left_version_id=ANY($1::uuid[]) OR d.right_version_id=ANY($1::uuid[]))
     ORDER BY d.id`, [versionIds])).rows;
}

async function groupOf(client, target, reviewerId) {
  const existing = await client.query(`SELECT m.group_id, g.merged_into_id FROM tsa.duplicate_group_members m
    JOIN tsa.duplicate_groups g ON g.id=m.group_id WHERE m.question_id=$1 FOR UPDATE OF m, g`, [target.question_id]);
  if (existing.rowCount) {
    if (existing.rows[0].merged_into_id !== null) throw new Error(`Question of version ${target.id} sits in a retired equivalence group`);
    return existing.rows[0].group_id;
  }
  const groupId = randomUUID();
  await client.query('INSERT INTO tsa.duplicate_groups(id,reason,confirmed_by) VALUES($1,$2,$3)', [groupId, TWIN_REASON, reviewerId]);
  await client.query('INSERT INTO tsa.duplicate_group_members(group_id,question_id) VALUES($1,$2)', [groupId, target.question_id]);
  return groupId;
}

/**
 * Confirm one OPEN exact twin as a single equivalence group, as the reviewer equivalence service does, on the migration
 * owner connection. Both versions must be IN_REVIEW or APPROVED. Nothing is deleted or edited; the relation becomes
 * CONFIRMED, the two questions share one canonical group and every selection gate then treats them as one.
 */
export async function ownerConfirmTwin(ownerPool, relationId, { reviewerId = OWNER_REVIEWER_ID, reason = TWIN_REASON } = {}) {
  return withTransaction(ownerPool, async (client) => {
    const privileged = (await client.query(`SELECT r.rolsuper OR d.datdba=r.oid AS ok FROM pg_roles r
      JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`)).rows[0]?.ok;
    if (privileged !== true) throw new Error('Twin confirmation requires the migration owner connection');
    const relation = (await client.query(`SELECT id, left_version_id, right_version_id, kind::text AS kind, resolution::text AS resolution
      FROM tsa.duplicate_relations WHERE id=$1 FOR UPDATE`, [relationId])).rows[0];
    if (!relation || relation.resolution !== 'OPEN' || relation.kind !== 'EXACT') throw new Error(`Relation ${relationId} is not an OPEN exact twin`);
    const targets = [];
    for (const versionId of [relation.left_version_id, relation.right_version_id].sort()) {
      const target = await loadWorkflowTarget(client, versionId);
      if (!['IN_REVIEW', 'APPROVED'].includes(target.state)) throw new Error(`Version ${versionId} is ${target.state}; twins are confirmed only between IN_REVIEW or APPROVED versions`);
      const attribution = await resolveOriginalImportAttribution(client, target);
      if (reviewerId === attribution.created_by || reviewerId === attribution.operator_id) {
        throw new Error('The confirming account must differ from the author and import operator');
      }
      targets.push(target);
    }
    const [first, second] = targets;
    if (first.question_id === second.question_id) throw new Error('A relation between two versions of one question cannot be confirmed as a twin');
    const evidence = { reason, leftVersionId: relation.left_version_id, rightVersionId: relation.right_version_id, reviewerId,
      leftContentHash: targets.find((t) => t.id === relation.left_version_id).content_hash,
      rightContentHash: targets.find((t) => t.id === relation.right_version_id).content_hash };
    const updated = await client.query(`UPDATE tsa.duplicate_relations SET resolution='CONFIRMED', resolved_by=$2, resolution_evidence=$3::jsonb
      WHERE id=$1 AND resolution='OPEN' RETURNING id`, [relationId, reviewerId, JSON.stringify(evidence)]);
    if (updated.rowCount !== 1) throw new Error(`Relation ${relationId} changed during confirmation`);
    const firstGroup = await groupOf(client, first, reviewerId);
    const secondGroup = await groupOf(client, second, reviewerId);
    let merged = false;
    if (firstGroup !== secondGroup) {
      const [canonicalId, retiredId] = [firstGroup, secondGroup].sort();
      await recordEquivalenceIncidents(client, { canonicalGroupId: canonicalId, retiredGroupId: retiredId, actorId: reviewerId });
      const alias = await client.query('UPDATE tsa.duplicate_groups SET merged_into_id=$2 WHERE id=$1 AND merged_into_id IS NULL RETURNING id', [retiredId, canonicalId]);
      if (alias.rowCount !== 1) throw new Error('Equivalence groups could not be merged');
      await client.query('UPDATE tsa.duplicate_group_members SET group_id=$2 WHERE group_id=$1', [retiredId, canonicalId]);
      merged = true;
    }
    for (const target of targets) {
      const bumped = await client.query(`UPDATE tsa.question_workflow SET revision=revision+1, updated_at=clock_timestamp()
        WHERE question_version_id=$1 AND revision=$2 AND state IN ('IN_REVIEW','APPROVED') RETURNING revision`, [target.id, target.revision]);
      if (bumped.rowCount !== 1) throw new Error(`Version ${target.id} changed during twin confirmation`);
      await appendWorkflowAudit(client, { userId: reviewerId }, target, 'BANK_EQUIVALENCE_CONFIRMED', Number(bumped.rows[0].revision), reason);
    }
    await client.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1, updated_at=clock_timestamp() WHERE id=1');
    return { merged };
  });
}
