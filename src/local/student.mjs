import { randomUUID } from 'node:crypto';
import { createAttemptHandler } from '../http/attempts.mjs';
import { createLocalAuthHandler } from '../http/local-auth.mjs';
import { createExamSweeper } from '../modules/jobs/exam-sweeper.mjs';
import { createExamWorker } from '../modules/jobs/exam-worker.mjs';
import { createLocalSyntheticIdentityService } from '../modules/identity/local-synthetic.mjs';
import { createPrototypeServer } from '../../apps/practice-prototype/server.mjs';
import { assertStudentRuntimePools } from './student-pools.mjs';

const DEFAULT_PORT = 0;
const MIN_POLL_MILLISECONDS = 10;
const MAX_POLL_MILLISECONDS = 60_000;
const MAX_INTEGRATED_REQUEST_BYTES = 1024 * 1024;

function validateEnvironment(env) {
  if (process.env.NODE_ENV !== undefined && !['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Student runtime is disabled by the process NODE_ENV');
  }
  if (!env || !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('Student runtime requires NODE_ENV=development or test');
  }
  if (env.LOCAL_SYNTHETIC_ONLY !== 'true') {
    throw new Error('Student runtime requires LOCAL_SYNTHETIC_ONLY=true');
  }
}

function validateRateBucket(bucket, name) {
  if (bucket === null || typeof bucket !== 'object' || Array.isArray(bucket)) {
    throw new TypeError(`${name} rate configuration is invalid`);
  }
  const { capacity, refillPerSecond } = bucket;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000
      || typeof refillPerSecond !== 'number' || !Number.isFinite(refillPerSecond)
      || refillPerSecond < 0.000001 || refillPerSecond > 1_000) {
    throw new TypeError(`${name} rate configuration is invalid`);
  }
  return Object.freeze({ capacity, refillPerSecond });
}

function validateRates(createRate, saveRate) {
  return {
    createRate: validateRateBucket(createRate, 'USER_CREATE'),
    saveRate: Object.freeze({
      user: validateRateBucket(saveRate?.user, 'USER_SAVE'),
      attempt: validateRateBucket(saveRate?.attempt, 'ATTEMPT_SAVE'),
    }),
  };
}

function validateConfig({
  env, port, pollMilliseconds, sweepBatchSize, executorId, leaseSeconds, retrySeconds, createRate, saveRate,
}) {
  validateEnvironment(env);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError('port must be an integer from 0 through 65535');
  }
  if (!Number.isSafeInteger(pollMilliseconds)
      || pollMilliseconds < MIN_POLL_MILLISECONDS || pollMilliseconds > MAX_POLL_MILLISECONDS) {
    throw new RangeError(`pollMilliseconds must be from ${MIN_POLL_MILLISECONDS} through ${MAX_POLL_MILLISECONDS}`);
  }
  if (!Number.isSafeInteger(sweepBatchSize) || sweepBatchSize < 1 || sweepBatchSize > 100) {
    throw new RangeError('sweepBatchSize must be from 1 through 100');
  }
  if (typeof executorId !== 'string' || !/^[!-~]{1,128}$/.test(executorId)) {
    throw new TypeError('A printable worker executor identifier is required');
  }
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) {
    throw new RangeError('leaseSeconds must be from 1 through 300');
  }
  if (!Number.isSafeInteger(retrySeconds) || retrySeconds < 1 || retrySeconds > 3_600) {
    throw new RangeError('retrySeconds must be from 1 through 3600');
  }
  const rates = validateRates(createRate, saveRate);
  return Object.freeze({ rates, env: Object.freeze({
    NODE_ENV: env.NODE_ENV,
    LOCAL_SYNTHETIC_ONLY: env.LOCAL_SYNTHETIC_ONLY,
  }) });
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function unavailableResponse(pathname) {
  if (pathname.startsWith('/api/v1')) {
    const requestId = randomUUID();
    return new Response(JSON.stringify({ error: {
      code: 'TEMPORARILY_UNAVAILABLE',
      message: 'The request could not be completed',
      requestId,
      details: {},
    } }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'vary': 'Origin',
        'x-request-id': requestId,
      },
    });
  }
  return jsonResponse(503, { error: 'LOCAL_AUTH_UNAVAILABLE' });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address());
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function createWorkerLoop(sweeper, worker, pollMilliseconds) {
  let stopped = false;
  let timer;
  let wakeTimer;
  let loopPromise;

  const waitForPoll = () => new Promise((resolve) => {
    wakeTimer = resolve;
    timer = setTimeout(resolve, pollMilliseconds);
  });

  loopPromise = (async () => {
    while (!stopped) {
      try {
        await sweeper.sweepOnce();
      } catch {
        // Sweep errors are isolated so already-queued grading remains available.
      }
      try {
        await worker.runOnce();
      } catch {
        // Worker transport errors are retried on the next bounded poll.
      }
      if (stopped) break;
      await waitForPoll();
      timer = undefined;
      wakeTimer = undefined;
    }
  })();

  return async function stop() {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    wakeTimer?.();
    wakeTimer = undefined;
    await loopPromise;
  };
}

/** Prepare attested student components for an existing local HTTP server. */
export async function prepareStudentComponents({
  identityPool,
  examPool,
  workerPool,
  env = process.env,
  port = DEFAULT_PORT,
  pollMilliseconds,
  sweepBatchSize,
  executorId,
  leaseSeconds,
  retrySeconds,
  createRate,
  saveRate,
} = {}) {
  const config = validateConfig({
    env, port, pollMilliseconds, sweepBatchSize, executorId, leaseSeconds, retrySeconds, createRate, saveRate,
  });
  const worker = createExamWorker({ workerPool, executorId, leaseSeconds, retrySeconds });
  const sweeper = createExamSweeper({ workerPool, executorId, batchSize: sweepBatchSize });
  await assertStudentRuntimePools({ identityPool, examPool, workerPool });

  return Object.freeze({
    env: config.env,
    createHandler({ identityService, trustedOrigin }) {
      return createAttemptHandler({ examPool, identityService, trustedOrigin,
        createRate: config.rates.createRate, saveRate: config.rates.saveRate });
    },
    startWorker() { return createWorkerLoop(sweeper, worker, pollMilliseconds); },
  });
}

/** Compose the local student HTTP handlers and a separate trusted grading poller. */
export async function createStudentRuntime(options = {}) {
  const { identityPool, port = DEFAULT_PORT } = options;
  const components = await prepareStudentComponents(options);
  let routes = null;
  let workerStop = null;
  let closePromise = null;
  const integratedRequestHandler = async (request) => {
    const pathname = new URL(request.url).pathname;
    if (!routes) return unavailableResponse(pathname);
    if (pathname === '/local-auth' || pathname.startsWith('/local-auth/')) {
      return routes.authHandler(request);
    }
    if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
      return routes.attemptHandler(request);
    }
    return jsonResponse(404, { error: 'NOT_FOUND' });
  };

  const server = createPrototypeServer({
    port,
    maxRequestBytes: MAX_INTEGRATED_REQUEST_BYTES,
    integratedRequestHandler,
  });

  try {
    const address = await listen(server, port);
    if (!address || typeof address !== 'object' || !Number.isInteger(address.port)) {
      throw new Error('Student runtime did not bind a loopback address');
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const handlerEnv = Object.freeze({
      ...components.env,
      LOCAL_AUTH_TRUSTED_ORIGIN: origin,
    });
    const identityService = await createLocalSyntheticIdentityService(identityPool, { env: handlerEnv });
    const authHandler = await createLocalAuthHandler({ pool: identityPool, env: handlerEnv });
    const attemptHandler = components.createHandler({ identityService, trustedOrigin: origin });
    routes = Object.freeze({ authHandler, attemptHandler });
    workerStop = components.startWorker();

    return Object.freeze({
      server,
      origin,
      port: address.port,
      syntheticOnly: true,
      async close() {
        if (closePromise) return closePromise;
        closePromise = (async () => {
          routes = null;
          const closeHttp = closeServer(server);
          const stopWorker = workerStop ? workerStop() : Promise.resolve();
          const results = await Promise.allSettled([closeHttp, stopWorker]);
          const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
          if (errors.length) throw new AggregateError(errors, 'Student runtime shutdown was incomplete');
        })();
        return closePromise;
      },
    });
  } catch (error) {
    routes = null;
    const cleanup = [];
    if (server.listening) cleanup.push(closeServer(server));
    if (workerStop) cleanup.push(workerStop());
    const results = await Promise.allSettled(cleanup);
    const cleanupErrors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (cleanupErrors.length) error.cleanupError = new AggregateError(cleanupErrors, 'Student runtime startup cleanup was incomplete');
    throw error;
  }
}
