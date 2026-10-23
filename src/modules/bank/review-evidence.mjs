import { StaffReviewEvidenceSchema } from '../../../packages/contracts/dist/staff.js';
import { assertBankConnection, reject, requireActor, UUID_PATTERN } from './common.mjs';
import { withTransaction } from '../database/pool.mjs';
import { loadStaffReviewSnapshot } from './review-snapshot.mjs';

const fail = () => reject(503, 'TEMPORARILY_UNAVAILABLE');

async function readSnapshot(client, identityService, principal, versionId) {
  const { basis, target, verified } = await loadStaffReviewSnapshot(
    client, identityService, principal, versionId, { allowAuthorOwn: false },
  );
  const observation = await client.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at`);
  const result = await client.query(`SELECT sv.id,sr.decision_id,sr.revision,
    rd.status::text AS status,rd.evidence->'text' AS evidence_text
    FROM tsa.source_versions sv
    LEFT JOIN tsa.source_rights sr ON sr.source_version_id=sv.id
    LEFT JOIN tsa.rights_decisions rd ON rd.source_version_id=sv.id AND rd.id=sr.decision_id
    WHERE sv.id=ANY($1::uuid[]) ORDER BY sv.id`, [verified.sources]);
  if (result.rowCount !== verified.sources.length) fail();
  const sources = result.rows.map((row) => {
    if (row.decision_id !== null && row.status === null) fail();
    const recordedEvidence = typeof row.evidence_text === 'string' && row.evidence_text.trim().length > 0
      ? { state: 'TEXT_AVAILABLE', text: row.evidence_text } : { state: 'NOT_RECORDED' };
    if (Buffer.byteLength(JSON.stringify(recordedEvidence), 'utf8') > 64 * 1024) fail();
    return { sourceVersionId: row.id, currentDecision: row.decision_id === null ? null : {
      decisionId: row.decision_id, revision: Number(row.revision), status: row.status, recordedEvidence,
    } };
  });
  const payload = {
    schemaVersion: 'staff-review-evidence/1', observedAt: observation.rows[0].observed_at,
    environment: 'LOCAL_SYNTHETIC_ONLY', accessBasis: basis,
    version: { versionId: target.id, contentHash: target.content_hash, workflowRevision: Number(target.revision) },
    sources, qualification: 'NOT_ATTESTED_BY_PLATFORM', publicationEligibility: 'NOT_EVALUATED',
  };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 1024 * 1024) fail();
  return StaffReviewEvidenceSchema.parse(payload);
}

/** Read the current administrative text without rights, review or eligibility mutations. */
export async function createReviewEvidenceService({ bankPool, identityService }) {
  await assertBankConnection(bankPool);
  return Object.freeze({ async read(principal, versionId) {
    requireActor(identityService, principal, 'bank.question.read');
    if (!principal.roles.some((role) => role === 'BANK_MANAGER' || role === 'REVIEWER')) reject(403, 'FORBIDDEN');
    if (!UUID_PATTERN.test(versionId)) reject(404, 'NOT_FOUND');
    return withTransaction(bankPool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      try { return await readSnapshot(client, identityService, principal, versionId); }
      catch (error) {
        if (error?.status === 404 && error?.code === 'NOT_FOUND') throw error;
        fail();
      }
    }, { role: 'tsa_bank' });
  } });
}
