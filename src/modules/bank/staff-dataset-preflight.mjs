import { StaffDatasetPreflightRequestSchema, StaffDatasetPreflightSchema } from '../../../packages/contracts/dist/staff.js';
import { BankCommandError, reject, requireActor } from './common.mjs';
import { createDatasetPreflightService } from './dataset-preflight-service.mjs';

const INPUT_FAILURES = new Set([
  'PREFLIGHT_ITEM_LIMIT', 'PREFLIGHT_BYTE_LIMIT', 'INVALID_PREFLIGHT_INPUT', 'INVALID_PREFLIGHT_ITEM',
  'STALE_QUESTION_CONTENT_HASH', 'DUPLICATE_QUESTION_VERSION', 'DUPLICATE_QUESTION_IDENTITY',
  'REFERENCE_IDENTITY_CONFLICT',
]);

/** Project the existing canonical report, never its internal manifest/review packet. */
export async function createStaffDatasetPreflightService({ bankPool, identityService }) {
  const canonical = await createDatasetPreflightService({ bankPool, identityService });
  return Object.freeze({ async preflight(principal, input) {
    requireActor(identityService, principal, 'bank.diagnostics.read');
    if (!principal.roles?.includes('BANK_MANAGER')) reject(403, 'FORBIDDEN');
    const parsed = StaffDatasetPreflightRequestSchema.safeParse(input);
    if (!parsed.success) reject(422, 'VALIDATION_ERROR');
    // Parsed pins are copied before any await; later caller edits cannot change
    // either the checked graph or the version/hash pairs in this projection.
    const pins = new Map(parsed.data.versions.map((pin) => [pin.versionId, pin.contentHash]));
    let result;
    try { result = await canonical.preflight(principal, parsed.data); }
    catch (error) {
      if (error instanceof BankCommandError && [401, 403, 404, 409, 422].includes(error.status)) throw error;
      if (error instanceof TypeError && INPUT_FAILURES.has(error.message)) reject(422, 'VALIDATION_ERROR');
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
    try {
      const { report, databaseSnapshot } = result;
      const payload = {
        schemaVersion: 'staff-dataset-preflight/1', environment: 'LOCAL_SYNTHETIC_ONLY', accessBasis: 'BANK_MANAGER',
        scope: 'CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION',
        // Server report creation time after the captured read, not a claim that
        // wall-clock time is the snapshot revision or an exam clock/deadline.
        generatedAt: new Date().toISOString().replace('Z', '000Z'),
        qualification: 'NOT_ATTESTED_BY_PLATFORM', publicationEligibility: 'NOT_EVALUATED', publishing: false,
        eligibilityRevision: databaseSnapshot.eligibilityRevision, targets: report.targets,
        counts: { total: report.counts.total, bySection: report.counts.bySection, byInteractionType: report.counts.byInteractionType },
        shortfalls: report.shortfalls, duplicateFingerprintGroupCount: report.duplicateFingerprintGroups.length,
        blockerCodes: report.blockerCodes,
        versions: databaseSnapshot.versions.map((version) => ({ versionId: version.versionId,
          contentHash: pins.get(version.versionId), workflowRevision: Number(version.workflowRevision), state: version.state })),
      };
      if (payload.versions.length !== pins.size) reject(503, 'TEMPORARILY_UNAVAILABLE');
      return StaffDatasetPreflightSchema.parse(payload);
    } catch { reject(503, 'TEMPORARILY_UNAVAILABLE'); }
  } });
}
