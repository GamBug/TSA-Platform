import { StaffReviewContextSchema } from '../../../packages/contracts/dist/staff.js';
import { assertBankConnection, reject, requireActor, UUID_PATTERN } from './common.mjs';
import { assertSafeQuestionContent } from './content-safety.mjs';
import { withTransaction } from '../database/pool.mjs';
import { loadStaffReviewSnapshot } from './review-snapshot.mjs';

const LIMIT_BYTES = 1024 * 1024;
const fail = () => reject(503, 'TEMPORARILY_UNAVAILABLE');
const need = (condition) => { if (!condition) fail(); };

async function readSnapshot(client, identityService, principal, versionId) {
  const { basis, target, verified } = await loadStaffReviewSnapshot(client, identityService, principal, versionId);
  const observation = await client.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at`);
  const observedAt = observation.rows[0].observed_at;
  const requiredUses = ['DISPLAY'];
  if (['GENERATED', 'AUGMENTED'].includes(verified.question.origin)) requiredUses.push('GENERATE');
  if (verified.question.origin === 'AUGMENTED') requiredUses.push('ADAPT');
  const result = await client.query(`SELECT sv.id,sv.content_hash,s.origin,sr.decision_id,sr.revision,
    rd.status::text AS status,rd.allowed_uses::text[] AS allowed_uses,rd.territory,
    to_char(rd.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS valid_from,
    to_char(rd.valid_to AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS valid_to,
    COALESCE(rd.status IN ('OWNED','LICENSED','OPEN_LICENSE','PUBLIC_DOMAIN')
      AND rd.allowed_uses @> $2::tsa.rights_use[]
      AND ('VN'=ANY(rd.territory) OR 'WORLDWIDE'=ANY(rd.territory))
      AND rd.valid_from IS NOT NULL AND rd.valid_from <= $3::timestamptz
      AND (rd.valid_to IS NULL OR $3::timestamptz < rd.valid_to)
      AND jsonb_typeof(rd.evidence->'text')='string' AND btrim(rd.evidence->>'text')<>''
      AND attestor.disabled_at IS NULL AND attestor.id IS NOT NULL,false) AS permitted
    FROM tsa.source_versions sv JOIN tsa.sources s ON s.id=sv.source_id
    LEFT JOIN tsa.source_rights sr ON sr.source_version_id=sv.id
    LEFT JOIN tsa.rights_decisions rd ON rd.source_version_id=sv.id AND rd.id=sr.decision_id
    LEFT JOIN tsa.users attestor ON attestor.id=rd.decided_by
    WHERE sv.id=ANY($1::uuid[]) ORDER BY sv.id`, [verified.sources, requiredUses, observedAt]);
  need(result.rowCount === verified.sources.length);
  const sources = result.rows.map((row) => ({ sourceVersionId: row.id, contentHash: row.content_hash, origin: row.origin,
    currentRights: row.decision_id === null ? null : {
      decisionId: row.decision_id, revision: Number(row.revision), status: row.status,
      allowedUses: row.allowed_uses, territory: row.territory, validFrom: row.valid_from, validTo: row.valid_to,
    } }));
  let reason = ['QUARANTINED', 'RETIRED'].includes(target.state) ? 'WORKFLOW_HELD'
    : result.rows.some((row) => !row.permitted) ? 'RIGHTS_BLOCKED' : null;
  if (!reason) {
    try { assertSafeQuestionContent(verified.question, verified.graph.filter((node) => !(node.kind === 'question' && node.id === target.id))); }
    catch { reason = 'CONTENT_UNSUPPORTED'; }
  }
  const preview = reason ? { status: 'BLOCKED', reason } : { status: 'AVAILABLE', question: {
    language: verified.question.language, content: verified.question.content, interaction: verified.question.interaction,
    answerKey: verified.question.private.answerKey, explanation: verified.question.private.explanation,
    scoringPolicyVersion: verified.question.private.scoringPolicy, stimulus: verified.stimulus,
  } };
  const payload = {
    schemaVersion: 'staff-review-context/1', observedAt, accessBasis: basis, environment: 'LOCAL_SYNTHETIC_ONLY',
    version: { questionId: target.question_id, versionId: target.id, versionNo: target.version_no,
      parentVersionId: target.parent_version_id, section: target.section, contentHash: target.content_hash },
    workflow: { state: target.state, revision: Number(target.revision) }, sources, preview,
    rightsEvidenceIncluded: false, publicationEligibility: 'NOT_EVALUATED',
  };
  need(Buffer.byteLength(JSON.stringify(payload), 'utf8') <= LIMIT_BYTES);
  return StaffReviewContextSchema.parse(payload);
}

export async function createReviewContextService({ bankPool, identityService }) {
  await assertBankConnection(bankPool);
  return Object.freeze({ async read(principal, versionId) {
    requireActor(identityService, principal, 'bank.question.read');
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
