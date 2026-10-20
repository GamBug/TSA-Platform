import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createMockApiService } from "./src/mock-api.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 4173;
const MAX_REQUEST_BYTES = 32 * 1024;

const PUBLIC_FILES = new Map([
  ["/", "public/index.html"],
  ["/index.html", "public/index.html"],
  ["/styles.css", "public/styles.css"],
  ["/app/main.js", "public/app/main.js"],
  ["/app/api.js", "public/app/api.js"],
  ["/app/staff.js", "public/app/staff.js"],
]);

const CONTENT_TYPES = {
  "public/index.html": "text/html; charset=utf-8",
  "public/styles.css": "text/css; charset=utf-8",
  "public/app/main.js": "text/javascript; charset=utf-8",
  "public/app/api.js": "text/javascript; charset=utf-8",
  "public/app/staff.js": "text/javascript; charset=utf-8",
};

function result(status, headers, body) {
  return { status, headers, body };
}

function notFound() {
  return result(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, "Not found.");
}

export function createPrototypeHandler({ mockService = createMockApiService() } = {}) {
  return async ({ method = "GET", url = "/", headers = {}, body }) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url, "http://127.0.0.1");
    } catch {
      return notFound();
    }
    if (parsedUrl.pathname === "/mock" || parsedUrl.pathname.startsWith("/mock/")) {
      return mockService.handle({ method, url: `${parsedUrl.pathname}${parsedUrl.search}`, headers, body });
    }
    if (method !== "GET") return notFound();
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
  return pathname.startsWith("/local-auth/") || pathname.startsWith("/local/workspace/")
    || pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

function tooLargeResponse(url) {
  if (url.startsWith("/api/v1")) {
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

async function sendResponse(outgoing, method, response) {
  if (response instanceof Response) {
    const headers = {};
    for (const [name, value] of response.headers) {
      if (name.toLowerCase() !== "set-cookie") headers[name] = value;
    }
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) headers["set-cookie"] = cookies;
    outgoing.writeHead(response.status, headers);
    const bytes = await response.arrayBuffer();
    outgoing.end(method === "HEAD" ? undefined : Buffer.from(bytes));
    return;
  }
  outgoing.writeHead(response.status, response.headers);
  outgoing.end(method === "HEAD" ? undefined : response.body);
}

export function createPrototypeServer({
  port = DEFAULT_PORT,
  mockService = createMockApiService(),
  maxRequestBytes = MAX_REQUEST_BYTES,
  integratedRequestHandler,
} = {}) {
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1 || maxRequestBytes > 1024 * 1024) {
    throw new TypeError("maxRequestBytes must be an integer from 1 through 1048576");
  }
  const handle = createPrototypeHandler({ mockService });
  return createServer(async (incoming, outgoing) => {
    try {
      const method = incoming.method ?? "GET";
      let body = Buffer.alloc(0);
      if (method !== "GET" && method !== "HEAD") {
        const requestBody = await readRequestBody(incoming, maxRequestBytes);
        if (requestBody.tooLarge) {
          await sendResponse(outgoing, method, tooLargeResponse(incoming.url ?? "/"));
          return;
        }
        body = requestBody.body;
      }
      const url = incoming.url ?? "/";
      if (typeof integratedRequestHandler === "function" && requestLike(method, new URL(url, "http://127.0.0.1").pathname)) {
        const host = incoming.headers.host ?? "127.0.0.1";
        const fetchRequest = new Request(`http://${host}${url}`, {
          method,
          headers: requestHeaders(incoming),
          ...(body.byteLength ? { body: new Uint8Array(body) } : {}),
        });
        const response = await integratedRequestHandler(fetchRequest);
        await sendResponse(outgoing, method, response);
        return;
      }
      const response = await handle({ method, url, headers: incoming.headers, body: body.toString("utf8") });
      await sendResponse(outgoing, method, response);
    } catch {
      const requestUrl = incoming.url ?? "/";
      if (requestUrl.startsWith("/api/v1")) {
        const requestId = randomUUID();
        outgoing.writeHead(503, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Request-Id": requestId,
        });
        outgoing.end(JSON.stringify({ error: {
          code: "TEMPORARILY_UNAVAILABLE", message: "The local request could not be completed", requestId, details: {},
        } }));
        return;
      }
      outgoing.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
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
