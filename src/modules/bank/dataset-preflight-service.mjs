import {
  assertBankConnection, HASH_PATTERN, UUID_PATTERN, strictRecord,
  reject, requireActor, resolveReferenceGraph,
} from './common.mjs';
import { withTransaction } from '../database/pool.mjs';
import { preflightDataset, MAX_PREFLIGHT_ITEMS, MAX_PREFLIGHT_CANONICAL_BYTES } from './dataset-preflight.mjs';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';

/** Private staff diagnostic. Never returns content or changes Bank state. */
export async function createDatasetPreflightService({ bankPool, identityService }) {
  if (!bankPool || !identityService) throw new TypeError('Bank pool and identity service are required');
  await assertBankConnection(bankPool);
  return {
    async preflight(principal, input) {
      requireActor(identityService, principal, 'bank.question.read');
      strictRecord(input, ['versions']);
      if (!Array.isArray(input.versions) || input.versions.length === 0
          || input.versions.length > MAX_PREFLIGHT_ITEMS) reject(422, 'VALIDATION_ERROR');
      const seen = new Set();
      // Copy request pins before awaiting any SQL work.
      const pins = input.versions.map((pin) => {
        strictRecord(pin, ['versionId', 'contentHash']);
        if (typeof pin.versionId !== 'string' || !UUID_PATTERN.test(pin.versionId)
            || typeof pin.contentHash !== 'string' || !HASH_PATTERN.test(pin.contentHash)
            || seen.has(pin.versionId)) reject(422, 'VALIDATION_ERROR');
        seen.add(pin.versionId);
        return { versionId: pin.versionId, contentHash: pin.contentHash };
      }).sort((a, b) => a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0);
      return withTransaction(bankPool, async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const bank = await client.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id = 1');
        if (bank.rowCount !== 1) throw new Error('Bank state guard is unavailable');
        const items = [];
        let aggregateBytes = 0;
        const versions = [];
        for (const pin of pins) {
          const stored = await client.query(`
            SELECT qv.id, qv.question_id, qv.content_hash, qv.reference_namespace,
                   w.state::text AS state, w.revision::text AS revision,
                   (SELECT count(*)::int FROM tsa.duplicate_relations d
                     WHERE (d.left_version_id = qv.id OR d.right_version_id = qv.id)
                       AND d.resolution = 'OPEN') AS open_duplicate_flags
              FROM tsa.question_versions qv
              JOIN tsa.question_workflow w ON w.question_version_id = qv.id
             WHERE qv.id = $1`, [pin.versionId]);
          if (stored.rowCount !== 1) reject(404, 'NOT_FOUND');
          const row = stored.rows[0];
          if (row.content_hash !== pin.contentHash) reject(409, 'CONTENT_HASH_MISMATCH');
          if (!row.reference_namespace) reject(422, 'REFERENCE_NOT_FOUND');
          // The retained canonical graph preserves opaque Factory IDs and lexical
          // timestamps. A normalized SQL reconstruction would lose that evidence.
          const graph = await resolveReferenceGraph(client, row.reference_namespace,
            [{ kind: 'question', id: pin.versionId }]);
          const root = graph.find((node) => node.kind === 'question' && node.id === pin.versionId);
          if (!root || root.payload.id !== pin.versionId || root.payload.questionId !== row.question_id
              || Object.hasOwn(root.payload, 'contentHash')) reject(409, 'PREFLIGHT_INTEGRITY_CONFLICT');
          const references = graph.filter((node) => node !== root);
          const item = { question: { ...root.payload, contentHash: row.content_hash }, references };
          aggregateBytes += canonicalize(item.question).byteLength + canonicalize(references).byteLength;
          if (aggregateBytes > MAX_PREFLIGHT_CANONICAL_BYTES) reject(422, 'PREFLIGHT_BYTE_LIMIT');
          items.push(item);
          versions.push({ versionId: pin.versionId, state: row.state,
            workflowRevision: row.revision, openDuplicateFlags: row.open_duplicate_flags });
        }
        const report = preflightDataset({ items });
        return { ...report, databaseSnapshot: {
          eligibilityRevision: bank.rows[0].revision,
          versions,
          scope: 'CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION',
        } };
      }, { role: 'tsa_bank' });
    },
  };
}
