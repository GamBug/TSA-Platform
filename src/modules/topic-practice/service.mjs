import { createHash } from 'node:crypto';
import { CreationReceiptSchema, IdempotencyKeySchema } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../attempts/service.mjs';
import { withTransaction } from '../database/pool.mjs';
import { BankCommandError, jsonDigest, reject, requireActor, UUID_PATTERN } from '../bank/common.mjs';

const MAX_TOPICS = 100;
const MAX_QUESTIONS = 100;
const MAX_DURATION_SECONDS = 10_800;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function parseTopicRequest(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !['taxonomyVersionId','topicIds','questionCount','durationSeconds'].includes(key))) {
    reject(422, 'VALIDATION_ERROR');
  }
  const { taxonomyVersionId, topicIds, questionCount } = value;
  const durationSeconds = value.durationSeconds ?? questionCount * 60;
  if (typeof taxonomyVersionId !== 'string' || !UUID_PATTERN.test(taxonomyVersionId)
      || !Array.isArray(topicIds) || topicIds.length < 1 || topicIds.length > MAX_TOPICS
      || topicIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
      || new Set(topicIds).size !== topicIds.length
      || !Number.isSafeInteger(questionCount) || questionCount < 1 || questionCount > MAX_QUESTIONS
      || !Number.isSafeInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > MAX_DURATION_SECONDS) {
    reject(422, 'VALIDATION_ERROR');
  }
  return Object.freeze({
    taxonomyVersionId,
    topicIds: Object.freeze([...topicIds].sort()),
    questionCount,
    durationSeconds,
  });
}

function parseCatalog(value) {
  const envelope = parseJson(value);
  if (!isRecord(envelope) || Object.keys(envelope).length !== 1 || !Array.isArray(envelope.taxonomies)) {
    reject(503, 'TEMPORARILY_UNAVAILABLE');
  }
  const groups = [];
  const taxonomyIds = new Set();
  for (const taxonomy of envelope.taxonomies) {
    if (!isRecord(taxonomy) || typeof taxonomy.taxonomyVersionId !== 'string'
        || !UUID_PATTERN.test(taxonomy.taxonomyVersionId) || taxonomyIds.has(taxonomy.taxonomyVersionId)
        || typeof taxonomy.name !== 'string' || !Number.isSafeInteger(taxonomy.versionNo)
        || !Array.isArray(taxonomy.nodes)) reject(503, 'TEMPORARILY_UNAVAILABLE');
    taxonomyIds.add(taxonomy.taxonomyVersionId);
    const byId = new Map();
    for (const raw of taxonomy.nodes) {
      if (!isRecord(raw) || typeof raw.id !== 'string' || !UUID_PATTERN.test(raw.id)
          || typeof raw.code !== 'string' || typeof raw.kind !== 'string'
          || !(raw.parentId === null || (typeof raw.parentId === 'string' && UUID_PATTERN.test(raw.parentId)))
          || typeof raw.label !== 'string' || !Number.isSafeInteger(raw.eligibleCount) || raw.eligibleCount < 0
          || !Number.isSafeInteger(raw.attemptedCount) || raw.attemptedCount < 0
          || !(raw.accuracy === null || (typeof raw.accuracy === 'number' && Number.isFinite(raw.accuracy) && raw.accuracy >= 0 && raw.accuracy <= 100))
          || byId.has(raw.id)) reject(503, 'TEMPORARILY_UNAVAILABLE');
      byId.set(raw.id, {
        id: raw.id, code: raw.code, label: raw.label, kind: raw.kind,
        taxonomyVersionId: taxonomy.taxonomyVersionId, parentId: raw.parentId,
        eligibleCount: raw.eligibleCount, attemptedCount: raw.attemptedCount, accuracy: raw.accuracy,
        children: [],
        ...(raw.questionFamily === undefined ? {} : { questionFamily: raw.questionFamily }),
        ...(Array.isArray(raw.interactionTypes) ? { interactionTypes: raw.interactionTypes } : {}),
        ...(Array.isArray(raw.cognitiveLevels) ? { cognitiveLevels: raw.cognitiveLevels } : {}),
        ...(Array.isArray(raw.difficulties) ? { difficulties: raw.difficulties } : {}),
      });
    }
    const roots = [];
    for (const node of byId.values()) {
      if (node.kind === 'DOMAIN' && node.id === taxonomy.nodes.find((row) => row.id === node.id)?.id
          && taxonomy.nodes.find((row) => row.id === node.id)?.parentId === null) {
        roots.push(node);
      }
      if (node.parentId !== null) {
        const parent = byId.get(node.parentId);
        if (!parent) reject(503, 'TEMPORARILY_UNAVAILABLE');
        parent.children.push(node);
      }
    }
    const sortTree = (node) => {
      node.children.sort((a, b) => a.code.localeCompare(b.code));
      node.rootId = roots.find((root) => {
        let current = node;
        while (current.parentId !== null && byId.has(current.parentId)) current = byId.get(current.parentId);
        return current.id === root.id;
      })?.id ?? null;
      for (const child of node.children) sortTree(child);
    };
    roots.sort((a, b) => a.code.localeCompare(b.code));
    for (const root of roots) sortTree(root);
    groups.push(...roots);
  }
  return Object.freeze({ groups: Object.freeze(groups) });
}

function parsePreparedProfile(value, request) {
  const result = parseJson(value);
  if (!isRecord(result) || result.status !== 'READY'
      || typeof result.blueprintVersionId !== 'string' || !UUID_PATTERN.test(result.blueprintVersionId)
      || result.taxonomyVersionId !== request.taxonomyVersionId
      || result.domain !== 'MATH' && result.domain !== 'READING' && result.domain !== 'SCIENCE'
      || result.questionCount !== request.questionCount || result.durationSeconds !== request.durationSeconds
) {
    reject(503, 'TEMPORARILY_UNAVAILABLE');
  }
  return Object.freeze({
    blueprintVersionId: result.blueprintVersionId,
    taxonomyVersionId: result.taxonomyVersionId,
    topicIds: request.topicIds,
    name: 'Luyện tập theo chủ đề',
    domain: result.domain,
    questionCount: result.questionCount,
    durationSeconds: result.durationSeconds,
    topicPractice: true,
    isShort: false,
  });
}

function namespacedKey(key) {
  if (!IdempotencyKeySchema.safeParse(key).success) reject(422, 'VALIDATION_ERROR');
  return `topic-practice-${createHash('sha256').update(key).digest('hex')}`;
}

/** Student-scoped topic catalog and profile creation on the existing attempt allocator. */
export function createTopicPracticeService({ examPool, identityService, createRate } = {}) {
  if (!examPool || typeof examPool.connect !== 'function') throw new TypeError('examPool is required');
  if (!identityService || typeof identityService.mayPerform !== 'function') throw new TypeError('identityService is required');
  const attempts = createAttemptService({ examPool, identityService, createRate, enableTopicPractice: true });

  async function catalog(principal, { durationSeconds = 120 } = {}) {
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > MAX_DURATION_SECONDS) reject(422, 'VALIDATION_ERROR');
    const userId = requireActor(identityService, principal, 'candidate.attempt.read');
    try {
      const value = await withTransaction(examPool, async (client) => {
        await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [userId]);
        return (await client.query('SELECT tsa.exam_topic_catalog($1) AS result', [durationSeconds])).rows[0]?.result;
      }, { role: 'tsa_exam' });
      return parseCatalog(value);
    } catch (error) {
      if (error instanceof BankCommandError) throw error;
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
  }

  async function create(principal, key, rawRequest) {
    const userId = requireActor(identityService, principal, 'candidate.attempt.read');
    const request = parseTopicRequest(rawRequest);
    const bodyHash = jsonDigest(request);
    const prior = parseJson(await withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [userId]);
      return (await client.query('SELECT tsa.exam_topic_practice_lookup($1,$2) AS result', [namespacedKey(key), bodyHash])).rows[0]?.result;
    }, { role: 'tsa_exam' }));
    if (prior?.status === 'IDEMPOTENCY_CONFLICT') throw new BankCommandError(409, 'IDEMPOTENCY_CONFLICT');
    if (!['ABSENT','READY'].includes(prior?.status)) reject(503, 'TEMPORARILY_UNAVAILABLE');
    let profile;
    const result = await attempts.createPrepared(principal, namespacedKey(key), async () => {
      if (prior.status === 'READY' && prior.hasReceipt === true) {
        profile = parsePreparedProfile(prior, request);
        return { blueprintVersionId: profile.blueprintVersionId };
      }
      const prepared = await withTransaction(examPool, async (client) => {
        await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [userId]);
        return (await client.query(
          'SELECT tsa.exam_topic_practice_prepare($1::uuid,$2::uuid[],$3::integer,$4::integer,$5::text,$6::text) AS result',
          [request.taxonomyVersionId, request.topicIds, request.questionCount, request.durationSeconds,
            namespacedKey(key), bodyHash],
        )).rows[0]?.result;
      }, { role: 'tsa_exam' });
      const payload = parseJson(prepared);
      if (isRecord(payload) && payload.status === 'ACTIVE' && UUID_PATTERN.test(payload.attemptId)) {
        const error = new BankCommandError(409, 'CONCURRENT_ATTEMPT_EXISTS');
        error.details = { existingAttemptId: payload.attemptId }; throw error;
      }
      if (isRecord(payload) && payload.status === 'INSUFFICIENT'
          && payload.requestedCount === request.questionCount
          && Number.isSafeInteger(payload.availableQuestionCount) && payload.availableQuestionCount >= 0) {
        const error = new BankCommandError(409, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
        error.details = { requestedCount: payload.requestedCount, availableQuestionCount: payload.availableQuestionCount };
        throw error;
      }
      if (isRecord(payload) && payload.status === 'IDEMPOTENCY_CONFLICT') {
        throw new BankCommandError(409, 'IDEMPOTENCY_CONFLICT');
      }
      profile = parsePreparedProfile(payload, request);
      return { blueprintVersionId: profile.blueprintVersionId };
    }, { existingReceipt: prior.status === 'READY' && prior.hasReceipt === true });
    const receipt = CreationReceiptSchema.safeParse(result.body);
    if (!receipt.success || !profile) reject(503, 'TEMPORARILY_UNAVAILABLE');
    return {
      ...result,
      body: { ...receipt.data, practiceProfile: profile },
    };
  }

  return Object.freeze({ catalog, create });
}
