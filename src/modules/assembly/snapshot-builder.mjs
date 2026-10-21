import { randomUUID } from 'node:crypto';
import { canonicalize, parseAssemblyManifest, runAssemblyReference, StudentSlotSchema } from '../../../packages/contracts/dist/internal.js';
import { jsonDigest, reject } from '../bank/common.mjs';
import { withTransaction } from '../database/pool.mjs';

/** Build exact public/private sealing bytes only inside the trusted service. */
export async function buildAllocationPlan(examPool, principal, captured) {
  const parsed = parseAssemblyManifest(captured.manifest);
  const result = runAssemblyReference(parsed.manifest);
  if (parsed.manifestHash !== captured.manifestHash || jsonDigest(result) !== jsonDigest(captured.result)) reject(422, 'VALIDATION_ERROR');
  const plan = {
    manifest: parsed.manifest, manifestBytes: Buffer.from(parsed.bytes).toString('utf8'),
    manifestHash: parsed.manifestHash, historyRevision: captured.historyRevision,
    offeringRevision: captured.offeringRevision, result,
  };
  if (result.status !== 'SUCCESS') return plan;
  const inputs = await withTransaction(examPool, async (client) => {
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
    return (await client.query('SELECT tsa.assembly_snapshot_inputs($1::uuid[]) AS inputs',
      [result.slots.map((slot) => slot.questionVersionId)])).rows[0].inputs;
  }, { role: 'tsa_exam' });
  const byVersion = new Map(inputs.map((input) => [input.questionVersionId, input]));
  Object.assign(plan, { runId: randomUUID(), formId: randomUUID(), attemptId: randomUUID(), snapshots: [] });
  // A current restriction may have appeared after capture. The final transaction
  // recognizes stale inputs before considering persistence or the empty snapshot set.
  if (byVersion.size !== result.slots.length) return plan;
  for (const slot of result.slots) {
    const input = byVersion.get(slot.questionVersionId);
    const slotId = randomUUID();
    const publicSnapshot = StudentSlotSchema.parse({ slotId, sectionId: slot.sectionId,
      ordinal: slot.ordinal + 1, stimulus: null, content: input.content, interaction: input.interaction });
    const privateSnapshot = { answerKey: input.answerKey, explanation: input.explanation, policyVersion: input.policyVersion };
    plan.snapshots.push({ slotId, questionVersionId: slot.questionVersionId,
      publicSnapshot, publicBytes: Buffer.from(canonicalize(publicSnapshot)).toString('utf8'), publicHash: jsonDigest(publicSnapshot),
      privateSnapshot, privateBytes: Buffer.from(canonicalize(privateSnapshot)).toString('utf8'), privateHash: jsonDigest(privateSnapshot) });
  }
  const form = {
    schemaVersion: 'sealed-form/1', id: plan.formId, blueprintVersionId: parsed.manifest.blueprintVersionId,
    mode: 'PERSONALIZED_PRACTICE', ownerUserId: principal.userId,
    policyVersions: { scoring: parsed.manifest.blueprint.scoringPolicy, release: parsed.manifest.blueprint.releasePolicy },
    sections: parsed.manifest.blueprint.sections,
    slots: result.slots.map((slot, index) => ({ slotId: plan.snapshots[index].slotId,
      questionId: slot.questionId, questionVersionId: slot.questionVersionId, sectionId: slot.sectionId,
      ordinal: slot.ordinal + 1, publicHash: plan.snapshots[index].publicHash, privateHash: plan.snapshots[index].privateHash })),
  };
  plan.formBytes = Buffer.from(canonicalize(form)).toString('utf8');
  plan.formHash = jsonDigest(form);
  return plan;
}
