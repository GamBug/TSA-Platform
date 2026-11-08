import { parseAssemblyManifest, runAssemblyReference, StudentSlotSchema } from '../../../packages/contracts/dist/internal.js';
import { parseAssemblyManifestV2, runAssemblyReferenceV2 } from '../../../packages/contracts/dist/assembly-reference.js';
import { StudentSlotV2Schema } from '../../../packages/contracts/dist/student-v2.js';
import { BlueprintConfigV2Schema } from '../../../packages/contracts/dist/blueprint-v2.js';

export function parsePracticeManifest(value, { enableNumericPractice = false } = {}) {
  if (value?.schemaVersion !== 'assembly-manifest/2') return parseAssemblyManifest(value);
  if (!enableNumericPractice) throw new TypeError('Unsupported assembly protocol');
  return parseAssemblyManifestV2(value);
}
export function runPracticeAssembly(value, { enableNumericPractice = false } = {}) {
  if (value?.schemaVersion !== 'assembly-manifest/2') return runAssemblyReference(value);
  if (!enableNumericPractice) throw new TypeError('Unsupported assembly protocol');
  return runAssemblyReferenceV2(value);
}
export function practiceSlotSchema(manifest) {
  return manifest.schemaVersion === 'assembly-manifest/2' ? StudentSlotV2Schema : StudentSlotSchema;
}
export function parseNumericPracticeConfig(value) {
  const result = BlueprintConfigV2Schema.safeParse(value);
  if (!result.success) return null;
  const section = result.data.sections[0];
  return section.count <= 100 && section.durationSeconds <= 10800 ? result.data : null;
}
