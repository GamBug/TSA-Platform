import { createHash, randomUUID } from 'node:crypto';
import { canonicalize, createReferenceHash } from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../database/pool.mjs';

export const MANUAL_REFERENCE_NAMESPACE = 'manual/1';
export const QUESTION_REFERENCE_NAMESPACE_PREFIX = 'question/1/';
export const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const REFERENCE_KINDS = new Set(['taxonomy', 'question', 'stimulus', 'asset', 'provenance', 'evidence', 'source']);
export const MAX_REFERENCE_NODES = 2_000;
export const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

export class BankCommandError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'BankCommandError';
    this.status = status;
    this.code = code;
  }
}

export function reject(status, code) {
  throw new BankCommandError(status, code);
}

export function jsonDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

export function referenceKey(kind, id) {
  return `${kind}\u0000${id}`;
}

export function compareReference(left, right) {
  return left.kind < right.kind ? -1 : left.kind > right.kind ? 1
    : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function strictRecord(value, expectedKeys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    reject(422, 'VALIDATION_ERROR');
  }
  const actual = Object.keys(value);
  if (actual.some((key) => !expectedKeys.includes(key))) reject(422, 'VALIDATION_ERROR');
  for (const key of expectedKeys) if (!Object.hasOwn(value, key)) reject(422, 'VALIDATION_ERROR');
  return value;
}

export function nonEmptyString(value, { max = 4_096 } = {}) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function requireActor(identityService, principal, policy) {
  if (!principal?.authenticated) reject(401, 'UNAUTHENTICATED');
  if (!identityService.mayPerform(principal, policy)) reject(403, 'FORBIDDEN');
  return principal.userId;
}

export function validateIdempotencyKey(key) {
  return typeof key === 'string' && /^[\x21-\x7e]{1,128}$/.test(key);
}

export async function assertBankConnection(pool) {
  const result = await pool.query(`
    SELECT session_user AS session_name, current_user AS current_name,
           session_role.rolcanlogin AS can_login,
           session_role.rolsuper AS is_superuser,
           session_role.rolcreatedb AS can_createdb,
           session_role.rolcreaterole AS can_createrole,
           session_role.rolreplication AS can_replicate,
           session_role.rolbypassrls AS bypass_rls,
           database_row.datdba = session_role.oid AS is_database_owner,
           EXISTS (SELECT 1 FROM pg_namespace n
                    WHERE n.nspowner IN (session_role.oid, bank_role.oid)
                      AND n.nspname IN ('tsa', 'tsa_private', 'tsa_meta')) AS owns_project_schema,
           EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relowner IN (session_role.oid, bank_role.oid)
                      AND n.nspname IN ('tsa', 'tsa_private', 'tsa_meta')
                      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS owns_project_relation,
           pg_has_role(session_user, 'tsa_bank', 'MEMBER') AS bank_member,
           EXISTS (SELECT 1 FROM pg_auth_members m
                    WHERE m.member = session_role.oid
                      AND m.roleid <> bank_role.oid) AS has_other_membership
      FROM pg_roles session_role
      JOIN pg_roles bank_role ON bank_role.rolname = 'tsa_bank'
      JOIN pg_database database_row ON database_row.datname = current_database()
     WHERE session_role.rolname = session_user
  `);
  const row = result.rows[0];
  if (!row || !row.can_login || row.is_superuser || row.can_createdb || row.can_createrole
      || row.can_replicate || row.bypass_rls || row.is_database_owner || row.owns_project_schema
      || row.owns_project_relation || row.session_name !== row.current_name
      || !row.bank_member || row.has_other_membership) {
    throw new Error('Bank runtime requires a restricted non-owner LOGIN member of tsa_bank');
  }
  await pool.query('SELECT 1 FROM tsa_private.reference_nodes LIMIT 0');
  return true;
}

/** Resolve and cryptographically verify an immutable, namespace-scoped reference closure. */
export async function resolveReferenceGraph(client, namespace, rootRefs, localDefinitions = []) {
  const local = new Map();
  for (const node of localDefinitions) {
    const key = referenceKey(node.kind, node.id);
    if (local.has(key)) reject(422, 'INVALID_REFERENCE_GRAPH');
    local.set(key, node);
  }

  const resolved = new Map();
  const active = new Set();
  let totalBytes = 0;
  const resolve = async (ref, depth = 0) => {
    if (depth > 64) reject(422, 'INVALID_REFERENCE_GRAPH');
    if (!REFERENCE_KINDS.has(ref.kind) || !nonEmptyString(ref.id, { max: 2_048 })) reject(422, 'INVALID_REFERENCE_GRAPH');
    const key = referenceKey(ref.kind, ref.id);
    if (active.has(key)) reject(422, 'INVALID_REFERENCE_GRAPH');
    const cached = resolved.get(key);
    if (cached) return cached;
    if (resolved.size >= MAX_REFERENCE_NODES) reject(422, 'INVALID_REFERENCE_GRAPH');

    let candidate = local.get(key);
    if (!candidate) {
      const stored = await client.query(
        `SELECT kind, id, payload, dependency_refs, content_hash
           FROM tsa_private.reference_nodes
          WHERE reference_namespace = $1 AND kind = $2 AND id = $3`, [namespace, ref.kind, ref.id]);
      if (stored.rowCount !== 1) reject(422, 'REFERENCE_NOT_FOUND');
      const row = stored.rows[0];
      let dependencyRefs;
      try { dependencyRefs = typeof row.dependency_refs === 'string' ? JSON.parse(row.dependency_refs) : row.dependency_refs; }
      catch { reject(422, 'INVALID_REFERENCE_GRAPH'); }
      candidate = {
        kind: row.kind,
        id: row.id,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        references: dependencyRefs,
        contentHash: row.content_hash,
      };
    } else {
      const existing = await client.query(
        `SELECT kind, id, payload, dependency_refs, content_hash
           FROM tsa_private.reference_nodes
          WHERE reference_namespace = $1 AND kind = $2 AND id = $3`, [namespace, ref.kind, ref.id]);
      if (existing.rowCount === 1) {
        const row = existing.rows[0];
        const storedPayload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const storedRefs = typeof row.dependency_refs === 'string' ? JSON.parse(row.dependency_refs) : row.dependency_refs;
        if (!Buffer.from(canonicalize(storedPayload)).equals(Buffer.from(canonicalize(candidate.payload)))
            || !Buffer.from(canonicalize(storedRefs)).equals(Buffer.from(canonicalize(candidate.references)))) {
          reject(409, 'REFERENCE_ID_CONFLICT');
        }
        candidate = { ...candidate, contentHash: row.content_hash };
      }
    }
    if (!candidate || !Array.isArray(candidate.references) || candidate.references.length > MAX_REFERENCE_NODES) {
      reject(422, 'INVALID_REFERENCE_GRAPH');
    }
    active.add(key);
    try {
      const children = [];
      const seenEdges = new Set();
      for (const childRef of candidate.references) {
        if (!childRef || typeof childRef !== 'object' || Array.isArray(childRef)
            || Object.keys(childRef).length !== 2 || !Object.hasOwn(childRef, 'kind') || !Object.hasOwn(childRef, 'id')) {
          reject(422, 'INVALID_REFERENCE_GRAPH');
        }
        const childKey = referenceKey(childRef.kind, childRef.id);
        if (seenEdges.has(childKey)) reject(422, 'INVALID_REFERENCE_GRAPH');
        seenEdges.add(childKey);
        children.push(await resolve(childRef, depth + 1));
      }
      const advertised = candidate.contentHash;
      const contentHash = createReferenceHash({
        kind: candidate.kind,
        id: candidate.id,
        payload: candidate.payload,
        references: children.map(({ kind, id, contentHash: childHash }) => ({ kind, id, contentHash: childHash })),
      });
      if (advertised !== undefined && advertised !== contentHash) reject(422, 'REFERENCE_HASH_MISMATCH');
      const normalized = {
        kind: candidate.kind,
        id: candidate.id,
        payload: candidate.payload,
        references: candidate.references.map(({ kind, id }) => ({ kind, id })).sort(compareReference),
        contentHash,
      };
      totalBytes += canonicalize({
        version: 'reference/1', kind: normalized.kind, id: normalized.id,
        payload: normalized.payload,
        references: normalized.references.map((edge) => ({
          ...edge,
          contentHash: resolved.get(referenceKey(edge.kind, edge.id))?.contentHash
            ?? children.find((child) => child.kind === edge.kind && child.id === edge.id)?.contentHash,
        })).sort(compareReference),
      }).byteLength;
      if (totalBytes > MAX_REFERENCE_BYTES) reject(422, 'INVALID_REFERENCE_GRAPH');
      resolved.set(key, normalized);
      return normalized;
    } finally {
      active.delete(key);
    }
  };

  for (const root of rootRefs) await resolve(root);
  return [...resolved.values()].sort(compareReference);
}

export async function storeReferenceGraph(client, namespace, nodes) {
  for (const node of nodes) {
    await client.query(
      `INSERT INTO tsa_private.reference_nodes
        (reference_namespace, kind, id, payload, dependency_refs, content_hash)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       ON CONFLICT (reference_namespace, kind, id) DO NOTHING`,
      [namespace, node.kind, node.id, JSON.stringify(node.payload), JSON.stringify(node.references), node.contentHash]);
  }
}

export async function withIdempotency(bankPool, principal, key, routeScope, requestValue, operation) {
  if (!validateIdempotencyKey(key)) reject(422, 'VALIDATION_ERROR');
  const requestHash = jsonDigest(requestValue);
  return withTransaction(bankPool, async (client) => {
    await client.query("SELECT set_config('tsa.bank_actor_id', $1, true)", [principal.userId]);
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify([principal.userId, routeScope, key])]);
    const existing = await client.query(
      `SELECT request_hash, response_status, safe_response
         FROM tsa.idempotency_records
        WHERE actor_id = $1 AND route_scope = $2 AND idempotency_key = $3`,
      [principal.userId, routeScope, key]);
    if (existing.rowCount === 1) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) reject(409, 'IDEMPOTENCY_CONFLICT');
      const body = typeof row.safe_response === 'string' ? JSON.parse(row.safe_response) : row.safe_response;
      return { status: row.response_status, body, replayed: true };
    }
    await client.query('SELECT pg_advisory_xact_lock(1414742321, 1)');
    const guard = await client.query('SELECT id FROM tsa.bank_state WHERE id = 1 FOR UPDATE');
    if (guard.rowCount !== 1) throw new Error('Bank state guard is unavailable');
    const result = await operation(client);
    const body = result.body;
    await client.query(
      `INSERT INTO tsa.idempotency_records
        (id, actor_id, route_scope, idempotency_key, request_hash, response_status,
         safe_response, resource_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [randomUUID(), principal.userId, routeScope, key, requestHash, result.status,
        JSON.stringify(body), result.resourceId ?? null]);
    return { ...result, replayed: false };
  }, { role: 'tsa_bank' });
}

