# CP5 — Live URL, hardened (Sat 21 Nov)

Owner first: get SSH access to the relative's VPS (D4) with the CP0 checklist answered, point the DNS
record of the domain (D5) at it, and add the agent's SSH public key. Deployment is authorized in
OPEN_DECISIONS 2026-11-18; pushing is not, so deploy with `git bundle` or `rsync` of a tagged commit. Recommended implementer: Claude Code, Opus 5.5,
high — it drives SSH, runs the runbook and the checks. Fallback: Codex, high.

## Steps

1. Create local tag `demo-2026-11-21-rc1`; copy it to the server with `git bundle create` + `scp` (or rsync).
2. Follow `docs/guides/PUBLIC_DEMO_RUNBOOK.md` exactly; note any step that was wrong and fix the runbook.
3. Upload the frozen Bank with `infra/server/upload-bank.sh`; start the service.
4. **Smoke** (from the agent's machine): `curl -fsS https://<domain>/healthz`; TLS certificate valid
   (`curl -vI`); `/student/` 200; `/` 404; one staff API path 404; `http://` redirects to `https://`.
5. **Security**: run the student leakage check (`tests/critical/student-leakage.test.mjs` logic, or a
   small script reusing it) against the live URL: no key, explanation, draft id or staff field in any
   response before release. Port scan from outside: only 22/80/443 open; PostgreSQL not reachable.
   SSH: key-only login, password login disabled.
6. **Load**: a Node script (no new dependency; `fetch` + `Promise.all`) that creates 50 guests and has
   each start, answer and submit one Math section attempt concurrently; then 10 guests start the full
   test and save answers in all three sections. Check the relative's other sites still respond. Expected: 0 errors 5xx, p95
   response under 1 s, server memory stays under 70 % of RAM (record `free -m` before/after).
7. **Uptime**: a free external uptime monitor on `/healthz` every 5 minutes, alerting the owner
   (owner creates the account; agent never uses the owner's email in any request).
8. Owner opens the URL on their own phone and completes one attempt.

## Exit gate

All of steps 4–8 pass and are recorded. Any failure gets a fix in the repo, a redeploy and a re-run.

## Expected output

Live URL; report `plans/reports/<agent>-261121-live-deploy.md` with every command and result, load
numbers and screenshots; runbook corrections committed.
