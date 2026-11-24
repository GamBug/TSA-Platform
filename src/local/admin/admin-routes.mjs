// HTTP routes of the admin page, all under /local/admin/. The loopback demo serves every route; the public demo serves
// them read-only (`readOnly`): sign-in, sign-out and the GET views of the Bank, nothing that changes or imports.
import { generateQuestions, generationStatus, PROVIDERS } from './admin-generate.mjs';
import { INBOX_FOLDERS, MAX_ARCHIVE_BYTES } from './admin-jobs.mjs';

export const ADMIN_ROUTE_PREFIX = '/local/admin/';
const MAX_BODY_BYTES = 1024 * 1024;
// A figure arrives base64-encoded (4 bytes for every 3), up to the image library's 2 MiB.
const MAX_FIGURE_BODY_BYTES = 3 * 1024 * 1024;
// A ZIP of answers and figures is base64-encoded too, up to MAX_ARCHIVE_BYTES.
const MAX_ARCHIVE_BODY_BYTES = Math.ceil(MAX_ARCHIVE_BYTES / 3) * 4 + 1024;
const FIGURE_ROUTE = 'inbox/figure';
const ARCHIVE_ROUTE = 'inbox/archive';
const BODY_LIMITS = Object.freeze({ [FIGURE_ROUTE]: MAX_FIGURE_BODY_BYTES, [ARCHIVE_ROUTE]: MAX_ARCHIVE_BODY_BYTES });
export const ADMIN_POST_BODY_LIMITS = Object.freeze(Object.fromEntries(Object.entries(BODY_LIMITS).map(([route, limit]) => [`${ADMIN_ROUTE_PREFIX}${route}`, limit])));
const HEADERS = Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });

const json = (status, payload, extra = {}) => new Response(JSON.stringify(payload), { status, headers: { ...HEADERS, ...extra } });
const error = (status, code, message) => json(status, { error: code, ...(message ? { message } : {}) });

async function readBody(request, limit = MAX_BODY_BYTES) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return { ok: false };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) return { tooLarge: true };
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? { ok: true, value } : { ok: false };
  } catch { return { ok: false }; }
}

const section = (value) => (Object.hasOwn(INBOX_FOLDERS, value) ? value : null);

/**
 * One handler for every /local/admin/ path. `getSnapshot()` returns the current Bank snapshot; `refreshSnapshot()`
 * re-reads it from the retained Bank (null in rehearsal). `imageStore` reads library images for the question view.
 */
export function createAdminRoutes({ auth, jobs = null, getSnapshot, refreshSnapshot = null, imageStore = null, contentMode,
  inboxDirectory, env = process.env, readOnly = false }) {
  if (!readOnly && !jobs) throw new TypeError('The writable admin routes need the admin jobs');
  const overview = async () => {
    const snapshot = getSnapshot();
    const common = { contentMode, readAt: snapshot.readAt, total: snapshot.total, counts: snapshot.counts, readOnly };
    if (readOnly) return { ...common, practicePoolTaxonomyId: null, jobs: { available: false, running: null },
      generation: { configured: false, model: null, providers: [] }, canRefresh: false };
    return { ...common, practicePoolTaxonomyId: snapshot.practicePoolTaxonomyId, jobs: jobs.status(),
      generation: await generationStatus(env), canRefresh: refreshSnapshot !== null };
  };

  return async function handleAdmin(request, context = {}) {
    const url = new URL(request.url);
    const route = url.pathname.slice(ADMIN_ROUTE_PREFIX.length);
    const method = request.method;

    if (route === 'session' && method === 'GET') {
      const session = auth.session(request);
      return json(200, session ? { authenticated: true, username: session.username, csrf: session.csrf } : { authenticated: false });
    }
    if (route === 'login' && method === 'POST') {
      const body = await readBody(request);
      if (body.tooLarge) return error(413, 'PAYLOAD_TOO_LARGE');
      if (!body.ok) return error(400, 'INVALID_REQUEST');
      const result = auth.login(request, { username: body.value.username, password: body.value.password }, context.clientIp);
      if (!result.ok) {
        if (result.code === 'LOCKED') return json(429, { error: 'LOCKED', message: 'Too many wrong passwords. Try again later.' }, { 'retry-after': String(result.retryAfterSeconds) });
        if (result.code === 'ORIGIN_REJECTED') return error(403, 'ORIGIN_REJECTED');
        return error(401, 'INVALID_CREDENTIALS', 'Wrong username or password.');
      }
      return json(200, { authenticated: true, csrf: result.csrf }, { 'set-cookie': auth.cookie(result.token, result.expiresAt) });
    }

    // Everything else needs the admin session; state changes also need the same origin and the CSRF header.
    const session = method === 'GET' ? auth.session(request) : auth.mutation(request);
    if (!session) return error(method === 'GET' ? 401 : 403, method === 'GET' ? 'UNAUTHENTICATED' : 'FORBIDDEN');

    if (method === 'GET') {
      if (route === 'overview') return json(200, await overview());
      if (route === 'questions') return json(200, { readAt: getSnapshot().readAt, items: getSnapshot().summaries });
      if (route === 'question') {
        const detail = getSnapshot().detail(url.searchParams.get('id'));
        return detail ? json(200, detail) : error(404, 'NOT_FOUND');
      }
      if (route === 'image') {
        const meta = getSnapshot().image(url.searchParams.get('id'));
        if (!meta || !imageStore) return error(404, 'NOT_FOUND');
        try {
          const object = await imageStore.read({ contentHash: meta.contentHash, mediaType: meta.mediaType, byteSize: meta.byteSize });
          return new Response(object.bytes, { status: 200, headers: { 'content-type': meta.mediaType, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' } });
        } catch { return error(404, 'NOT_FOUND'); }
      }
      if (route === 'inbox' && !readOnly) return json(200, await jobs.listInbox());
      return error(404, 'NOT_FOUND');
    }

    if (method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED');
    if (route === 'logout') {
      auth.logout(session);
      return json(200, { authenticated: false }, { 'set-cookie': auth.clearedCookie() });
    }
    // The public site only shows the Bank: every route that writes, imports, publishes or generates is absent there.
    if (readOnly) return error(404, 'NOT_FOUND');
    const body = await readBody(request, BODY_LIMITS[route] ?? MAX_BODY_BYTES);
    if (body.tooLarge) return error(413, 'PAYLOAD_TOO_LARGE');
    if (!body.ok) return error(400, 'INVALID_REQUEST');
    const input = body.value;
    const confirm = typeof input.confirm === 'string' ? input.confirm : undefined;

    if (route === 'inbox/file') {
      if (!jobs.available) return error(409, 'NO_RETAINED_BANK', 'Rehearsal mode has no real Bank to import into.');
      const result = await jobs.saveInboxFile({ section: section(input.section), fileName: input.fileName, text: input.text });
      return result.ok ? json(201, result) : error(400, result.code);
    }
    if (route === ARCHIVE_ROUTE) {
      if (!jobs.available) return error(409, 'NO_RETAINED_BANK', 'Rehearsal mode has no real Bank to import into.');
      const result = await jobs.saveArchive({ section: section(input.section), base64: input.base64 });
      return result.ok ? json(201, result) : error(400, result.code, result.message);
    }
    if (route === FIGURE_ROUTE || route === 'inbox/retry') {
      if (!jobs.available) return error(409, 'NO_RETAINED_BANK', 'Rehearsal mode has no real Bank to import into.');
      const result = route === FIGURE_ROUTE
        ? await jobs.saveFigure({ section: section(input.section), fileName: input.fileName, base64: input.base64 })
        : await jobs.retryRejected({ section: section(input.section), name: input.name });
      return result.ok ? json(201, result) : error(400, result.code);
    }
    if (route === 'question/change') {
      return json(200, await jobs.change({ versionId: input.versionId, action: input.action, section: input.section ?? null,
        reason: typeof input.reason === 'string' ? input.reason : null, confirm }));
    }
    if (route === 'inbox/run') return json(200, await jobs.inbox({ confirm }));
    if (route === 'pool/setup') return json(200, await jobs.setupPool({ confirm }));
    if (route === 'publish') {
      return json(200, await jobs.publish({ taxonomyVersionId: getSnapshot().practicePoolTaxonomyId,
        section: input.section ? section(input.section) ?? 'INVALID' : null, keepOneOfTwins: input.keepOneOfTwins === true, confirm }));
    }
    if (route === 'refresh') {
      if (!refreshSnapshot) return error(409, 'NO_RETAINED_BANK');
      await refreshSnapshot();
      return json(200, await overview());
    }
    if (route === 'generate') {
      if (!jobs.available) return error(409, 'NO_RETAINED_BANK', 'Rehearsal mode has no real Bank to import into.');
      const provider = PROVIDERS.includes(input.provider) ? input.provider : 'openai';
      const result = await generateQuestions({ section: section(input.section), topic: input.topic, count: Number(input.count),
        provider, inboxDirectory, env });
      return json(result.ok ? 200 : 400, result);
    }
    return error(404, 'NOT_FOUND');
  };
}
