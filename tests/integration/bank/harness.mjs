import { createServer } from 'node:http';
import { once } from 'node:events';
import { createBankHandler } from '../../../src/http/bank.mjs';
import { createLocalAuthHandler } from '../../../src/http/local-auth.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { bootstrapLocalSyntheticIdentity, createLocalSyntheticIdentityService } from '../../../src/modules/identity/local-synthetic.mjs';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';

async function serve(request, outgoing, authHandler, bankHandler) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '));
    else if (value !== undefined) headers.set(name, value);
  }
  const fetchRequest = new Request(`http://${request.headers.host}${request.url}`, {
    method: request.method,
    headers,
    ...(bytes.length ? { body: bytes } : {}),
  });
  const path = new URL(fetchRequest.url).pathname;
  const response = path.startsWith('/local-auth/')
    ? await authHandler(fetchRequest)
    : await bankHandler(fetchRequest);
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== 'set-cookie') outgoing.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) outgoing.setHeader('set-cookie', cookies);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

export async function createBankHarness({ migrationDirectory } = {}) {
  const database = await startDisposablePostgres();
  let authPool;
  let bankPool;
  let server;
  try {
    await migrate(database.pool, { directory: migrationDirectory });
    const env = {
      NODE_ENV: 'test',
      LOCAL_SYNTHETIC_ONLY: 'true',
      LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:1',
    };
    await bootstrapLocalSyntheticIdentity(database.pool, { env });
    await database.pool.query('CREATE ROLE bank_runtime LOGIN');
    await database.pool.query('GRANT tsa_bank TO bank_runtime');
    await database.pool.query('CREATE ROLE auth_runtime LOGIN');
    await database.pool.query('GRANT tsa_identity TO auth_runtime');
    authPool = createDatabasePool({ ...database.connectionConfig, user: 'auth_runtime' }, {
      applicationName: 'tsa-bank-auth-test', max: 4,
    });
    bankPool = createDatabasePool({ ...database.connectionConfig, user: 'bank_runtime' }, {
      applicationName: 'tsa-bank-api-test', max: 6,
    });

    server = createServer((request, outgoing) => {
      void serve(request, outgoing, authHandler, bankHandler).catch(() => {
        outgoing.statusCode = 500;
        outgoing.end();
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    env.LOCAL_AUTH_TRUSTED_ORIGIN = origin;
    const identity = await createLocalSyntheticIdentityService(authPool, { env });
    const authHandler = await createLocalAuthHandler({ pool: authPool, env });
    const bankHandler = await createBankHandler({ bankPool, identityService: identity, trustedOrigin: origin });

    return {
      database, authPool, bankPool, identity, env, origin, server,
      async close() {
        if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await bankPool.end();
        await authPool.end();
        await database.stop();
      },
    };
  } catch (error) {
    if (server?.listening) await new Promise((resolve) => server.close(() => resolve())).catch(() => {});
    if (bankPool) await bankPool.end().catch(() => {});
    if (authPool) await authPool.end().catch(() => {});
    await database.stop().catch(() => {});
    throw error;
  }
}

export async function loginActor(harness, actorKey) {
  const challenge = await fetch(`${harness.origin}/local-auth/bootstrap`, {
    method: 'POST',
    headers: { origin: harness.origin, 'content-type': 'application/json' },
    body: '{}',
  });
  if (challenge.status !== 201) throw new Error(`Synthetic identity bootstrap failed (${challenge.status})`);
  const challengeCookies = challenge.headers.getSetCookie();
  const cookiePair = (headers, name) => {
    const value = headers.find((header) => header.startsWith(`${name}=`));
    if (!value) throw new Error(`Expected ${name} cookie`);
    return value.split(';', 1)[0];
  };
  const guestCookies = [cookiePair(challengeCookies, 'tsa_local_session'), cookiePair(challengeCookies, 'tsa_local_csrf')];
  const csrf = guestCookies[1].slice(guestCookies[1].indexOf('=') + 1);
  const login = await fetch(`${harness.origin}/local-auth/login`, {
    method: 'POST',
    headers: {
      origin: harness.origin,
      cookie: guestCookies.join('; '),
      'x-csrf-token': csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ actorKey }),
  });
  if (login.status !== 200) throw new Error(`Synthetic actor login failed (${login.status})`);
  const loginCookies = login.headers.getSetCookie();
  const cookies = [cookiePair(loginCookies, 'tsa_local_session'), cookiePair(loginCookies, 'tsa_local_csrf')];
  return { cookies, csrf: cookies[1].slice(cookies[1].indexOf('=') + 1) };
}

export async function bankRequest(harness, browser, path, { method = 'GET', body, key, rawBody, query } = {}) {
  const url = new URL(path, harness.origin);
  if (query) url.search = query;
  const headers = new Headers({ origin: harness.origin, cookie: browser.cookies.join('; ') });
  if (method !== 'GET') {
    headers.set('x-csrf-token', browser.csrf);
    if (key !== undefined) headers.set('idempotency-key', key);
  }
  if (body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(body);
  } else if (rawBody !== undefined) {
    headers.set('content-type', 'application/json');
    body = rawBody;
  }
  return fetch(url, { method, headers, ...(body !== undefined ? { body } : {}) });
}
