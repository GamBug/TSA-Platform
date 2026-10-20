# Local practice prototype

This dependency-free browser prototype demonstrates a short practice flow with local mock data. It is unofficial and does not provide TSA scoring, approved learning content, accounts, durable storage, question selection, or a production backend.

## Run locally

From the repository root, start the loopback-only server:

```sh
node apps/practice-prototype/server.mjs
```

Open <http://127.0.0.1:4173>. To use a different local port, set `PORT` when starting the server. The mock session and answers live only in server memory and are cleared when the process stops.

Choose **Chọn bài luyện tập**, then start the Toán học demo. The timer is six minutes. The four positions repeat the same test question and are labeled as repeated data; they are not four distinct questions or an approved exam. Select or clear options, move between positions, then choose **Nộp bài** to review the answered/unanswered positions before confirming. Reloading the page in the same browser resumes the same in-memory attempt, acknowledged answers, and original deadline while the server process is still running; the interface says when it resumes. The demonstration result shows the raw correct count and percentage, marked unofficial. After grading, **Ôn tập đáp án** opens the fixture's answer and original explanation through a separate session-owned mock route; the score response remains separate. Returning to the catalog lets you start another explicit demo. Đọc hiểu and Khoa học are visible but unavailable.

The sole question is the existing synthetic fixture from [`packages/contracts/test/question.test.ts`](../../packages/contracts/test/question.test.ts): “What is x if x + 2 = 5?” with its original options. Before grading, the answer key and explanation remain server-side and do not appear in the attempt or score response. After grading, the separate session-owned review route returns the exact fixture answer and explanation. The mock service scores only after submission or timer expiry.

## Tests

Run the focused Node tests with:

```sh
node --test apps/practice-prototype/test/*.test.mjs
```

They cover mock-session and answer handling, clearing answers, timer and closure behavior, repeated-start/resume behavior, post-grade review authorization, strict request validation, private-field exclusion, translated client errors, and the explicit public-file allowlist.

## Limits

The server binds to `127.0.0.1` and has no external requests. Its random session cookie is only an in-memory demo handle, not authentication; the review ownership check is not a production access-control mechanism. It does not use a database, persist progress, select fresh questions, verify content permissions, or provide real exam services. Client code and browser assets are public; the prototype demonstrates server-side separation of the answer key and a post-grade review boundary, but it is not a deployment or browser-bundle security assessment.

## Persistent local staff mode

The existing frontend also supports the owner-authorized synthetic staff adapter:

```sh
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b
```

Requires the root dependencies and PostgreSQL18.6 tools (`PG_BIN` optional).
Open <http://127.0.0.1:4174>, choose the staff workspace, and log in as the synthetic
author. Edit the existing question text/options, private key and explanation;
create a DRAFT and refresh. Reload and restart preserve records in ignored
`.local/track-b`; Ctrl+C gracefully stops this app's database, retaining its data.
Reviewer/Bank Manager profiles can see metadata only. The candidate profile is
denied draft access. Logout invalidates the local session. Mock-only `dev:b0`
reports that this workspace is unavailable.

Source rights remain UNKNOWN, and there are no approval or publication controls.
The private template is delivered only after server-side AUTHOR authorization;
it is absent from public assets. This mode adds real PostgreSQL identity/session
and Bank draft persistence, while the practice exam still uses mock services.
Synthetic roles do not establish production authentication or human review.

`npm run test:local` verifies real PostgreSQL/HTTP boundaries and restart
persistence; `npm run test:track-b:browser` exercises login, lost-response retry,
one persisted draft, candidate denial and the mock-only unavailable state.
Desktop/mobile screenshots are written to `/tmp/tsa-track-b-browser-evidence`.
