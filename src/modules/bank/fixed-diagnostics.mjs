import { StaffFixedAssemblyRunListSchema, StaffFixedAssemblyDiagnosticSchema } from '../../../packages/contracts/dist/staff.js';
import { canonicalize, parseFixedAssemblyManifest, runFixedAssemblyReference } from '../../../packages/contracts/dist/internal.js';
import { assertBankConnection, reject, requireActor, UUID_PATTERN } from './common.mjs';
import { withTransaction } from '../database/pool.mjs';

const fail = () => reject(503, 'TEMPORARILY_UNAVAILABLE');
const same = (left, right) => Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
const common = (observedAt) => ({ environment: 'LOCAL_SYNTHETIC_ONLY', accessBasis: 'BANK_MANAGER', observedAt });

/** Replay fixed snapshots under the narrow audited function; never query assembly tables. */
export async function createFixedDiagnosticsService({ bankPool, identityService }) {
  await assertBankConnection(bankPool);
  async function read(principal, runId = null) {
    requireActor(identityService, principal, 'bank.diagnostics.read');
    if (!principal.roles?.includes('BANK_MANAGER')) reject(403, 'FORBIDDEN');
    if (runId !== null && !UUID_PATTERN.test(runId)) reject(404, 'NOT_FOUND');
    return withTransaction(bankPool, async (client) => {
      // Audit INSERT is part of the same repeatable snapshot/projection transaction.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      try {
        const value = (await client.query('SELECT tsa.bank_fixed_reference_snapshot($1,$2) AS snapshot', [principal.userId, runId])).rows[0]?.snapshot;
        if (!value) reject(404, 'NOT_FOUND');
        if (runId === null) return StaffFixedAssemblyRunListSchema.parse({ ...common(value.observedAt),
          schemaVersion: 'staff-fixed-assembly-runs/1', scope: 'CAPTURED_FIXED_REFERENCE_RUNS_ONLY', limit: 20,
          truncated: value.truncated, runs: value.runs });
        const row = value.run;
        if (row?.assemblyRunId !== runId) fail();
        const parsed = parseFixedAssemblyManifest(row.manifest);
        const manifest = parsed.manifest;
        if (parsed.manifestHash !== row.manifestHash || !same(manifest, row.manifest)
            || manifest.blueprintVersionId !== row.blueprintVersionId || manifest.seed !== row.seed
            || manifest.bankRevision !== row.bankRevision || manifest.algorithmVersion !== row.algorithmVersion
            || !same(manifest.limits, row.limits)) fail();
        const result = runFixedAssemblyReference(manifest);
        if (result.status !== row.outcome || !same(row.diagnostics, { schemaVersion: 'fixed-reference-result/1', result })) fail();
        const sections = ['MATH', 'READING', 'SCIENCE'].flatMap((section) => {
          const definitions = manifest.blueprint.sections.filter((entry) => entry.section === section);
          if (!definitions.length) return [];
          const ids = new Set(definitions.map((entry) => entry.id));
          return [{ section, requiredCount: definitions.reduce((sum, entry) => sum + entry.count, 0),
            selectedCount: result.slots.filter((slot) => ids.has(slot.sectionId)).length }];
        });
        return StaffFixedAssemblyDiagnosticSchema.parse({ ...common(value.observedAt),
          schemaVersion: 'staff-fixed-assembly-diagnostic/1', scope: 'CAPTURED_FIXED_REFERENCE_RUN_ONLY',
          run: { assemblyRunId: runId, blueprintVersionId: row.blueprintVersionId, outcome: row.outcome, createdAt: row.createdAt },
          algorithmVersion: 'assembly/1', replayVerified: true, createsForm: false,
          qualification: 'NOT_ATTESTED_BY_PLATFORM', publicationEligibility: 'NOT_EVALUATED',
          outcome: result.status, failureCode: result.status === 'FAILURE' ? result.code : null,
          visitedNodes: result.visitedNodes, nodeLimit: manifest.limits.maxNodes,
          capturedUnitCount: manifest.units.length, unitLimit: manifest.limits.maxUnits,
          capturedCandidateCount: manifest.units.reduce((sum, unit) => sum + unit.members.length, 0),
          selectedCount: result.slots.length, sections });
      } catch (error) {
        if (error?.status === 404 && error?.code === 'NOT_FOUND') throw error;
        fail();
      }
    }, { role: 'tsa_bank' });
  }
  return Object.freeze({ list: (principal) => read(principal), read });
}
