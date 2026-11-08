import { createHash } from 'node:crypto';
import { BlueprintConfigSchema, canonicalize } from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../database/pool.mjs';
import { UUID_PATTERN, reject } from '../bank/common.mjs';
import { BlueprintConfigV2Schema } from '../../../packages/contracts/dist/blueprint-v2.js';
import { BlueprintConfigV3Schema } from '../../../packages/contracts/dist/blueprint-v3.js';
import { parsePracticeManifest, runPracticeAssembly } from './versioned-contracts.mjs';

/** Internal search groundwork; this creates no form, attempt, receipt or approval. */
export async function captureStandaloneManifest({ examPool, identityService, principal, blueprintVersionId, seed, limits, reuseMode = 'NEW_ONLY', enableTopicPractice = false, enableNumericPractice = false, enableFullSimulation = false }) {
  if (!['NEW_ONLY','REVIEW_ALLOWED'].includes(reuseMode)) reject(422, 'VALIDATION_ERROR');
  if (!identityService.mayPerform(principal, 'candidate.attempt.read')) reject(403, 'FORBIDDEN');
  if (!UUID_PATTERN.test(blueprintVersionId)) reject(404, 'NOT_FOUND');
  const stock = await withTransaction(examPool, async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
    if (enableTopicPractice) await client.query("SELECT set_config('tsa.enable_topic_practice','true',true),set_config('tsa.topic_practice_profile_id',$1,true)", [blueprintVersionId]);
    const stock = (await client.query('SELECT tsa.assembly_standalone_stock($1) AS stock', [blueprintVersionId])).rows[0].stock;
    if (!stock) {
      const state = (await client.query('SELECT tsa.assembly_offering_state($1) AS state', [blueprintVersionId])).rows[0].state;
      reject(state.code === 'NOT_FOUND' ? 404 : state.code === 'FORM_NOT_OPEN' ? 409 : 410, state.code);
    }
    return stock;
  }, { role: 'tsa_exam', enableNumericPractice, enableFullSimulation });
  if (!stock) reject(404, 'NOT_FOUND');
  let blueprint;
  try { blueprint = (stock.blueprint?.schemaVersion === 'blueprint/3' && enableFullSimulation ? BlueprintConfigV3Schema : stock.blueprint?.schemaVersion === 'blueprint/2' && enableNumericPractice ? BlueprintConfigV2Schema : BlueprintConfigSchema).parse(stock.blueprint); }
  catch { reject(422, 'VALIDATION_ERROR'); }
  if (stock.overflow || stock.candidates.length > 10_000) reject(503, 'SEARCH_EXHAUSTED');
  const rightsVersions = stock.rightsVersions.map(({ sourceId, versionId, decision }) => ({
    sourceId, versionId,
    contentHash: `sha256:${createHash('sha256').update(canonicalize(decision)).digest('hex')}`,
  }));
  const input = {
    schemaVersion: blueprint.schemaVersion === 'blueprint/3' ? 'assembly-manifest/3' : blueprint.schemaVersion === 'blueprint/2' ? 'assembly-manifest/2' : 'assembly-manifest/1', algorithmVersion: 'assembly/1',
    blueprintVersionId, blueprintHash: stock.blueprintHash, blueprint, seed,
    reuseMode, bankRevision: stock.bankRevision, rightsVersions,
    historyQuestionIds: stock.historyQuestionIds, historyGroupIds: stock.historyGroupIds,
    units: stock.units,
    conflicts: stock.conflicts, limits,
  };
  let parsed;
  try { parsed = parsePracticeManifest(input, { enableNumericPractice, enableFullSimulation }); }
  catch { reject(422, 'VALIDATION_ERROR'); }
  return {
    ...parsed, historyRevision: stock.historyRevision, offeringRevision: stock.offeringRevision,
    result: runPracticeAssembly(parsed.manifest, { enableNumericPractice, enableFullSimulation }),
  };
}
