import { randomUUID } from 'node:crypto';
import { StaffFixedSealRequestSchema, StaffFixedSealReceiptSchema, StaffFixedFormListSchema,
  StaffFixedFormDetailSchema } from '../../../packages/contracts/dist/staff.js';
import { BlueprintConfigSchema, StudentSlotSchema, canonicalize, parseFixedAssemblyManifest,
  runFixedAssemblyReference } from '../../../packages/contracts/dist/internal.js';
import { assertBankConnection, reject, requireActor, UUID_PATTERN, jsonDigest, withIdempotency } from './common.mjs';
import { withTransaction } from '../database/pool.mjs';

function capped(schema, value) {
  const result = schema.parse(value);
  if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) reject(503, 'TEMPORARILY_UNAVAILABLE');
  return result;
}
async function sql(client, query, values) {
  try { return await client.query(query, values); }
  catch (error) {
    if (error.code === '42501') reject(403, 'FORBIDDEN');
    if (error.code === '40001') reject(409, 'CONCURRENT_MODIFICATION');
    if (error.code === '22023') reject(422, 'VALIDATION_ERROR');
    throw error;
  }
}

/** Trusted fixed-only sealing plan; never crosses the staff HTTP projection. */
export async function buildFixedSealPlan(client, principal, input) {
  const captured = (await sql(client, 'SELECT tsa.fixed_stock_capture($1,$2,$3,$4) AS value',
    [principal.userId, input.blueprintVersionId, input.blueprintHash, input.windowMinutes])).rows[0].value;
  if (!captured) reject(404, 'NOT_FOUND');
  const stock = captured.stock;
  if (stock.overflow) reject(503, 'TEMPORARILY_UNAVAILABLE');
  const parsed = parseFixedAssemblyManifest({ schemaVersion: 'fixed-assembly-manifest/1', algorithmVersion: 'assembly/1',
    formMode: 'PUBLISHED_FIXED', reuseMode: 'FIXED_AS_PUBLISHED', blueprintVersionId: input.blueprintVersionId,
    blueprintHash: stock.blueprintHash, blueprint: BlueprintConfigSchema.parse(stock.blueprint), seed: input.seed ?? 42,
    bankRevision: stock.bankRevision, units: stock.units, conflicts: stock.conflicts,
    rightsVersions: stock.rightsVersions.map(({sourceId, versionId, decision}) => ({sourceId, versionId, contentHash: jsonDigest(decision)})),
    limits: {maxNodes: 50000, maxUnits: 2000} });
  const result = runFixedAssemblyReference(parsed.manifest);
  if (result.status !== 'SUCCESS') reject(422, result.code);
  const inputs = (await sql(client, 'SELECT tsa.fixed_seal_inputs($1,$2::uuid[]) AS value',
    [principal.userId, result.slots.map(slot => slot.questionVersionId)])).rows[0].value;
  const byVersion = new Map(inputs.map(item => [item.questionVersionId, item]));
  if (byVersion.size !== result.slots.length) reject(409, 'CONCURRENT_MODIFICATION');
  const plan = {capturedAt: captured.capturedAt, availableUntil: captured.availableUntil,
    requiredThrough: captured.requiredThrough, windowMinutes: input.windowMinutes,
    manifest: parsed.manifest, manifestBytes: Buffer.from(parsed.bytes).toString('utf8'), manifestHash: parsed.manifestHash,
    result, slotsBytes: Buffer.from(canonicalize(result.slots)).toString('utf8'), rightsSnapshots: stock.rightsVersions.map(row => ({sourceId: row.sourceId, versionId: row.versionId, decisionBytes: Buffer.from(canonicalize(row.decision)).toString('utf8')})), runId: randomUUID(), formId: randomUUID(), snapshots: []};
  for (const slot of result.slots) {
    const value = byVersion.get(slot.questionVersionId), slotId = randomUUID();
    const publicSnapshot = StudentSlotSchema.parse({slotId, sectionId: slot.sectionId, ordinal: slot.ordinal + 1,
      stimulus: value.stimulus, content: value.content, interaction: value.interaction});
    const privateSnapshot = {answerKey: value.answerKey, explanation: value.explanation, policyVersion: value.policyVersion};
    plan.snapshots.push({slotId, questionVersionId: slot.questionVersionId, publicSnapshot, privateSnapshot,
      publicBytes: Buffer.from(canonicalize(publicSnapshot)).toString('utf8'), privateBytes: Buffer.from(canonicalize(privateSnapshot)).toString('utf8'),
      publicHash: jsonDigest(publicSnapshot), privateHash: jsonDigest(privateSnapshot)});
  }
  const form = {schemaVersion: 'fixed-sealed-form/1', id: plan.formId, blueprintVersionId: input.blueprintVersionId,
    mode: 'PUBLISHED_FIXED', ownerUserId: null,
    policyVersions: {scoring: parsed.manifest.blueprint.scoringPolicy, release: parsed.manifest.blueprint.releasePolicy},
    sections: parsed.manifest.blueprint.sections,
    slots: result.slots.map((slot, index) => ({slotId: plan.snapshots[index].slotId, questionId: slot.questionId,
      questionVersionId: slot.questionVersionId, sectionId: slot.sectionId, ordinal: slot.ordinal + 1,
      publicHash: plan.snapshots[index].publicHash, privateHash: plan.snapshots[index].privateHash}))};
  plan.formBytes = Buffer.from(canonicalize(form)).toString('utf8'); plan.formHash = jsonDigest(form);
  return plan;
}

export async function createFixedFormSealingService({bankPool, identityService, enableCreation = false}) {
  if (typeof enableCreation !== 'boolean') throw new TypeError('Fixed sealing opt-in must be boolean');
  await assertBankConnection(bankPool);
  function actor(principal) {
    requireActor(identityService, principal, 'exam.assembly.write');
    if (!principal.roles?.includes('EXAM_MANAGER')) reject(403, 'FORBIDDEN');
  }
  async function create(principal, input, key) {
    actor(principal);
    const parsed = StaffFixedSealRequestSchema.safeParse(input);
    if (!parsed.success) reject(422, 'VALIDATION_ERROR');
    const allowed = await withTransaction(bankPool, async client => (await sql(client,
      'SELECT tsa.fixed_stock_exam_actor($1) AS allowed', [principal.userId])).rows[0].allowed, {role: 'tsa_bank'});
    if (!allowed) reject(403, 'FORBIDDEN');
    const response = await withIdempotency(bankPool, principal, key, 'POST /api/v1/assemblies', parsed.data, async client => {
      if (!enableCreation) reject(404, 'NOT_FOUND');
      const plan = await buildFixedSealPlan(client, principal, parsed.data);
      const body = (await sql(client, 'SELECT tsa.fixed_seal_commit($1,$2,$3::jsonb) AS value',
        [principal.userId, jsonDigest(parsed.data), JSON.stringify(plan)])).rows[0].value;
      return {status: 201, body: capped(StaffFixedSealReceiptSchema, body), resourceId: body.formId};
    });
    return {...response, body: capped(StaffFixedSealReceiptSchema, response.body)};
  }
  async function read(principal, id = null) {
    actor(principal);
    if (id !== null && !UUID_PATTERN.test(id)) reject(404, 'NOT_FOUND');
    return withTransaction(bankPool, async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const row = (await sql(client, 'SELECT tsa.fixed_form_snapshot($1,$2) AS value', [principal.userId, id])).rows[0].value;
      if (!row) reject(404, 'NOT_FOUND');
      const meta = {environment: 'LOCAL_SYNTHETIC_ONLY', accessBasis: 'EXAM_MANAGER', observedAt: row.observedAt};
      return id === null ? capped(StaffFixedFormListSchema, {...meta, schemaVersion: 'staff-fixed-forms/1',
        limit: 20, truncated: row.truncated, items: row.items}) : capped(StaffFixedFormDetailSchema,
        {...meta, schemaVersion: 'staff-fixed-form/1', form: row.form, availability: row.availability});
    }, {role: 'tsa_bank'});
  }
  return Object.freeze({create, list: principal => read(principal), read});
}
