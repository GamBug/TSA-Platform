# CP1 — Public demo mode (Wed 18 – Thu 19 Nov)

Recommended implementer: Codex (Plus), the strongest coding model in your Codex model picker, reasoning
high — security-sensitive change across identity, HTTP routing and the launcher, best done by one
careful agent with long test runs. Fallback: Claude Code, Opus 5.5, high. Proposed independent reviewer
(read-only, only if the owner assigns it): Claude Code with the code-review skill.

## Prompt to give the agent

> Read AGENTS.md, `plans/261118-1305-public-demo-launch/plan.md`, this file and the CP0 section in
> OPEN_DECISIONS. Implement a `DEMO_PUBLIC=true` mode of `npm run demo:uni`. Do not change any
> student API contract, question contract or the retained Bank. Commit locally when the exit gate passes.

## Requirements

1. **Configuration** (`scripts/start-uni-demo.mjs`, `src/local/uni-demo.mjs`):
   - `DEMO_PUBLIC=true` enables the mode; `DEMO_PUBLIC_ORIGIN=https://<domain>` is required with it
     (refuse to start without it, or if it is not `https://`).
   - Server still binds `127.0.0.1`; the reverse proxy is the only public entry.
   - The origin/host check (`src/local/track-b.mjs` ~line 279) accepts the public origin and Host in
     public mode, and still rejects everything else. Printed URLs use the public origin.
2. **Staff off**: in public mode, `/` (staff workspace), all staff/author/review/bank/exam-manager APIs
   and the old student screens return 404 with no body detail. Staff synthetic actors are not
   bootstrapped or selectable. Only `/student/`, its assets and the candidate APIs (v1–v4) respond.
3. **Guest identities** (`src/modules/identity/local-synthetic.mjs` + the session route):
   - At start, bootstrap `DEMO_GUEST_POOL` (default 1000) synthetic CANDIDATE actors `guest-0001…`.
   - New endpoint or existing session route variant: "start as guest" assigns the next unused guest to
     this browser and sets the existing session cookie (httpOnly, `Secure` in public mode, SameSite=Lax).
   - A browser that already holds a guest keeps it (resume works). Pool exhausted → HTTP 503 with a
     Vietnamese message "Bản demo đã đủ lượt truy cập, vui lòng thử lại sau." No recycling.
   - Students A/B are not offered in public mode.
4. **Abuse limits**: per-IP limit on guest creation (e.g. 10 per hour) using the existing rate-limit
   module; trust `X-Forwarded-For` only when the socket peer is `127.0.0.1`. Keep existing attempt limits.
5. **Headers** (public mode): `Content-Security-Policy` matching the built app (self only, no inline
   script), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`.
6. **Health**: `GET /healthz` returns `200 {"ok":true}` without touching attempts (for uptime checks).
7. **Shutdown**: SIGTERM stops the server and the disposable PostgreSQL cleanly (verify no orphan
   `postgres` process remains).

## Tests to add

`tests/integration/local/uni-demo-public.test.mjs` (rehearsal inventory, disposable DB):
- starts only with an https public origin; refuses otherwise;
- staff paths and old student screens → 404; `/student/` and candidate APIs → 200 with public Host;
- wrong Host/Origin → rejected;
- two guest sessions get different actor ids; guest B cannot read guest A's attempt (expect 404/403);
- same cookie twice → same guest; pool of 2 → third gets 503;
- guest-creation rate limit triggers; forwarded IP ignored from a non-local peer;
- `/healthz` → 200; security headers present.
Add the script `test:demo:public` to `package.json`.

## Exit gate (record commands and results in the report)

`npm run build`, `npm run test:demo:public`, `npm run test:demo:uni`, `npm run test:critical:privacy`,
`npm run test:student`, `npm run test:student-web`, `npm run test:b0`, `npm run test:docs` all pass.
Existing local (non-public) behaviour is unchanged.

## Expected output

- Code + tests committed: `feat(demo): add a public student-only demo mode with guest identities`.
- Guide section "Public mode" in `docs/guides/TRACK_B_SUPERVISOR_RUN_OF_SHOW.md` listing the env vars.
- Report `plans/reports/<agent>-261119-public-mode.md`; handoff and project state updated.
