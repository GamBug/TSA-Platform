import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveClientIp } from "../../src/http/client-ip.mjs";
import { createMockApiService } from "./src/mock-api.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 4173;
const MAX_REQUEST_BYTES = 32 * 1024;

const PUBLIC_FILES = new Map([
  ["/", "public/index.html"],
  ["/index.html", "public/index.html"],
  ["/styles.css", "public/styles.css"],
  ["/fonts.css", "public/fonts.css"],
  ["/fonts/OFL.txt", "public/fonts/OFL.md"],
  ["/app/main.js", "public/app/main.js"],
  ["/app/simulation.js", "public/app/simulation.js"],
  ["/simulation.css", "public/simulation.css"],
  ["/app/persistent-api.js", "public/app/persistent-api.js"],
  ["/app/api.js", "public/app/api.js"],
  ["/app/staff.js", "public/app/staff.js"],
  ["/app/math.js", "public/app/math.js"],
  ["/app/question-media.js", "public/app/question-media.js"],
  ["/app/topic-practice.js", "public/app/topic-practice.js"],
  ["/app/exam-shortcuts.js", "public/app/exam-shortcuts.js"],
  ["/app/demo-notice.js", "public/app/demo-notice.js"],
  ["/vendor/katex.mjs", "../../node_modules/katex/dist/katex.mjs"],
  ["/vendor/katex-LICENSE.txt", "../../node_modules/katex/LICENSE"],
]);

const CONTENT_TYPES = {
  "public/index.html": "text/html; charset=utf-8",
  "public/styles.css": "text/css; charset=utf-8",
  "public/fonts.css": "text/css; charset=utf-8",
  "public/fonts/OFL.md": "text/plain; charset=utf-8",
  "public/app/main.js": "text/javascript; charset=utf-8",
  "public/app/simulation.js": "text/javascript; charset=utf-8",
  "public/simulation.css": "text/css; charset=utf-8",
  "public/app/persistent-api.js": "text/javascript; charset=utf-8",
  "public/app/api.js": "text/javascript; charset=utf-8",
  "public/app/staff.js": "text/javascript; charset=utf-8",
  "public/app/math.js": "text/javascript; charset=utf-8",
  "public/app/question-media.js": "text/javascript; charset=utf-8",
  "public/app/topic-practice.js": "text/javascript; charset=utf-8",
  "public/app/exam-shortcuts.js": "text/javascript; charset=utf-8",
  "public/app/demo-notice.js": "text/javascript; charset=utf-8",
  "../../node_modules/katex/dist/katex.mjs": "text/javascript; charset=utf-8",
  "../../node_modules/katex/LICENSE": "text/plain; charset=utf-8",
};

// Only the bundled, independently licensed font files are public assets.
for (const weight of [400, 500, 600, 700]) {
  for (const subset of ["latin", "latin-ext", "vietnamese"]) {
    const file = `be-vietnam-pro-${weight}-${subset}.woff2`;
    PUBLIC_FILES.set(`/fonts/${file}`, `public/fonts/${file}`);
    CONTENT_TYPES[`public/fonts/${file}`] = "font/woff2";
  }
}

function result(status, headers, body) {
  return { status, headers, body };
}

function notFound() {
  return result(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, "Not found.");
}

// The React student app (apps/candidate-web) is served from its build output at /student/.
// Only index.html and plainly named files directly inside assets/ with a known type are public.
const STUDENT_APP_ROOT = resolve(ROOT, "../candidate-web/dist");
const STUDENT_ASSET_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function studentAppResponse(pathname) {
  if (pathname === "/student") return result(308, { Location: "/student/", "Cache-Control": "no-store" }, "");
  let filePath;
  let contentType;
  if (pathname === "/student/" || pathname === "/student/index.html") {
    filePath = resolve(STUDENT_APP_ROOT, "index.html");
    contentType = "text/html; charset=utf-8";
  } else {
    const match = /^\/student\/assets\/([A-Za-z0-9_-][A-Za-z0-9._-]*)$/.exec(pathname);
    const extension = match && /\.[a-z0-9]+$/.exec(match[1])?.[0];
    contentType = extension && STUDENT_ASSET_TYPES[extension];
    if (!contentType || match[1].includes("..")) return notFound();
    filePath = resolve(STUDENT_APP_ROOT, "assets", match[1]);
  }
  try {
    const content = await readFile(filePath);
    return result(200, { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, content);
  } catch {
    if (contentType.startsWith("text/html")) {
      return result(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        "The student app is not built. Run: npm run build:student");
    }
    return notFound();
  }
}

// Public demo: only the React student app is served; the mock API and the old UI files are not.
export function createPrototypeHandler({ mockService = createMockApiService(), studentOnly = false } = {}) {
  return async ({ method = "GET", url = "/", headers = {}, body }) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url, "http://127.0.0.1");
    } catch {
      return notFound();
    }
    if (studentOnly && method !== "GET" && method !== "HEAD") return notFound();
    if (studentOnly && parsedUrl.pathname !== "/student" && !parsedUrl.pathname.startsWith("/student/")) return notFound();
    if (parsedUrl.pathname === "/mock" || parsedUrl.pathname.startsWith("/mock/")) {
      return mockService.handle({ method, url: `${parsedUrl.pathname}${parsedUrl.search}`, headers, body });
    }
    if (method !== "GET") return notFound();
    if (parsedUrl.pathname === "/student" || parsedUrl.pathname.startsWith("/student/")) {
      return studentAppResponse(parsedUrl.pathname);
    }
    const relativePath = PUBLIC_FILES.get(parsedUrl.pathname);
    if (relativePath === undefined) return notFound();
    try {
      const filePath = resolve(ROOT, relativePath);
      const content = await readFile(filePath);
      return result(200, {
        "Content-Type": CONTENT_TYPES[relativePath],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      }, content);
    } catch {
      return notFound();
    }
  };
}

async function readRequestBody(request, maxRequestBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) {
      request.resume();
      return { tooLarge: true, body: Buffer.alloc(0) };
    }
    chunks.push(chunk);
  }
  return { tooLarge: false, body: Buffer.concat(chunks) };
}

function requestLike(method, pathname) {
  return pathname.startsWith("/local-auth/") || pathname.startsWith("/local/")
    || /^\/api\/v[1234](?:\/|$)/.test(pathname);
}

function tooLargeResponse(url) {
  if (/^\/api\/v[1234](?:\/|$|\?)/.test(url)) {
    const requestId = randomUUID();
    return {
      status: 413,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({ error: {
        code: "PAYLOAD_TOO_LARGE", message: "Request body is too large", requestId, details: {},
      } }),
    };
  }
  return {
    status: 413,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    body: JSON.stringify({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } }),
  };
}

function requestHeaders(incoming) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

// Add headers a response does not already set (names compare case-insensitively).
function withExtraHeaders(headers, extraHeaders) {
  const present = new Set(Object.keys(headers).map((name) => name.toLowerCase()));
  const merged = { ...headers };
  for (const [name, value] of Object.entries(extraHeaders)) if (!present.has(name.toLowerCase())) merged[name] = value;
  return merged;
}

async function sendResponse(outgoing, method, response, extraHeaders = {}) {
  if (response instanceof Response) {
    const headers = {};
    for (const [name, value] of response.headers) {
      if (name.toLowerCase() !== "set-cookie") headers[name] = value;
    }
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) headers["set-cookie"] = cookies;
    outgoing.writeHead(response.status, withExtraHeaders(headers, extraHeaders));
    const bytes = await response.arrayBuffer();
    outgoing.end(method === "HEAD" ? undefined : Buffer.from(bytes));
    return;
  }
  outgoing.writeHead(response.status, withExtraHeaders(response.headers, extraHeaders));
  outgoing.end(method === "HEAD" ? undefined : response.body);
}

// The original student UI is retired from demos; its links open the matching React student app mode.
const LEGACY_STUDENT_MODES = { postgres: "", "postgres-v2": "?mode=numeric", "postgres-v4": "?mode=interactions", "postgres-v3": "?mode=simulation" };

export function legacyStudentRedirect(url) {
  let parsed;
  try { parsed = new URL(url, "http://127.0.0.1"); } catch { return null; }
  if (parsed.pathname !== "/" && parsed.pathname !== "/index.html") return null;
  const mode = parsed.searchParams.get("student");
  return mode !== null && Object.hasOwn(LEGACY_STUDENT_MODES, mode) ? `/student/${LEGACY_STUDENT_MODES[mode]}` : null;
}

// Headers added to every response of the public demo. The policy matches the built student app:
// scripts, connections and images come from the app's own origin only; inline styles are allowed
// because React and the math renderer set style attributes.
export const PUBLIC_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
    + "font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
});

/**
 * Check a request against the public origin and map it to the loopback origin the handlers trust.
 * The reverse proxy must forward the original Host header. Returns null for a rejected request.
 */
export function mapPublicRequest({ headers, port, publicOrigin }) {
  const publicHost = new URL(publicOrigin).host.toLowerCase();
  const host = headers.get("host");
  const origin = headers.get("origin");
  if (host === null || host.toLowerCase() !== publicHost) return null;
  if (origin !== null && origin !== publicOrigin) return null;
  const internalOrigin = `http://127.0.0.1:${port}`;
  const mapped = new Headers(headers);
  mapped.set("host", new URL(internalOrigin).host);
  if (origin !== null) mapped.set("origin", internalOrigin);
  return { headers: mapped, internalOrigin };
}

export function createPrototypeServer({
  port = DEFAULT_PORT,
  mockService = createMockApiService(),
  maxRequestBytes = MAX_REQUEST_BYTES,
  integratedRequestHandler,
  redirectLegacyStudentUi = false,
  // Public demo: an https origin served by a reverse proxy; see mapPublicRequest.
  publicOrigin = null,
} = {}) {
  if (publicOrigin !== null) {
    let parsed;
    try { parsed = new URL(publicOrigin); } catch { parsed = null; }
    if (!parsed || parsed.protocol !== "https:" || parsed.origin !== publicOrigin) {
      throw new TypeError("publicOrigin must be a canonical https origin");
    }
  }
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1 || maxRequestBytes > 1024 * 1024) {
    throw new TypeError("maxRequestBytes must be an integer from 1 through 1048576");
  }
  const handle = createPrototypeHandler({ mockService, studentOnly: publicOrigin !== null });
  const extraHeaders = publicOrigin === null ? {} : PUBLIC_SECURITY_HEADERS;
  return createServer(async (incoming, outgoing) => {
    try {
      const method = incoming.method ?? "GET";
      if (publicOrigin !== null && (method === "GET" || method === "HEAD")
          && new URL(incoming.url ?? "/", "http://127.0.0.1").pathname === "/healthz") {
        // Uptime probe: no attempt, session or database access.
        await sendResponse(outgoing, method, result(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff" }, JSON.stringify({ ok: true })), extraHeaders);
        return;
      }
      // Public demo: reject any other Host or Origin before reading a body, then map to the loopback origin.
      let edge = null;
      if (publicOrigin !== null) {
        edge = mapPublicRequest({ headers: requestHeaders(incoming), port: incoming.socket.localPort, publicOrigin });
        if (edge === null) {
          await sendResponse(outgoing, method, result(403, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff" }, JSON.stringify({ error: "ORIGIN_REJECTED" })), extraHeaders);
          return;
        }
      }
      let body = Buffer.alloc(0);
      if (method !== "GET" && method !== "HEAD") {
        const requestBody = await readRequestBody(incoming, maxRequestBytes);
        if (requestBody.tooLarge) {
          await sendResponse(outgoing, method, tooLargeResponse(incoming.url ?? "/"), extraHeaders);
          return;
        }
        body = requestBody.body;
      }
      const url = incoming.url ?? "/";
      const legacyTarget = redirectLegacyStudentUi && publicOrigin === null && method === "GET" ? legacyStudentRedirect(url) : null;
      if (legacyTarget) {
        await sendResponse(outgoing, method, result(303, { Location: legacyTarget, "Cache-Control": "no-store" }, ""));
        return;
      }
      if (typeof integratedRequestHandler === "function" && requestLike(method, new URL(url, "http://127.0.0.1").pathname)) {
        const host = incoming.headers.host ?? "127.0.0.1";
        const fetchRequest = new Request(edge ? `${edge.internalOrigin}${url}` : `http://${host}${url}`, {
          method,
          headers: edge ? edge.headers : requestHeaders(incoming),
          ...(body.byteLength ? { body: new Uint8Array(body) } : {}),
        });
        const response = await integratedRequestHandler(fetchRequest, {
          clientIp: resolveClientIp({ remoteAddress: incoming.socket.remoteAddress, forwardedFor: incoming.headers["x-forwarded-for"] }),
        });
        await sendResponse(outgoing, method, response, extraHeaders);
        return;
      }
      const response = await handle({ method, url, headers: incoming.headers, body: body.toString("utf8") });
      await sendResponse(outgoing, method, response, extraHeaders);
    } catch {
      const requestUrl = incoming.url ?? "/";
      if (/^\/api\/v[1234](?:\/|$|\?)/.test(requestUrl)) {
        const requestId = randomUUID();
        outgoing.writeHead(503, withExtraHeaders({
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Request-Id": requestId,
        }, extraHeaders));
        outgoing.end(JSON.stringify({ error: {
          code: "TEMPORARILY_UNAVAILABLE", message: "The local request could not be completed", requestId, details: {},
        } }));
        return;
      }
      outgoing.writeHead(500, withExtraHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, extraHeaders));
      outgoing.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "The local demo could not complete this request." } }));
    }
  });
}

function parsePort(value) {
  if (value === undefined || value === "") return DEFAULT_PORT;
  if (!/^[0-9]{1,5}$/.test(value)) throw new TypeError("PORT must be an integer from 1 through 65535");
  const port = Number(value);
  if (port < 1 || port > 65_535) throw new TypeError("PORT must be an integer from 1 through 65535");
  return port;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = parsePort(process.env.PORT);
  const server = createPrototypeServer({ port });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Practice prototype listening at http://127.0.0.1:${port}\n`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
