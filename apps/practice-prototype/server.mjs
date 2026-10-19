import { createServer } from "node:http";
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
]);

const CONTENT_TYPES = {
  "public/index.html": "text/html; charset=utf-8",
  "public/styles.css": "text/css; charset=utf-8",
  "public/app/main.js": "text/javascript; charset=utf-8",
  "public/app/api.js": "text/javascript; charset=utf-8",
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

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      request.resume();
      return { tooLarge: true, body: "" };
    }
    chunks.push(chunk);
  }
  return { tooLarge: false, body: Buffer.concat(chunks).toString("utf8") };
}

export function createPrototypeServer({ port = DEFAULT_PORT, mockService = createMockApiService() } = {}) {
  const handle = createPrototypeHandler({ mockService });
  return createServer(async (incoming, outgoing) => {
    try {
      const method = incoming.method ?? "GET";
      let body;
      if (method !== "GET" && method !== "HEAD") {
        const requestBody = await readRequestBody(incoming);
        if (requestBody.tooLarge) {
          outgoing.writeHead(413, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          outgoing.end(JSON.stringify({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } }));
          return;
        }
        body = requestBody.body;
      }
      const response = await handle({ method, url: incoming.url ?? "/", headers: incoming.headers, body });
      outgoing.writeHead(response.status, response.headers);
      if (Buffer.isBuffer(response.body)) outgoing.end(method === "HEAD" ? undefined : response.body);
      else outgoing.end(method === "HEAD" ? undefined : response.body);
    } catch {
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
