// Owner publication of corpus DRAFTs in the retained Bank (OPEN_DECISIONS, 2026-11-11).
// Runtime publication stays disabled; this owner maintenance path runs on the migration
// owner connection and repeats every application publication check before approving.
import { createHash, randomUUID } from 'node:crypto';
import { resolveOriginalImportAttribution } from '../modules/bank/import-attribution.mjs';
import { appendWorkflowAudit, assertPublicationChecks, assertSingletonAllowed, loadWorkflowTarget } from '../modules/bank/publication-gates.mjs';
import { withTransaction } from '../modules/database/pool.mjs';

export const OWNER_REVIEWER_ID = '00000000-0000-4000-8000-000000000202';
export const OWNER_SECTIONS = Object.freeze(['MATH', 'READING', 'SCIENCE']);
export const OWNER_RIGHTS = Object.freeze({
  status: 'LICENSED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2026-11-10T17:00:00Z', validTo: null,
  evidence: 'Project owner attestation, 2026-11-11: the source permits non-profit use of this corpus. The owner holds '
    + 'the written evidence privately and accepts responsibility. Recorded as OWNER_ATTESTED in docs/decisions/OPEN_DECISIONS.md.',
});
const APPROVAL_REASON = 'Owner approval through the owner publication command (the project owner operating the local reviewer '
  + 'account). Corpus permission OWNER_ATTESTED, docs/decisions/OPEN_DECISIONS.md 2026-11-11. Source keys are authoritative.';
const RUBRIC = Object.freeze(Object.fromEntries(
  ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true])));

/** The exact confirmation phrase the owner must type for one publication run. */
export function confirmationPhrase(count, section) {
  return `PUBLISH ${count} ${section ?? 'ALL'}`;
}

const CORPUS_SOURCES = `SELECT sv.id FROM tsa.source_versions sv JOIN tsa.sources s ON s.id=sv.source_id WHERE s.title LIKE 'Corpus %'`;

/** Unpublished imported versions whose every source is a corpus source. Read-only. */
export async function listOwnerCandidates(client, { section = null } = {}) {
  if (section !== null && !OWNER_SECTIONS.includes(section)) throw new TypeError('section must be MATH, READING or SCIENCE');
  const versions = (await client.query(`
    SELECT v.id, v.section::text AS section, w.state::text AS state, w.revision::integer AS revision,
           v.content_hash AS "contentHash", v.created_by AS "createdBy", v.stimulus_version_id AS "stimulusVersionId",
           v.schema_version AS "schemaVersion",
           ARRAY(SELECT s.id FROM tsa.bank_question_sources(v.id) s ORDER BY s.id) AS "sourceVersionIds",
           EXISTS(SELECT 1 FROM tsa.duplicate_group_members m WHERE m.question_id=v.question_id) AS grouped,
           EXISTS(SELECT 1 FROM tsa.bundle_members bm WHERE bm.question_version_id=v.id) AS bundled
      FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id
     WHERE v.origin='IMPORTED' AND w.state IN ('DRAFT','IN_REVIEW') AND ($1::text IS NULL OR v.section::text=$1)
       AND EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) s)
       AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) s WHERE s.id NOT IN (${CORPUS_SOURCES}))
     ORDER BY v.section, v.id`, [section])).rows;
  const sources = (await client.query(`
    SELECT DISTINCT s.id, COALESCE(sr.revision,0)::integer AS revision, tsa.bank_source_display_allowed(s.id) AS allowed
      FROM unnest($1::uuid[]) v(id) CROSS JOIN LATERAL tsa.bank_question_sources(v.id) s
      LEFT JOIN tsa.source_rights sr ON sr.source_version_id=s.id ORDER BY s.id`, [versions.map((row) => row.id)])).rows;
  return { versions, sources };
}

/** Create one ordered bundle per shared passage whose questions are all imported and not yet bundled. */
export async function createPassageBundles(ownerPool, stimulusVersionIds) {
  let created = 0;
  for (const stimulusVersionId of [...new Set(stimulusVersionIds)].sort()) {
    await withTransaction(ownerPool, async (client) => {
      const members = (await client.query(`
        SELECT v.id, EXISTS(SELECT 1 FROM tsa.bundle_members bm WHERE bm.question_version_id=v.id) AS bundled
          FROM tsa.question_versions v JOIN tsa_private.factory_import_receipts r ON r.question_version_id=v.id
         WHERE v.stimulus_version_id=$1 ORDER BY r.batch_key, r.item_key, r.candidate_ordinal`, [stimulusVersionId])).rows;
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
export async function ownerApprove(ownerPool, versionId, { reviewerId = OWNER_REVIEWER_ID, reason = APPROVAL_REASON } = {}) {
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
    await assertPublicationChecks(client, target, null, { enableNumericQuestions: target.schema_version === 'question/2', enableClozeMatching: target.schema_version === 'question/3' });
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
