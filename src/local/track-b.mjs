import { listAuthoringTaxonomies } from '../modules/bank/taxonomy-catalog.mjs';
import { backupLocalDatabase } from './database-backup.mjs';
import { prepareStudentComponents } from './student.mjs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBankHandler } from '../http/bank.mjs';
import { createLocalAuthHandler } from '../http/local-auth.mjs';
import { createSlidingWindowLimiter } from '../http/guest-rate-limit.mjs';
import { migrate } from '../modules/database/migrate.mjs';
import { createDatabasePool } from '../modules/database/pool.mjs';
import {
  bootstrapLocalSyntheticIdentity,
  createLocalSyntheticIdentityService,
  LOCAL_GUEST_MAX_POOL,
  LOCAL_SYNTHETIC_ACTORS,
  preparePublicGuestIdentity,
  validateLocalSyntheticConfig,
} from '../modules/identity/local-synthetic.mjs';
import { createPrototypeServer } from '../../apps/practice-prototype/server.mjs';
import { privateQuestionFixture } from '../../apps/practice-prototype/src/private-question-fixture.mjs';
import { LOCAL_SOURCE_VERSION_HASH, ensureLocalSourceSeed, ensureLocalTaxonomy, inspectLocalSourceSeed, createPrivateTemplate } from './seed.mjs';
import { ensureRuntimeRoles, runtimePoolConfig, startPersistentPostgres, validateTrackBDataPath } from './postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PORT = 4174;
const MAX_INTEGRATED_REQUEST_BYTES = 1024 * 1024;
const TEMPLATE_PATH = '/local/workspace/template';

function assertLocalEnvironment(env) {
  if (process.env.NODE_ENV !== undefined && !['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Track B local workspace is disabled by the process NODE_ENV');
  }
  if (!env || !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('Set NODE_ENV=development or NODE_ENV=test to run the local workspace');
  }
  if (env.LOCAL_SYNTHETIC_ONLY !== 'true') {
    throw new Error('Set LOCAL_SYNTHETIC_ONLY=true to enable the synthetic-only local workspace');
  }
  return true;
}

function response(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function buildTemplate(seed) {
  const base = createPrivateTemplate(seed);
  return Object.freeze({
    ...base,
    fixtureLabel: 'Synthetic authoring template',
    content: structuredClone(privateQuestionFixture.content),
    interaction: structuredClone(privateQuestionFixture.interaction),
    answerKey: structuredClone(privateQuestionFixture.private.answerKey),
    explanation: structuredClone(privateQuestionFixture.private.explanation),
    sourceVersionHash: LOCAL_SOURCE_VERSION_HASH,
  });
}

async function checkDataDirectory(dataDirectory) {
  return validateTrackBDataPath(dataDirectory);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(server.address()); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      server.closeAllConnections();
      reject(new Error('Track B HTTP server did not close within three seconds'));
    }, 3_000);
    timer.unref?.();
  });
  try { await Promise.race([closed, timeout]); }
  finally { clearTimeout(timer); }
}

async function endPoolBounded(pool, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} pool did not close within two seconds`)), 2_000);
    timer.unref?.();
  });
  try { await Promise.race([pool.end(), timeout]); }
  finally { clearTimeout(timer); }
}

export const PUBLIC_DEMO_DEFAULT_GUEST_POOL = 1_000;
export const PUBLIC_DEMO_DEFAULT_GUESTS_PER_HOUR = 10;

function normalizePublicDemo(publicDemo) {
  if (publicDemo === null) return null;
  if (typeof publicDemo !== 'object' || Array.isArray(publicDemo)) throw new TypeError('publicDemo must be an object');
  const { origin, guestPool = PUBLIC_DEMO_DEFAULT_GUEST_POOL, guestsPerHour = PUBLIC_DEMO_DEFAULT_GUESTS_PER_HOUR } = publicDemo;
  let parsed;
  try { parsed = new URL(origin); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/'
      || parsed.search || parsed.hash || parsed.origin !== origin) {
    throw new Error('The public demo origin must be a canonical https origin such as https://demo.example');
  }
  if (!Number.isSafeInteger(guestPool) || guestPool < 1 || guestPool > LOCAL_GUEST_MAX_POOL) {
    throw new RangeError(`The guest pool must be an integer from 1 through ${LOCAL_GUEST_MAX_POOL}`);
  }
  if (!Number.isSafeInteger(guestsPerHour) || guestsPerHour < 1 || guestsPerHour > 10_000) {
    throw new RangeError('Guests per hour per address must be an integer from 1 through 10000');
  }
  return Object.freeze({ origin, guestPool, guestsPerHour });
}

function notFoundResponse(pathname) {
  if (/^\/api\/v[1234](?:\/|$)/.test(pathname)) {
    const requestId = randomUUID();
    return response(404, { error: { code: 'NOT_FOUND', message: 'Resource not found', requestId, details: {} } },
      { 'x-request-id': requestId });
  }
  return response(404, { error: 'NOT_FOUND' });
}

function asError(code, message, requestId) {
  return response(503, { error: { code, message, requestId, details: {} } }, { 'x-request-id': requestId });
}

/**
 * Create the persistent local stack without starting listening sockets until the
 * production-mode guard, cluster checks, migrations and synthetic bootstrap pass.
 */
export async function createTrackBRuntime({
  env = process.env,
  dataDirectory = path.join(ROOT, '.local', 'track-b'),
  port = DEFAULT_PORT,
  pgBin,
  prepareDatabase,
  imageStore = null,
  localRoutes = {},
  // When true, the retired student UI links (/?student=...) redirect to the React student app.
  redirectLegacyStudentUi = false,
  // Public demo: { origin: 'https://…', guestPool, guestsPerHour } serves only the student app and
  // candidate APIs to guest identities; staff routes and handlers do not exist. Off by default.
  publicDemo = null,
} = {}) {
  assertLocalEnvironment(env);
  const publicMode = normalizePublicDemo(publicDemo);
  if (publicMode && env.LOCAL_STUDENT_ENABLED !== 'true') throw new Error('The public demo requires the local student runtime');
  if (prepareDatabase !== undefined && typeof prepareDatabase !== 'function') throw new TypeError('prepareDatabase must be a function');
  if (localRoutes === null || typeof localRoutes !== 'object' || Object.entries(localRoutes).some(([route, handler]) =>
    !route.startsWith('/local/') || typeof handler !== 'function')) throw new TypeError('localRoutes must map /local/ paths to handlers');
  if (env.LOCAL_STUDENT_ENABLED !== undefined && !['true', 'false'].includes(env.LOCAL_STUDENT_ENABLED)) {
    throw new Error('LOCAL_STUDENT_ENABLED must be true or false');
  }
  const studentEnabled = env.LOCAL_STUDENT_ENABLED === 'true';
  if (env.LOCAL_NUMERIC_PRACTICE_ENABLED !== undefined && !['true','false'].includes(env.LOCAL_NUMERIC_PRACTICE_ENABLED)) {
    throw new Error('LOCAL_NUMERIC_PRACTICE_ENABLED must be true or false');
  }
  const numericEnabled = env.LOCAL_NUMERIC_PRACTICE_ENABLED === 'true';
  if (env.LOCAL_CLOZE_MATCHING_ENABLED !== undefined && !['true', 'false'].includes(env.LOCAL_CLOZE_MATCHING_ENABLED)) {
    throw new Error('LOCAL_CLOZE_MATCHING_ENABLED must be true or false');
  }
  const clozeMatchingEnabled = env.LOCAL_CLOZE_MATCHING_ENABLED === 'true';
  if (env.LOCAL_FULL_SIMULATION_ENABLED !== undefined && !['true', 'false'].includes(env.LOCAL_FULL_SIMULATION_ENABLED)) {
    throw new Error('LOCAL_FULL_SIMULATION_ENABLED must be true or false');
  }
  const fullSimulationEnabled = env.LOCAL_FULL_SIMULATION_ENABLED === 'true';
  if (fullSimulationEnabled && !studentEnabled) throw new Error('Full simulation requires the local student runtime');
  if (numericEnabled && !studentEnabled) throw new Error('Numeric practice requires the local student runtime');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new TypeError('port must be an integer from 0 through 65535');
  if (env.LOCAL_AUTH_TRUSTED_ORIGIN && port === 0) {
    throw new Error('Do not set LOCAL_AUTH_TRUSTED_ORIGIN when requesting an ephemeral port');
  }
  const expectedOrigin = `http://127.0.0.1:${port || 1}`;
  if (env.LOCAL_AUTH_TRUSTED_ORIGIN && env.LOCAL_AUTH_TRUSTED_ORIGIN !== expectedOrigin) {
    throw new Error('LOCAL_AUTH_TRUSTED_ORIGIN must match the configured loopback port');
  }
  const bootstrapEnv = { ...env, LOCAL_AUTH_TRUSTED_ORIGIN: env.LOCAL_AUTH_TRUSTED_ORIGIN ?? expectedOrigin };
  validateLocalSyntheticConfig(bootstrapEnv);
  const absoluteDataDirectory = await checkDataDirectory(dataDirectory);
  const database = await startPersistentPostgres(absoluteDataDirectory, { pgBin });
  let ownerPool = database.ownerPool;
  let identityPool;
  let bankPool;
  let examPool;
  let workerPool;
  let workerStop;
  let server;
  let closed = false;
  let closePromise;
  let routeHandlers = null;
  const cleanupErrors = [];
  const cleanup = async () => {
    const attempt = async (action) => {
      try { await action(); }
      catch (error) { cleanupErrors.push(error); }
    };
    if (server?.listening) await attempt(() => closeServer(server));
    if (workerStop) { const stop = workerStop; workerStop = null; await attempt(stop); }
    if (workerPool) { const pool = workerPool; workerPool = null; await attempt(() => endPoolBounded(pool, 'Worker')); }
    if (examPool) { const pool = examPool; examPool = null; await attempt(() => endPoolBounded(pool, 'Exam')); }
    if (bankPool) { const pool = bankPool; bankPool = null; await attempt(() => endPoolBounded(pool, 'Bank')); }
    if (identityPool) { const pool = identityPool; identityPool = null; await attempt(() => endPoolBounded(pool, 'Identity')); }
    if (ownerPool) { const pool = ownerPool; ownerPool = null; await attempt(() => endPoolBounded(pool, 'Owner')); }
    await attempt(() => database.stop());
    closed = true;
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors.splice(0), 'Track B cleanup encountered one or more errors');
  };

  try {
    await backupLocalDatabase({ connectionConfig: database.connectionConfig,
      directory: `${absoluteDataDirectory}-backups`, pgBin });
    await migrate(ownerPool);
    await bootstrapLocalSyntheticIdentity(ownerPool, { env: bootstrapEnv });
    if (publicMode) await preparePublicGuestIdentity(ownerPool, { env: bootstrapEnv, guestPool: publicMode.guestPool });
    await ensureLocalTaxonomy(ownerPool);
    const sourceSeedState = await inspectLocalSourceSeed(ownerPool);
    await ensureRuntimeRoles(ownerPool, { student: studentEnabled });
    const prepared = prepareDatabase ? await prepareDatabase(ownerPool) : null;

    identityPool = createDatabasePool(runtimePoolConfig(database.connectionConfig, 'tsa_track_b_identity', 'tsa-track-b-identity'), {
      max: 4, connectionTimeoutMillis: 2_000, applicationName: 'tsa-track-b-identity',
    });
    bankPool = createDatabasePool(runtimePoolConfig(database.connectionConfig, 'tsa_track_b_bank', 'tsa-track-b-bank'), {
      max: 6, connectionTimeoutMillis: 2_000, applicationName: 'tsa-track-b-bank',
    });

    if (studentEnabled) {
      examPool = createDatabasePool(runtimePoolConfig(database.connectionConfig, 'tsa_track_b_exam', 'tsa-track-b-exam'));
      workerPool = createDatabasePool(runtimePoolConfig(database.connectionConfig, 'tsa_track_b_exam_worker', 'tsa-track-b-exam-worker'));
    }

    // Requests must never run with the migration owner pool still open.
    await database.closeOwnerPool();
    ownerPool = null;

    const rate = Object.freeze({ capacity: 100, refillPerSecond: 10 });
    const student = studentEnabled ? await prepareStudentComponents({
      identityPool, examPool, workerPool, env, port, imageStore,
      pollMilliseconds: 100, sweepBatchSize: 10, executorId: 'local-retained-student',
      leaseSeconds: 30, retrySeconds: 1,
      createRate: rate, saveRate: { user: rate, attempt: rate }, enableNumericPractice: numericEnabled,
      enableClozeMatching: clozeMatchingEnabled, enableFullSimulation: fullSimulationEnabled,
    }) : null;

    const isStudentApiPath = (pathname) => student && (
      (fullSimulationEnabled && pathname.startsWith('/api/v3/'))
      || pathname === '/api/v1/topics' || pathname === '/api/v1/topic-practice'
      || pathname === '/api/v1/catalog' || pathname === '/api/v1/attempts'
      || pathname.startsWith('/api/v1/attempts/')
      || (numericEnabled && (pathname === '/api/v2/catalog' || pathname === '/api/v2/attempts'
        || pathname.startsWith('/api/v2/attempts/')))
      || (clozeMatchingEnabled && (pathname === '/api/v4/catalog' || pathname === '/api/v4/attempts'
        || pathname.startsWith('/api/v4/attempts/'))));
    const integratedRequestHandler = async (request, context = {}) => {
      if (!routeHandlers) {
        const requestId = randomUUID();
        const pathName = new URL(request.url).pathname;
        if (/^\/api\/v[1234]\//.test(pathName)) return asError('TEMPORARILY_UNAVAILABLE', 'The local request could not be completed', requestId);
        return response(503, { error: 'LOCAL_WORKSPACE_UNAVAILABLE' });
      }
      const pathname = new URL(request.url).pathname;
      if (publicMode) {
        // Allow-list: guest session routes, the notice, and the candidate APIs. Everything else is a 404.
        if (pathname.startsWith('/local-auth/')) return routeHandlers.authHandler(request, context);
        if (pathname === '/local/demo-notice' && Object.hasOwn(localRoutes, pathname)) return localRoutes[pathname](request);
        if (isStudentApiPath(pathname)) return routeHandlers.attemptHandler(request);
        return notFoundResponse(pathname);
      }
      if (pathname.startsWith('/local-auth/')) return routeHandlers.authHandler(request);
      if (pathname === TEMPLATE_PATH) return routeHandlers.templateHandler(request);
      if (Object.hasOwn(localRoutes, pathname)) return localRoutes[pathname](request);
      if (isStudentApiPath(pathname)) return routeHandlers.attemptHandler(request);
      if (clozeMatchingEnabled && pathname.startsWith('/api/v4/')) return routeHandlers.clozeMatchingBankHandler(request);
      if (numericEnabled && pathname.startsWith('/api/v2/')) return routeHandlers.numericBankHandler(request);
      if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) return routeHandlers.bankHandler(request);
      return notFoundResponse(pathname);
    };
    server = createPrototypeServer({
      port,
      maxRequestBytes: MAX_INTEGRATED_REQUEST_BYTES,
      integratedRequestHandler,
      redirectLegacyStudentUi,
      publicOrigin: publicMode?.origin ?? null,
    });
    const address = await listen(server, port);
    const origin = `http://127.0.0.1:${address.port}`;
    const handlerEnv = { ...env, LOCAL_AUTH_TRUSTED_ORIGIN: origin };
    if (env.LOCAL_AUTH_TRUSTED_ORIGIN && env.LOCAL_AUTH_TRUSTED_ORIGIN !== origin) {
      throw new Error('Configured LOCAL_AUTH_TRUSTED_ORIGIN does not match the bound loopback address');
    }
    validateLocalSyntheticConfig(handlerEnv);
    const identityService = await createLocalSyntheticIdentityService(identityPool,
      { env: handlerEnv, guestPool: publicMode?.guestPool ?? 0 });
    const authHandler = await createLocalAuthHandler({ pool: identityPool, env: handlerEnv,
      publicGuests: publicMode ? { guestPool: publicMode.guestPool,
        limiter: createSlidingWindowLimiter({ limit: publicMode.guestsPerHour, windowMilliseconds: 3_600_000 }) } : null });
    let bankHandler = null, numericBankHandler = null, clozeMatchingBankHandler = null, templateHandler = null;
    // Public mode creates its staff handlers only for the startup seed, and never routes them.
    const staffIdentity = publicMode
      ? await createLocalSyntheticIdentityService(identityPool, { env: handlerEnv, guestPool: publicMode.guestPool, guestsOnly: false })
      : identityService;
    const staffAuth = publicMode
      ? await createLocalAuthHandler({ pool: identityPool, env: handlerEnv, guestPool: publicMode.guestPool }) : authHandler;
    const seedBankHandler = await createBankHandler({ bankPool, identityService: staffIdentity, trustedOrigin: origin, imageStore, enableReviewContext: true, enableReviewEvidence: true, enableReviewHistory: true, enableDatasetPreflight: true, enableFixedDiagnostics: true, enableFixedStockRehearsal: true, enableFixedSealMetadata: true });
    const sourceSeed = await ensureLocalSourceSeed({
      authHandler: staffAuth, bankHandler: seedBankHandler, origin, existing: sourceSeedState,
    });
    if (!publicMode) {
      bankHandler = seedBankHandler;
      numericBankHandler = numericEnabled ? await createBankHandler({ bankPool, identityService, trustedOrigin: origin, imageStore,
        enableNumericQuestions: true, enableReviewContext: true }) : null;
      clozeMatchingBankHandler = clozeMatchingEnabled ? await createBankHandler({ bankPool, identityService, trustedOrigin: origin, imageStore,
        enableClozeMatching: true, enableReviewContext: true }) : null;
      templateHandler = async (request) => {
        const requestId = randomUUID();
        let parsed;
        try { parsed = new URL(request.url); }
        catch { return response(400, { error: 'BAD_REQUEST' }); }
        if (parsed.origin !== origin || request.headers.get('host')?.toLowerCase() !== new URL(origin).host.toLowerCase()) {
          return response(403, { error: 'ORIGIN_REJECTED' });
        }
        if (parsed.search) return response(400, { error: 'INVALID_REQUEST' });
        if (request.method !== 'GET') return response(405, { error: 'METHOD_NOT_ALLOWED' });
        const principal = await identityService.authenticate(request);
        if (!principal) return response(401, { error: 'UNAUTHENTICATED' });
        if (!identityService.mayPerform(principal, 'bank.question.author')) return response(403, { error: 'FORBIDDEN' });
        return response(200, { template: buildTemplate(sourceSeed), taxonomies: await listAuthoringTaxonomies(bankPool),
          ...(numericEnabled || clozeMatchingEnabled ? { capabilities: {
            ...(numericEnabled ? { numericQuestions: true } : {}),
            ...(clozeMatchingEnabled ? { clozeMatching: true } : {}),
          } } : {}) }, { 'x-request-id': requestId });
      };
    }
    const attemptHandler = student?.createHandler({ identityService, trustedOrigin: origin });
    routeHandlers = { authHandler, bankHandler, numericBankHandler, clozeMatchingBankHandler, templateHandler, attemptHandler };
    if (student) workerStop = student.startWorker();

    return {
      server,
      origin,
      port: address.port,
      dataDirectory: absoluteDataDirectory,
      syntheticOnly: true,
      studentEnabled,
      fullSimulationEnabled,
      publicDemo: publicMode,
      prepared,
      identityPool,
      bankPool,
      async close() {
        if (closed) return;
        closePromise ??= cleanup();
        return closePromise;
      },
    };
  } catch (error) {
    try { await cleanup(); } catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}

export async function startTrackB(options = {}) {
  return createTrackBRuntime(options);
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(path.resolve(entrypoint)).href === import.meta.url;
}

if (isDirectExecution() && process.argv[2] !== '--workspace-worker') {
  // Keep the postmaster out of the terminal process group. The worker drains
  // HTTP and grading before stopping its owned retained database.
  const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), '--workspace-worker'], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: process.env,
  });
  worker.stdout.pipe(process.stdout); worker.stderr.pipe(process.stderr);
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    if (worker.exitCode === null && worker.signalCode === null) worker.kill(signal);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  worker.once('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  worker.once('close', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
} else if (isDirectExecution()) {
  let runtime;
  let stopRequested = process.connected === false;
  let stopping = false;
  const stop = async () => {
    stopRequested = true;
    if (!runtime || stopping) return;
    stopping = true;
    try { await runtime.close(); process.exitCode = 0; }
    catch (error) {
      process.stderr.write(`Track B shutdown was incomplete: ${error instanceof Error ? error.message : 'unknown error'}\n`);
      process.exitCode = 1;
    } finally { if (process.connected) process.disconnect(); }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('disconnect', stop);
  try {
    assertLocalEnvironment(process.env);
    const portText = process.env.PORT;
    const port = portText === undefined ? DEFAULT_PORT : /^(0|[1-9]\d{0,4})$/.test(portText) ? Number(portText) : NaN;
    if (!Number.isSafeInteger(port) || port > 65_535) throw new Error('PORT must be an integer from 0 through 65535');
    runtime = await startTrackB({ env: process.env, dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b'), port });
    process.stdout.write(`Track B local workspace listening at ${runtime.origin}\n`);
    process.stdout.write(`Persistent synthetic-only PostgreSQL data: ${runtime.dataDirectory}\n`);
    if (runtime.studentEnabled) process.stdout.write(`Retained student practice: ${runtime.origin}/?student=postgres\n`);
    if (stopRequested) await stop();
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown startup failure';
    process.stderr.write(`Track B local workspace did not start: ${reason}\n`);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
}
