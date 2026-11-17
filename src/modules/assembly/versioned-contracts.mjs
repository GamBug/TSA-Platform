import { parseAssemblyManifest, runAssemblyReference, StudentSlotSchema } from '../../../packages/contracts/dist/internal.js';
import { parseAssemblyManifestV2, runAssemblyReferenceV2 } from '../../../packages/contracts/dist/assembly-reference.js';
import { parseAssemblyManifestV3, runAssemblyReferenceV3 } from '../../../packages/contracts/dist/assembly-reference.js';
import { StudentSlotV2Schema } from '../../../packages/contracts/dist/student-v2.js';
import { BlueprintConfigV2Schema } from '../../../packages/contracts/dist/blueprint-v2.js';
import { parseAssemblyManifestV4, runAssemblyReferenceV4 } from '../../../packages/contracts/dist/assembly-reference.js';
import { StudentSlotV4Schema } from '../../../packages/contracts/dist/student-v4.js';
import { BlueprintConfigV4Schema } from '../../../packages/contracts/dist/blueprint-v4.js';

export function parsePracticeManifest(value, { enableNumericPractice = false, enableFullSimulation = false, enableClozeMatching = false } = {}) {
  if (value?.schemaVersion === 'assembly-manifest/3') { if (!enableFullSimulation) throw new TypeError('Unsupported simulation protocol'); return parseAssemblyManifestV3(value); }
  if (value?.schemaVersion === 'assembly-manifest/4') { if (!enableClozeMatching) throw new TypeError('Unsupported cloze/matching protocol'); return parseAssemblyManifestV4(value); }
  if (value?.schemaVersion !== 'assembly-manifest/2') return parseAssemblyManifest(value);
  if (!enableNumericPractice) throw new TypeError('Unsupported assembly protocol');
  return parseAssemblyManifestV2(value);
}
export function runPracticeAssembly(value, { enableNumericPractice = false, enableFullSimulation = false, enableClozeMatching = false } = {}) {
  if (value?.schemaVersion === 'assembly-manifest/3') { if (!enableFullSimulation) throw new TypeError('Unsupported simulation protocol'); return runAssemblyReferenceV3(value); }
  if (value?.schemaVersion === 'assembly-manifest/4') { if (!enableClozeMatching) throw new TypeError('Unsupported cloze/matching protocol'); return runAssemblyReferenceV4(value); }
  if (value?.schemaVersion !== 'assembly-manifest/2') return runAssemblyReference(value);
  if (!enableNumericPractice) throw new TypeError('Unsupported assembly protocol');
  return runAssemblyReferenceV2(value);
}
export function practiceSlotSchema(manifest) {
  if (manifest.schemaVersion === 'assembly-manifest/4') return StudentSlotV4Schema;
  return manifest.schemaVersion === 'assembly-manifest/2' ? StudentSlotV2Schema : StudentSlotSchema;
}
export function parseNumericPracticeConfig(value) {
  const result = BlueprintConfigV2Schema.safeParse(value);
  if (!result.success) return null;
  const section = result.data.sections[0];
  return section.count <= 100 && section.durationSeconds <= 10800 ? result.data : null;
}

export function parseClozeMatchingConfig(value) {
  const result = BlueprintConfigV4Schema.safeParse(value);
  if (!result.success) return null;
  const section = result.data.sections[0];
  return section.count <= 100 && section.durationSeconds <= 10800 ? result.data : null;
}
