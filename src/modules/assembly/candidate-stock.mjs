import { createHash } from 'node:crypto';
import { BlueprintConfigSchema, canonicalize, parseAssemblyManifest, runAssemblyReference } from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../database/pool.mjs';
import { UUID_PATTERN, reject } from '../bank/common.mjs';

/** Internal search groundwork; this creates no form, attempt, receipt or approval. */
export async function captureStandaloneManifest({ examPool, identityService, principal, blueprintVersionId, seed, limits }) {
  if (!identityService.mayPerform(principal, 'candidate.attempt.read')) reject(403, 'FORBIDDEN');
  if (!UUID_PATTERN.test(blueprintVersionId)) reject(404, 'NOT_FOUND');
  const stock = await withTransaction(examPool, async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
    return (await client.query('SELECT tsa.assembly_standalone_stock($1) AS stock', [blueprintVersionId])).rows[0].stock;
  }, { role: 'tsa_exam' });
  if (!stock) reject(404, 'NOT_FOUND');
  const blueprint = BlueprintConfigSchema.parse(stock.blueprint);
  if (stock.candidates.length > 10_000) reject(422, 'SEARCH_EXHAUSTED');
  const rightsVersions = stock.rightsVersions.map(({ sourceId, versionId, decision }) => ({
    sourceId, versionId,
    contentHash: `sha256:${createHash('sha256').update(canonicalize(decision)).digest('hex')}`,
  }));
  const input = {
    schemaVersion: 'assembly-manifest/1', algorithmVersion: 'assembly/1',
    blueprintVersionId, blueprintHash: stock.blueprintHash, blueprint, seed,
    reuseMode: 'NEW_ONLY', bankRevision: stock.bankRevision, rightsVersions,
    historyQuestionIds: stock.historyQuestionIds, historyGroupIds: stock.historyGroupIds,
    units: stock.candidates.map((member) => ({ id: member.versionId, sectionId: blueprint.sections[0].id, members: [member] })),
    conflicts: stock.conflicts, limits,
  };
  const parsed = parseAssemblyManifest(input);
  return {
    ...parsed, historyRevision: stock.historyRevision, offeringRevision: stock.offeringRevision,
    result: runAssemblyReference(parsed.manifest),
  };
}
