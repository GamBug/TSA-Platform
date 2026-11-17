import assert from 'node:assert/strict';
import { createServer, request as rawHttpRequest } from 'node:http';
import { once } from 'node:events';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createLocalAuthHandler } from '../../../src/http/local-auth.mjs';
import { createLocalSyntheticIdentityService, bootstrapLocalSyntheticIdentity } from '../../../src/modules/identity/local-synthetic.mjs';
import { startDisposablePostgres } from '../../integration/database/foundation/postgres.mjs';

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

async function startHttpServer({ initialize, ownerPool }) {
  let handler;
  let identity;
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) headers.set(name, value.join(', '));
      else if (value !== undefined) headers.set(name, value);
    }
    const url = `http://${incoming.headers.host}${incoming.url}`;
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(bytes.length ? { body: bytes } : {}),
    });
    let result;
    try {
      const testRoute = /^\/__test\/attempts\/([0-9a-f-]+)(?:\/(save))?$/.exec(new URL(url).pathname);
      if (testRoute) {
        const attemptId = testRoute[1];
        const isSave = Boolean(testRoute[2]);
        const principal = isSave
          ? await identity.validateMutation(request)
          : await identity.authenticate(request);
        if (!principal || !identity.mayPerform(principal, isSave ? 'candidate.attempt.save' : 'candidate.attempt.read')) {
          result = response(404, { error: 'NOT_FOUND' });
        } else {
          const owned = await identity.withOwnedAttempt(principal, attemptId, async (attempt) => {
            if (isSave) {
              await ownerPool.query(
                `INSERT INTO tsa.rate_limit_buckets (scope, subject_id, tokens, refilled_at)
                 VALUES ('USER_SAVE', $1, 1, clock_timestamp())`, [attempt.id]);
            }
            return { id: attempt.id, state: attempt.state };
          });
          result = owned.found ? response(200, owned.value) : response(404, { error: 'NOT_FOUND' });
        }
      } else {
        result = await handler(request);
      }
    } catch {
      result = response(500, { error: 'TEST_ADAPTER_FAILURE' });
    }
    outgoing.statusCode = result.status;
    for (const [name, value] of result.headers) {
      if (name.toLowerCase() === 'set-cookie') continue;
      outgoing.setHeader(name, value);
    }
    if (typeof result.headers.getSetCookie === 'function') {
      const cookies = result.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader('set-cookie', cookies);
    }
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  ({ handler, identity } = await initialize(origin));
  return { server, origin, close: () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }) };
}

export async function createAuthHarness() {
  const database = await startDisposablePostgres();
  let authPool;
  let http;
  try {
    await migrate(database.pool);
    const env = {
      NODE_ENV: 'test',
      LOCAL_SYNTHETIC_ONLY: 'true',
      LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:1',
    };
    await assert.rejects(createLocalAuthHandler({ pool: database.pool, env }), /non-owner LOGIN/);
    await database.pool.query('CREATE ROLE auth_runtime LOGIN');
    await database.pool.query('GRANT tsa_identity TO auth_runtime');
    authPool = createDatabasePool({ ...database.connectionConfig, user: 'auth_runtime' }, {
      max: 3, applicationName: 'tsa-auth-security-test',
    });
    let markerRefused = false;
    try { await createLocalAuthHandler({ pool: authPool, env }); }
    catch (error) { markerRefused = /SYNTHETIC_ONLY/.test(error.message); }
    assert.equal(markerRefused, true, 'HTTP handler must refuse an uninitialized synthetic marker');
    const initialization = await bootstrapLocalSyntheticIdentity(database.pool, { env });
    let identity;
    http = await startHttpServer({
      ownerPool: database.pool,
      initialize: async (origin) => {
        env.LOCAL_AUTH_TRUSTED_ORIGIN = origin;
        identity = await createLocalSyntheticIdentityService(authPool, { env });
        const handler = await createLocalAuthHandler({ pool: authPool, env });
        return { handler, identity };
      },
    });
    return {
      database, ownerPool: database.pool, authPool, identity, env, origin: http.origin, http,
      markerRefused, initialization,
      async close() {
        await http.close();
        await authPool.end();
        await database.stop();
      },
    };
  } catch (error) {
    if (http) await http.close().catch(() => {});
    if (authPool) await authPool.end().catch(() => {});
    await database.stop().catch(() => {});
    throw error;
  }
}

export async function request(harness, path, {
  method = 'GET', cookies = [], csrf, body, origin = harness.origin, host,
} = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set('origin', origin);
  if (cookies.length) headers.set('cookie', cookies.join('; '));
  if (csrf) headers.set('x-csrf-token', csrf);
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (host) headers.set('host', host);
  return fetch(`${harness.origin}${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export async function requestWithHost(harness, path, host, {
  method = 'GET', cookies = [], csrf, body, origin = harness.origin,
} = {}) {
  const target = new URL(harness.origin);
  const headers = { host, origin };
  if (cookies.length) headers.cookie = cookies.join('; ');
  if (csrf) headers['x-csrf-token'] = csrf;
  let payload;
  if (body !== undefined) {
    payload = Buffer.from(JSON.stringify(body));
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(payload.length);
  }
  return new Promise((resolve, reject) => {
    const outgoing = rawHttpRequest({
      hostname: target.hostname,
      port: Number(target.port),
      path,
      method,
      headers,
    }, (incoming) => {
      incoming.resume();
      incoming.once('end', () => resolve({ status: incoming.statusCode }));
    });
    outgoing.once('error', reject);
    if (payload) outgoing.write(payload);
    outgoing.end();
  });
}

export function cookiePair(response, name) {
  const cookies = response.headers.getSetCookie();
  const value = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(value, `missing ${name} cookie`);
  return value.split(';', 1)[0];
}

export function cookieValue(cookiePairValue) {
  return cookiePairValue.slice(cookiePairValue.indexOf('=') + 1);
}

export function browserFrom(response) {
  return {
    cookies: [cookiePair(response, 'tsa_local_session'), cookiePair(response, 'tsa_local_csrf')],
    csrf: cookieValue(cookiePair(response, 'tsa_local_csrf')),
  };
}
