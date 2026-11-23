# Phase 3 — Security

Purpose: check that students cannot see keys early, the admin page is closed to everyone else, uploads are bounded and
no secret is in the repository. Report: `reports/phase-03-security.md`. Probe only the local demo on `127.0.0.1`.

## A. Suites

```bash
npm run test:auth
npm run test:critical:privacy
npm run test:student
npm run test:admin
npm run test:demo:public            # known: subtest "each browser gets its own guest" failed before; confirm only
npm run test:student:rate-limit
```

## B. Probes against the local demo (`DEMO_ADMIN_PASSWORD='QaOnly-261123' npm start`, PID in STATUS.md)

Use `curl -s -i` and record the status line and the relevant header or body field. `O=http://127.0.0.1:4180`.

- 3.1 Without a session: `GET $O/local/admin/overview`, `/questions`, `/question?id=<uuid>`, `/inbox` → expect 401.
- 3.2 Sign-in from a foreign origin: `POST $O/local/admin/login` with `Origin: https://evil.example` → expect 403.
- 3.3 Lockout: 5 wrong passwords, then the right one → expect 429 with `retry-after`. (This locks the admin for 15
  minutes; do it last, or restart the demo afterwards.)
- 3.4 With a valid session cookie but **without** the `x-admin-csrf` header: `POST $O/local/admin/inbox/run` → 403.
  With the header but a foreign `Origin` → 403.
- 3.5 Cookie flags on the login response: `HttpOnly`, `SameSite=Strict`, `Path=/local/admin/`.
- 3.6 Upload limits (with session and CSRF): `inbox/file` larger than 900 KB → refused; `inbox/figure` with a name like
  `../../x_NEW-IMG-001.png`, a non-image body, more than 2 MB → refused; check no file appeared outside
  `question-inbox/` (`find . -newer STATUS.md -name '*NEW-IMG*' -not -path './question-inbox/*'`).
- 3.7 `inbox/retry` with `name` containing `../` → refused.
- 3.8 Response headers of `/student/` and of an API response: `Content-Security-Policy`, `X-Content-Type-Options`,
  `X-Frame-Options` or `frame-ancestors`; record what is present.
- 3.9 **Key leakage**: as a guest, start a practice, and save the JSON the student API returns for the questions
  (use the browser script and `page.on('response')`, or the network calls the app makes). Search it for `answerKey`,
  `answer_key`, `correct`, `explanation`, `optionId` of the key. Expect none before submit. After submit and release,
  explanations may appear; record when they appear.
- 3.10 Another guest cannot read the first guest's attempt: reuse an attempt id from guest A with guest B's cookie → 403/404.

Stop the demo. Then start the public mode briefly to check the admin is absent:
```bash
DEMO_PUBLIC=true DEMO_PUBLIC_ORIGIN=https://qa.invalid npm run demo:uni
```
- 3.11 Every `/local/admin/...` path → 404 (also the `?page=admin` student page must not offer sign-in). If public mode
  refuses to start without more settings, record its message and mark NOT RUN; do not change any code.

## C. Static checks (read-only)

- 3.12 Secrets in tracked files: `git grep -n -I -E "sk-[A-Za-z0-9_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|OPENAI_API_KEY=[^ ]+"`
  — report file and line only, **never paste a secret value**.
- 3.13 `git ls-files | grep -E "\.env|question-inbox|\.local/"` → expect nothing tracked.
- 3.14 The admin password is stored only as a hash: read `src/local/admin/admin-auth.mjs` and say so (do not try to crack it).
- 3.15 `npm audit --omit=dev` (read-only report; it contacts the npm registry). Record the counts by severity.

## Report focus

Map each result to a CRITICAL/HIGH rule in `plan.md`. A probe that behaves as expected is a PASS line, not a finding.
