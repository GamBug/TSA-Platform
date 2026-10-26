import {
  AttemptHistoryPageSchema,
  AttemptHistoryQuerySchema,
  CatalogEntrySchema,
  CatalogPageSchema,
  CatalogQuerySchema,
  MvpBlueprintConfigSchema,
} from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../database/pool.mjs';
import { BankCommandError, reject, requireActor, UUID_PATTERN } from '../bank/common.mjs';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_CURSOR_LENGTH = 1_024;
const UTC_MICROSECOND_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { return null; }
}

function parsePageQuery(rawQuery, schema) {
  let query;
  if (rawQuery instanceof URLSearchParams) {
    query = Object.create(null);
    for (const [name, value] of rawQuery) {
      if (Object.hasOwn(query, name)) reject(422, 'VALIDATION_ERROR');
      query[name] = value;
    }
  } else if (rawQuery === undefined || rawQuery === null) {
    query = {};
  } else if (isRecord(rawQuery)) {
    query = rawQuery;
  } else {
    reject(422, 'VALIDATION_ERROR');
  }

  const parsed = schema.safeParse(query);
  if (!parsed.success) reject(422, 'VALIDATION_ERROR');
  return Object.freeze({
    limit: parsed.data.limit ?? DEFAULT_PAGE_LIMIT,
    cursor: parsed.data.cursor ?? null,
  });
}

function canonicalObject(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && keys.every((key) => expectedKeys.includes(key));
}

function encodeCursor(value) {
  const cursor = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  if (cursor.length < 1 || cursor.length > MAX_CURSOR_LENGTH) reject(503, 'TEMPORARILY_UNAVAILABLE');
  return cursor;
}

function isUtcMicrosecondInstant(value) {
  if (typeof value !== 'string' || !UTC_MICROSECOND_INSTANT.test(value)
      || value.startsWith('0000-') || Number.isNaN(Date.parse(value))) return false;
  try { return new Date(value).toISOString().slice(0, 23) === value.slice(0, 23); }
  catch { return false; }
}

function decodeCursor(encoded, kind) {
  if (encoded === null) return null;
  if (typeof encoded !== 'string' || encoded.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    reject(422, 'VALIDATION_ERROR');
  }
  let bytes;
  let text;
  let value;
  try {
    bytes = Buffer.from(encoded, 'base64url');
    text = bytes.toString('utf8');
    value = JSON.parse(text);
  } catch {
    reject(422, 'VALIDATION_ERROR');
  }
  if (bytes.toString('base64url') !== encoded || Buffer.from(text, 'utf8').compare(bytes) !== 0
      || JSON.stringify(value) !== text) {
    reject(422, 'VALIDATION_ERROR');
  }

  if (kind === 'catalog') {
    if (!canonicalObject(value, ['v', 'kind', 'afterBlueprintId'])
        || value.v !== 1 || value.kind !== 'catalog'
        || typeof value.afterBlueprintId !== 'string' || !UUID_PATTERN.test(value.afterBlueprintId)) {
      reject(422, 'VALIDATION_ERROR');
    }
    if (encoded !== encodeCursor({ v: 1, kind: 'catalog', afterBlueprintId: value.afterBlueprintId })) {
      reject(422, 'VALIDATION_ERROR');
    }
    return Object.freeze({ afterBlueprintId: value.afterBlueprintId });
  }

  if (!canonicalObject(value, ['v', 'kind', 'beforeCreatedAt', 'beforeId'])
      || value.v !== 1 || value.kind !== 'history'
      || !isUtcMicrosecondInstant(value.beforeCreatedAt)
      || typeof value.beforeId !== 'string' || !UUID_PATTERN.test(value.beforeId)) {
    reject(422, 'VALIDATION_ERROR');
  }
  if (encoded !== encodeCursor({
    v: 1, kind: 'history', beforeCreatedAt: value.beforeCreatedAt, beforeId: value.beforeId,
  })) reject(422, 'VALIDATION_ERROR');
  return Object.freeze({ beforeCreatedAt: value.beforeCreatedAt, beforeId: value.beforeId });
}

function parseEnvelope(value, expectedKeys) {
  const envelope = parseJson(value);
  if (!canonicalObject(envelope, expectedKeys)) reject(503, 'TEMPORARILY_UNAVAILABLE');
  return envelope;
}

function parseCatalogEnvelope(value, limit) {
  const envelope = parseEnvelope(value, ['items', 'next']);
  const rawItems = envelope.items;
  if (!Array.isArray(rawItems) || rawItems.length > limit || !(envelope.next === null
      || (typeof envelope.next === 'string' && UUID_PATTERN.test(envelope.next)))) {
    reject(503, 'TEMPORARILY_UNAVAILABLE');
  }

  const seen = new Set();
  const items = rawItems.map((raw) => {
    if (!isRecord(raw) || !canonicalObject(raw, ['entry', 'config'])) reject(503, 'TEMPORARILY_UNAVAILABLE');
    const config = MvpBlueprintConfigSchema.safeParse(parseJson(raw.config));
    const parsedEntry = CatalogEntrySchema.safeParse(parseJson(raw.entry));
    if (!config.success || !parsedEntry.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
    const entry = parsedEntry.data;
    const section = config.data.sections[0];
    if (entry.mode !== 'PERSONALIZED_PRACTICE' || entry.reviewAllowed !== false
        || entry.name !== config.data.name
        || entry.domain !== section.section
        || entry.questionCount !== section.count
        || entry.durationSeconds !== section.durationSeconds
        || entry.profileKind !== config.data.profileKind
        || seen.has(entry.blueprintVersionId)) {
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
    seen.add(entry.blueprintVersionId);
    // Return only the frozen public catalog entry; the validated blueprint config stays private.
    return entry;
  });

  const nextCursor = envelope.next === null ? null : encodeCursor({
    v: 1,
    kind: 'catalog',
    afterBlueprintId: envelope.next,
  });
  const page = CatalogPageSchema.safeParse({ items, nextCursor });
  if (!page.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
  return page.data;
}

function parseHistoryEnvelope(value, limit) {
  const envelope = parseEnvelope(value, ['items', 'next']);
  if (!Array.isArray(envelope.items) || envelope.items.length > limit) reject(503, 'TEMPORARILY_UNAVAILABLE');
  let next = null;
  if (envelope.next !== null) {
    if (!canonicalObject(envelope.next, ['createdAt', 'id'])
        || !isUtcMicrosecondInstant(envelope.next.createdAt)
        || typeof envelope.next.id !== 'string' || !UUID_PATTERN.test(envelope.next.id)) {
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
    next = encodeCursor({
      v: 1,
      kind: 'history',
      beforeCreatedAt: envelope.next.createdAt,
      beforeId: envelope.next.id,
    });
  }
  const page = AttemptHistoryPageSchema.safeParse({ items: envelope.items, nextCursor: next });
  if (!page.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
  return page.data;
}

async function runQuery(examPool, work) {
  try { return await withTransaction(examPool, work, { role: 'tsa_exam' }); }
  catch (error) {
    if (error instanceof BankCommandError) throw error;
    reject(503, 'TEMPORARILY_UNAVAILABLE');
  }
}

/** Owner-scoped catalog and compact attempt-history reads over the restricted exam role. */
export function createStudentDirectoryService({ examPool, identityService, enableReviewPractice = false } = {}) {
  if (!examPool || typeof examPool.connect !== 'function') throw new TypeError('examPool is required');
  if (!identityService || typeof identityService.mayPerform !== 'function') {
    throw new TypeError('identityService is required');
  }

  if (typeof enableReviewPractice !== 'boolean') throw new TypeError('Review practice opt-in must be boolean');

  async function catalog(principal, rawQuery = {}) {
    const userId = requireActor(identityService, principal, 'candidate.attempt.read');
    const query = parsePageQuery(rawQuery, CatalogQuerySchema);
    const cursor = decodeCursor(query.cursor, 'catalog');
    const value = await runQuery(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [userId]);
      const result = await client.query(
        'SELECT tsa.exam_catalog_page($1::integer,$2::uuid) AS result',
        [query.limit, cursor?.afterBlueprintId ?? null],
      );
      return result.rows[0]?.result;
    });
    const page = parseCatalogEnvelope(value, query.limit);
    // SQL metadata stays legacy-strict; only this trusted capability flag advertises review.
    return enableReviewPractice ? { ...page, items: page.items.map((entry) => ({ ...entry, reviewAllowed: true })) } : page;
  }

  async function history(principal, rawQuery = {}) {
    const userId = requireActor(identityService, principal, 'candidate.attempt.read');
    const query = parsePageQuery(rawQuery, AttemptHistoryQuerySchema);
    const cursor = decodeCursor(query.cursor, 'history');
    const value = await runQuery(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [userId]);
      const result = await client.query(
        'SELECT tsa.exam_history_page($1::integer,$2::timestamptz,$3::uuid) AS result',
        [query.limit, cursor?.beforeCreatedAt ?? null, cursor?.beforeId ?? null],
      );
      return result.rows[0]?.result;
    });
    return parseHistoryEnvelope(value, query.limit);
  }

  return Object.freeze({ catalog, history });
}
