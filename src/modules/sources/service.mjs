import { randomUUID } from 'node:crypto';
import { createReferenceHash } from '../../../packages/contracts/dist/internal.js';
import {
  MANUAL_REFERENCE_NAMESPACE,
  assertBankConnection,
  nonEmptyString,
  reject,
  requireActor,
  storeReferenceGraph,
  strictRecord,
  withIdempotency,
} from '../bank/common.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RIGHTS_STATES = new Set(['OWNED', 'LICENSED', 'OPEN_LICENSE', 'PUBLIC_DOMAIN', 'REFERENCE_ONLY', 'UNKNOWN', 'REVOKED']);
const RIGHTS_USES = new Set(['DISPLAY', 'ADAPT', 'GENERATE', 'TRAIN']);

function isInstant(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
      || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHourText !== undefined
      && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) return false;
  return true;
}

function validateMetadata(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) reject(422, 'VALIDATION_ERROR');
  const entries = Object.entries(value);
  if (entries.some(([key, entry]) => !nonEmptyString(key, { max: 1024 * 1024 })
      || typeof entry !== 'string')) reject(422, 'VALIDATION_ERROR');
  return value;
}

function sourcePayload(row, version) {
  if (row.origin !== 'OWNED' && row.origin !== 'EXTERNAL') reject(422, 'SOURCE_ORIGIN_UNKNOWN');
  return {
    schemaVersion: 'manual-source/1',
    sourceId: row.id,
    sourceVersionId: version.id,
    sourceTitle: row.title,
    sourceOrigin: row.origin,
    canonicalUri: row.canonical_uri,
    ownerReference: row.owner_reference,
    sourceVersionNo: version.version_no,
    sourceContentHash: version.content_hash,
    evidenceUri: version.evidence_uri,
    metadata: version.metadata,
  };
}

function sourceReference(payload) {
  return {
    kind: 'source',
    id: payload.sourceVersionId,
    payload,
    references: [],
    contentHash: createReferenceHash({ kind: 'source', id: payload.sourceVersionId, payload, references: [] }),
  };
}

async function recordAudit(client, actorId, action, entityType, entityId, beforeRevision = null, afterRevision = null) {
  await client.query(
    `INSERT INTO tsa.audit_events
      (id, actor_id, action, entity_type, entity_id, before_revision, after_revision)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), actorId, action, entityType, entityId, beforeRevision, afterRevision]);
}

export async function registerSource(bankPool, identityService, principal, key, input) {
  requireActor(identityService, principal, 'bank.question.author');
  strictRecord(input, ['title', 'canonicalUri', 'origin'], 'source');
  if (!nonEmptyString(input.title, { max: 1024 * 1024 })
      || !(input.canonicalUri === null || nonEmptyString(input.canonicalUri, { max: 1024 * 1024 }))
      || !['OWNED', 'EXTERNAL'].includes(input.origin)) reject(422, 'VALIDATION_ERROR');
  return withIdempotency(bankPool, principal, key, 'POST /api/v1/sources', input, async (client) => {
    const sourceId = randomUUID();
    await client.query(
      `INSERT INTO tsa.sources (id, title, canonical_uri, owner_reference, origin, created_by)
       VALUES ($1, $2, $3, NULL, $4, $5)`,
      [sourceId, input.title, input.canonicalUri, input.origin, principal.userId]);
    await recordAudit(client, principal.userId, 'SOURCE_REGISTERED', 'source', sourceId);
    return { status: 201, body: { sourceId }, resourceId: sourceId };
  });
}

export async function registerSourceVersion(bankPool, identityService, principal, sourceId, key, input) {
  requireActor(identityService, principal, 'bank.question.author');
  if (!UUID_PATTERN.test(sourceId)) reject(404, 'NOT_FOUND');
  strictRecord(input, ['contentHash', 'evidenceUri', 'metadata'], 'source version');
  if (!HASH_PATTERN.test(input.contentHash) || !nonEmptyString(input.evidenceUri, { max: 1024 * 1024 })) {
    reject(422, 'VALIDATION_ERROR');
  }
  validateMetadata(input.metadata);
  const encodedBytes = Buffer.byteLength(JSON.stringify(input.metadata), 'utf8');
  if (encodedBytes > 262_144) reject(413, 'PAYLOAD_TOO_LARGE');
  return withIdempotency(bankPool, principal, key, `POST /api/v1/sources/${sourceId}/versions`, input, async (client) => {
    const sourceResult = await client.query(
      `SELECT id, title, canonical_uri, owner_reference, origin, created_by
         FROM tsa.sources WHERE id = $1 FOR UPDATE`, [sourceId]);
    const source = sourceResult.rows[0];
    if (!source || source.created_by !== principal.userId) reject(404, 'NOT_FOUND');
    if (source.origin !== 'OWNED' && source.origin !== 'EXTERNAL') reject(422, 'SOURCE_ORIGIN_UNKNOWN');
    const nextNoResult = await client.query(
      'SELECT COALESCE(max(version_no), 0) + 1 AS version_no FROM tsa.source_versions WHERE source_id = $1',
      [sourceId]);
    const versionNo = Number(nextNoResult.rows[0].version_no);
    const sourceVersionId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO tsa.source_versions (id, source_id, version_no, content_hash, metadata, evidence_uri)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, version_no, content_hash, metadata, evidence_uri`,
      [sourceVersionId, sourceId, versionNo, input.contentHash, JSON.stringify(input.metadata), input.evidenceUri]);
    const version = inserted.rows[0];
    const payload = sourcePayload(source, version);
    await storeReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, [sourceReference(payload)]);
    await recordAudit(client, principal.userId, 'SOURCE_VERSION_REGISTERED', 'source_version', sourceVersionId, null, versionNo);
    return { status: 201, body: { sourceVersionId }, resourceId: sourceVersionId };
  });
}

export async function registerRightsDecision(bankPool, identityService, principal, sourceVersionId, key, input) {
  requireActor(identityService, principal, 'bank.diagnostics.read');
  if (!UUID_PATTERN.test(sourceVersionId)) reject(404, 'NOT_FOUND');
  strictRecord(input, ['status', 'allowedUses', 'territory', 'validFrom', 'validTo', 'evidence', 'expectedRevision'], 'rights decision');
  if (!RIGHTS_STATES.has(input.status) || !Array.isArray(input.allowedUses) || input.allowedUses.length === 0
      || input.allowedUses.some((use) => !RIGHTS_USES.has(use))
      || new Set(input.allowedUses).size !== input.allowedUses.length
      || !Array.isArray(input.territory) || input.territory.length === 0
      || input.territory.some((item) => !nonEmptyString(item, { max: 1024 * 1024 }))
      || !isInstant(input.validFrom) || !(input.validTo === null || isInstant(input.validTo))
      || !nonEmptyString(input.evidence, { max: 1024 * 1024 })
      || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) reject(422, 'VALIDATION_ERROR');
  return withIdempotency(bankPool, principal, key, `POST /api/v1/source-versions/${sourceVersionId}/rights`, input, async (client) => {
    const sourceVersionResult = await client.query(
      `SELECT sv.id, sv.source_id, sv.version_no, sv.content_hash, sv.metadata, sv.evidence_uri,
              s.title, s.canonical_uri, s.owner_reference, s.origin
         FROM tsa.source_versions sv JOIN tsa.sources s ON s.id=sv.source_id
        WHERE sv.id = $1 FOR UPDATE OF sv`, [sourceVersionId]);
    if (sourceVersionResult.rowCount !== 1) reject(404, 'NOT_FOUND');
    const rightsResult = await client.query(
      `SELECT sr.revision, sr.decision_id
         FROM tsa.source_rights sr WHERE sr.source_version_id = $1 FOR UPDATE`, [sourceVersionId]);
    const prior = rightsResult.rows[0] ?? null;
    const revision = prior ? Number(prior.revision) : 0;
    if (revision !== input.expectedRevision) reject(409, 'REVISION_CONFLICT');

    const blocked = await client.query('SELECT tsa.source_has_delivery_dependencies($1) AS affects_selected_content', [sourceVersionId]);
    if (blocked.rows[0]?.affects_selected_content) reject(409, 'RIGHTS_CHANGE_REQUIRES_HOLD');

    const decisionId = randomUUID();
    const rightsPayload = {
      id: decisionId,
      sourceVersionId,
      state: input.status,
      allowedUses: input.allowedUses,
      territories: input.territory,
      validFrom: input.validFrom,
      validUntil: input.validTo,
      evidence: input.evidence,
    };
    await client.query(
      `INSERT INTO tsa.rights_decisions
        (id, source_version_id, status, allowed_uses, territory, valid_from, valid_to,
         evidence, decided_by, supersedes_id)
       VALUES ($1, $2, $3::tsa.rights_state, $4::tsa.rights_use[], $5::text[],
               $6::timestamptz, $7::timestamptz, $8::jsonb, $9, $10)`,
      [decisionId, sourceVersionId, input.status, input.allowedUses, input.territory,
        input.validFrom, input.validTo, JSON.stringify({ text: input.evidence }), principal.userId,
        prior?.decision_id ?? null]);
    if (prior) {
      await client.query(
        `UPDATE tsa.source_rights SET decision_id = $2, revision = $3, updated_at = clock_timestamp()
          WHERE source_version_id = $1`, [sourceVersionId, decisionId, revision + 1]);
    } else {
      await client.query(
        `INSERT INTO tsa.source_rights (source_version_id, decision_id, revision)
         VALUES ($1, $2, 1)`, [sourceVersionId, decisionId]);
    }
    let sourceNodeResult = await client.query(
      `SELECT kind, id, payload, dependency_refs, content_hash
         FROM tsa_private.reference_nodes
        WHERE reference_namespace = $1 AND kind = 'source' AND id = $2`,
      [MANUAL_REFERENCE_NAMESPACE, sourceVersionId]);
    if (sourceNodeResult.rowCount === 0) {
      // Imported containers retain their original private Factory graph. A new
      // explicit manager decision gets a separate local SQL source snapshot;
      // package rights claims are never promoted or rewritten.
      const version = sourceVersionResult.rows[0];
      const node = sourceReference(sourcePayload({ ...version, id: version.source_id }, version));
      await storeReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, [node]);
      sourceNodeResult = { rowCount: 1, rows: [{ ...node, dependency_refs: node.references, content_hash: node.contentHash }] };
    }
    if (sourceNodeResult.rowCount !== 1) reject(422, 'SOURCE_REFERENCE_NOT_REGISTERED');
    const sourcePayloadRow = sourceNodeResult.rows[0];
    const sourceNode = {
      kind: 'source',
      id: sourcePayloadRow.id,
      payload: typeof sourcePayloadRow.payload === 'string' ? JSON.parse(sourcePayloadRow.payload) : sourcePayloadRow.payload,
      references: typeof sourcePayloadRow.dependency_refs === 'string' ? JSON.parse(sourcePayloadRow.dependency_refs) : sourcePayloadRow.dependency_refs,
      contentHash: sourcePayloadRow.content_hash,
    };
    const evidenceNode = {
      kind: 'evidence',
      id: decisionId,
      payload: rightsPayload,
      references: [{ kind: 'source', id: sourceVersionId }],
    };
    evidenceNode.contentHash = createReferenceHash({
      kind: evidenceNode.kind,
      id: evidenceNode.id,
      payload: evidenceNode.payload,
      references: [{ kind: 'source', id: sourceVersionId, contentHash: sourceNode.contentHash }],
    });
    await storeReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, [evidenceNode]);
    const nextRevision = revision + 1;
    await client.query('UPDATE tsa.bank_state SET eligibility_revision = eligibility_revision + 1, updated_at = clock_timestamp() WHERE id = 1');
    await recordAudit(client, principal.userId, 'SOURCE_RIGHTS_RECORDED', 'source_version', sourceVersionId,
      prior ? revision : null, nextRevision);
    return { status: 201, body: { decisionId, revision: nextRevision }, resourceId: decisionId };
  });
}

export async function createSourceService({ bankPool, identityService }) {
  if (!bankPool || !identityService) throw new TypeError('Bank pool and identity service are required');
  await assertBankConnection(bankPool);
  return Object.freeze({
    registerSource: (principal, key, input) => registerSource(bankPool, identityService, principal, key, input),
    registerSourceVersion: (principal, sourceId, key, input) => registerSourceVersion(bankPool, identityService, principal, sourceId, key, input),
    registerRightsDecision: (principal, sourceVersionId, key, input) => registerRightsDecision(bankPool, identityService, principal, sourceVersionId, key, input),
  });
}
