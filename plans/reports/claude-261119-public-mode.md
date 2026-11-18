# CP1 report — public demo mode

Date: 2026-11-18 (Asia/Bangkok). Implementer: Claude Code (Sonnet 5.5), single agent, no subagents for the
implementation. Branch `feat/track-b-data-auth`, started at `c5606a6`. Task card:
[cp1-public-mode](../261118-1305-public-demo-launch/cp1-public-mode.md).

## Outcome

`DEMO_PUBLIC=true DEMO_PUBLIC_ORIGIN=https://<domain> npm run demo:uni` now serves only the student app and
the candidate APIs for a public https origin, gives each new browser its own synthetic guest, and answers 404
for every staff path. Without `DEMO_PUBLIC` nothing changed. No migration, student API contract, question
contract, retained Bank, `apps/candidate-web` or `data/` file was touched.

## What changed

| Area | Change |
|---|---|
| `scripts/start-uni-demo.mjs` | `parsePublicDemoEnvironment` reads and validates the variables below before any database work; summary prints the public URLs and the proxy target. |
| `src/local/uni-demo.mjs` | `publicOrigin`, `guestPool`, `guestsPerHour` options; public URLs; `staff` is `null`; the notice carries the flag. |
| `src/local/track-b.mjs` | `publicDemo` option. Creates the guest pool, builds an allow-listed router, and creates no staff handler for routing. |
| `apps/practice-prototype/server.mjs` | Public edge: checks Host and Origin against the public origin, maps them to the loopback origin the handlers already trust, serves only `/student*`, answers `/healthz`, adds security headers, passes the client address. |
| `src/modules/identity/local-synthetic.mjs` | Guest actors (`guest-0001…`, ids `00000000-0000-4000-9000-…`), `preparePublicGuestIdentity`, a guest-only service profile, atomic claim of the next unused guest. |
| `src/http/local-auth.mjs` | Public profile: only `GET /local-auth/session` and `POST /local-auth/guest` exist. |
| `src/http/client-ip.mjs`, `src/http/guest-rate-limit.mjs` | New: forwarded-address resolution and the per-address limiter. |
| `tests/integration/local/uni-demo-public.test.mjs`, `package.json` | 13 tests; script `test:demo:public`. |
| Guides | "Public mode" section in the run of show; short note in the student web guide. |

Design choice: the edge maps the public Host and Origin to `http://127.0.0.1:<port>` instead of relaxing the
loopback validation in the identity, attempt and Bank handlers. Their security checks are unchanged and the
public origin is enforced in exactly one place.

## Environment variables

| Variable | Meaning |
|---|---|
| `DEMO_PUBLIC` | `true` enables the mode. `false` or unset: local demo. Any other value is an error. |
| `DEMO_PUBLIC_ORIGIN` | Required with `DEMO_PUBLIC`: canonical `https://host[:port]`, no path. Refused otherwise; also refused without `DEMO_PUBLIC`. |
| `DEMO_GUEST_POOL` | Guests created at start, 1–9999, default 1000. |
| `DEMO_GUESTS_PER_HOUR` | New guests per client address per hour, default 10. |
| `DEMO_UNI_PORT` | Unchanged, default 4180; still binds `127.0.0.1`. |

`NODE_ENV` must stay unset or `development` (existing local-synthetic guard).

## Guest flow and the flag for the student app (for CP3)

- Flag: `GET /local/demo-notice` returns the existing notice plus
  `publicDemo: { "enabled": true, "guestPath": "/local-auth/guest" }` in public mode only. The legacy parser in
  `apps/practice-prototype/public/app/demo-notice.js` drops unknown fields, so CP3 should read `publicDemo`
  from the raw JSON or extend that parser.
- `POST /local-auth/guest`, empty JSON body, `Origin: <public origin>` header:
  - no session: `201 { authenticated: true, principal: { userId, actorKey: "guest", roles: ["CANDIDATE"], expiresAt }, csrfToken }`
    and cookies `tsa_local_session` (HttpOnly) and `tsa_local_csrf`, both `Secure; SameSite=Lax`, 8 hours;
  - session already held: send the `x-csrf-token` header (value of the `tsa_local_csrf` cookie), get `200` with
    the same principal and no cookie change; without the header `403 CSRF_REJECTED`;
  - pool used up: `503 { error: "GUEST_POOL_EXHAUSTED", message: "Bản demo đã đủ lượt truy cập, vui lòng thử lại sau." }`;
  - over the per-address limit: `429 { error: "GUEST_RATE_LIMITED" }` with `Retry-After`.
- In public mode `/local-auth/bootstrap`, `/login` and `/logout` are 404, so the current app sign-in (A/B login)
  does not work there until CP3 switches it to the guest call. A guest is never recycled; logout is absent on purpose.
- Mutating candidate calls are unchanged: cookies, `x-csrf-token`, `Origin` and `idempotency-key` as today.

## Public surface

Reachable: `/student/` and its assets, `/healthz`, `/api/v1`–`/api/v4` candidate routes (catalog, attempts, topics,
topic practice, and all of `/api/v3/`), `GET /local-auth/session`, `POST /local-auth/guest`, `GET /local/demo-notice`.
Everything else is 404 (`Not found.` or the standard NOT_FOUND JSON) — including `/`, `?student=` links, the mock
API, `/local/workspace/template`, and all staff, bank and exam-manager routes. Wrong Host or Origin: 403. All
responses carry the CSP (`script-src 'self'`, `style-src 'self' 'unsafe-inline'`), `nosniff`,
`Referrer-Policy: same-origin`, `X-Frame-Options: DENY`. Existing sessions of the restored copy are revoked at
start, and only pool guests authenticate.

Reverse proxy contract (for CP4): terminate TLS, forward the original `Host` and `Origin`, append the client to
`X-Forwarded-For` (the last entry is used, and only from a loopback peer), health probe `http://127.0.0.1:4180/healthz`.

## Commands and results

All run from the repository root on 2026-11-18; logs kept in the session scratchpad.

| Command | Result |
|---|---|
| `npm run build` | exit 0 |
| `npm run test:demo:public` (new) | 13 tests, 13 pass, 0 fail, 0 skipped |
| `npm run test:demo:uni` | 17 pass, 0 fail, 0 skipped |
| `npm run test:critical:privacy` | 2 pass, 0 fail |
| `npm run test:student` | 85 pass, 0 fail |
| `npm run test:student-web` | 2 pass, 0 fail |
| `npm run test:b0` | 112 pass, 0 fail |
| `npm run test:docs` | 13 pass, 0 fail |

Covered by `test:demo:public`: https-only start and launcher refusal; staff, old-UI, mock and `/local` paths 404 with a
guest cookie; wrong Host and Origin rejected; two guests differ and the second cannot read or start the first's
attempt; resume returns the same guest; a pool of 3 gives 503 on the fourth browser; the per-address limit (429,
forged leading forwarded entries ignored, resume free); `/healthz`; security headers; SIGTERM of the real launcher
exits 0 and leaves no new `postgres` process, and in-process close leaves none for the demo directory.

Not run: `test:student-web:browser`, `test:demo:uni:browser` and Firefox suites (not in the exit gate; they use the
local mode). No real-browser check of the CSP or of the app behind TLS was done: the built app was not inspected
(the repository's scout hook blocks `dist`), so the CSP is checked only by reasoning from the Vite config
(`assetsInlineLimit: 0`, bundled KaTeX, no inline script) — CP3/CP5 should confirm in a browser over https.

## Known limits and notes

- The task card says to use "the existing rate-limit module". Existing limits are per-user database buckets; there
  is no per-address limiter, so a small in-memory one was added. It resets on restart.
- A visitor whose 8-hour session expired, or who clears cookies, gets a new guest (or 503); old attempts are
  unreachable. All data is lost on restart anyway.
- Pool exhaustion is cheap to cause from many addresses (10 per address per hour by default); raise the pool or
  lower the rate for launch day if needed.
- Offerings built at start use a window of "now − 1 hour to now + 1 day" (`uni-demo-seed.mjs`). A public demo
  that runs longer than a day without restart stops offering practice. CP4/CP5 should restart daily or the seed
  window should be widened (not changed here).
- The CSP allows inline styles (React and KaTeX set style attributes); scripts are same-origin only.

## Review

`/code-review` (high) ran on the working-tree diff before the commit. It reported ten findings; no correctness defect
in the guest, 404 or origin logic. Fixed: IPv6 clients are now limited per /64 (IPv4-mapped forms map to IPv4), and
guest-pool setup no longer scans the user list quadratically. `test:demo:public` (13) and `test:demo:uni` (17) pass
again after these two changes; the other suites were not re-run because they do not touch these paths.

Not changed, with reasons:
- Offering window of one day (`uni-demo-seed.mjs`): outside the CP1 files; listed under known limits for CP4/CP5.
- `POST /local-auth/guest` is not idempotent for a browser without a session: two simultaneous first calls take two
  guests. CP3 must call it once per page load (guard against double mount and retries).
- A visitor who keeps the session cookie but loses the CSRF cookie gets 403 on resume until the session expires;
  the CSRF token cannot be reissued because only its hash is stored.
- Per-address limiting has no global ceiling, so many addresses can still drain the pool; behind a CDN or tunnel
  the last `X-Forwarded-For` entry is the edge, not the visitor (CP4 must fix the proxy chain or set a hop rule).
- `/` answers 404 by the plan's acceptance criterion, not a redirect; a landing page is CP3 work.
- Duplicated https-origin and bound checks in four files and the extra startup-only staff handlers in public mode are
  design debt, not defects: the staff handlers are never routed and the staff profile needs an explicit
  `guestsOnly: false`.

## Unresolved questions

None blocking. Owner may want to decide the guest pool size and per-address limit for launch day.
