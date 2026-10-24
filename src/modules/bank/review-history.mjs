import { StaffReviewHistorySchema } from '../../../packages/contracts/dist/staff.js';
import { assertBankConnection, reject, requireActor, UUID_PATTERN } from './common.mjs';
import { withTransaction } from '../database/pool.mjs';

const fail = () => reject(503, 'TEMPORARILY_UNAVAILABLE');

/** Administrative recorded decisions only; never a qualification or eligibility check. */
export async function createReviewHistoryService({ bankPool, identityService }) {
  await assertBankConnection(bankPool);
  return Object.freeze({ async read(principal, versionId) {
    requireActor(identityService, principal, 'bank.diagnostics.read');
    if (!principal.roles?.includes('BANK_MANAGER')) reject(403, 'FORBIDDEN');
    if (!UUID_PATTERN.test(versionId)) reject(404, 'NOT_FOUND');
    return withTransaction(bankPool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      try {
        const target = await client.query(`SELECT qv.content_hash,w.state::text AS state,w.revision
          FROM tsa.question_versions qv JOIN tsa.question_workflow w ON w.question_version_id=qv.id
          WHERE qv.id=$1`, [versionId]);
        if (target.rowCount !== 1) reject(404, 'NOT_FOUND');
        const observation = await client.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at`);
        const result = await client.query(`SELECT id,content_hash,decision::text AS decision,rubric,reason,
          to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_at
          FROM tsa.reviews WHERE question_version_id=$1 ORDER BY created_at DESC,id DESC LIMIT 21`, [versionId]);
        const row = target.rows[0];
        // Validate every fetched row, including the extra truncation sentinel.
        // A corrupt record must never be converted into a misleading empty list.
        const reviews = result.rows.map((review) => {
          if (review.content_hash !== row.content_hash) fail();
          return { reviewId: review.id, recordedAt: review.recorded_at, decision: review.decision,
            rubric: review.rubric, reason: review.reason };
        });
        const common = {
          schemaVersion: 'staff-review-history/1', environment: 'LOCAL_SYNTHETIC_ONLY', accessBasis: 'BANK_MANAGER',
          observedAt: observation.rows[0].observed_at,
          version: { versionId, contentHash: row.content_hash, workflowRevision: Number(row.revision) },
          workflowState: row.state, qualification: 'NOT_ATTESTED_BY_PLATFORM', publicationEligibility: 'NOT_EVALUATED',
          limit: 20,
        };
        if (reviews.length > 20) StaffReviewHistorySchema.parse({ ...common, truncated: false, reviews: reviews.slice(1) });
        const payload = { ...common, truncated: reviews.length > 20, reviews: reviews.slice(0, 20) };
        if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 1024 * 1024) fail();
        return StaffReviewHistorySchema.parse(payload);
      } catch (error) {
        if (error?.status === 404 && error?.code === 'NOT_FOUND') throw error;
        fail();
      }
    }, { role: 'tsa_bank' });
  } });
}
