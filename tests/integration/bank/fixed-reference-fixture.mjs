// Owned synthetic reference problems only: no Bank eligibility capture or sealed forms.
import { randomUUID } from 'node:crypto';
import { canonicalize, parseFixedAssemblyManifest, runFixedAssemblyReference } from '../../../packages/contracts/dist/internal.js';
import { createHash } from 'node:crypto';

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

export async function seedFixedReferenceRuns(fixture) {
  const blueprint = fixture.blueprint;
  const sourceId = randomUUID();
  const units = Array.from({ length: blueprint.config.sections[0].count }, () => ({
    id: randomUUID(), sectionId: blueprint.config.sections[0].id,
    members: [{ questionId: randomUUID(), versionId: randomUUID(), contentHash: digest(randomUUID()), groupId: randomUUID(),
      section: blueprint.config.sections[0].section, taxonomyVersionId: blueprint.config.taxonomyVersionId,
      interactionType: 'SINGLE_CHOICE', skillIds: blueprint.config.quotas.filter((q) => q.dimension === 'SKILL').map((q) => q.value),
      cognitiveLevel: 'M1', difficulty: 'EASY', sourceIds: [sourceId], exposureCount: 0 }],
  }));
  const base = { schemaVersion: 'fixed-assembly-manifest/1', algorithmVersion: 'assembly/1', formMode: 'PUBLISHED_FIXED', reuseMode: 'FIXED_AS_PUBLISHED',
    blueprintVersionId: blueprint.versionId, blueprintHash: blueprint.contentHash, blueprint: blueprint.config, seed: 42,
    bankRevision: 'synthetic-reference-problem/1', rightsVersions: [{ sourceId, versionId: randomUUID(), contentHash: digest('Synthetic reference rights token, not an attestation.') }],
    units, conflicts: [], limits: { maxNodes: 50_000, maxUnits: 2_000 } };
  const cases = [
    { key: 'success', input: base },
    { key: 'infeasible', input: { ...base, units: units.slice(1) } },
    { key: 'exhausted', input: { ...base, limits: { ...base.limits, maxNodes: 0 } } },
  ];
  const runs = {};
  for (const { key, input } of cases) {
    const parsed = parseFixedAssemblyManifest(input);
    const result = runFixedAssemblyReference(parsed.manifest);
    const id = randomUUID();
    await fixture.pool.query(`INSERT INTO tsa.assembly_runs
      (id,blueprint_version_id,user_id,form_mode,reuse_mode,history_revision,bank_revision,request_hash,seed,algorithm_version,limits,manifest,manifest_hash,outcome,diagnostics)
      VALUES($1,$2,NULL,'PUBLISHED_FIXED','FIXED_AS_PUBLISHED',NULL,$3,$4,$5,'assembly/1',$6::jsonb,$7::jsonb,$8,$9,$10::jsonb)`,
    [id,blueprint.versionId,parsed.manifest.bankRevision,digest({ syntheticReference: key, manifestHash: parsed.manifestHash }),parsed.manifest.seed,
      JSON.stringify(parsed.manifest.limits),JSON.stringify(parsed.manifest),parsed.manifestHash,result.status,JSON.stringify({ schemaVersion: 'fixed-reference-result/1', result })]);
    runs[key] = { assemblyRunId: id, manifest: parsed.manifest, result };
  }
  return runs;
}
