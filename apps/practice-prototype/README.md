# Local practice prototype

This dependency-free browser prototype demonstrates a short practice flow with local mock data. It is unofficial and does not provide TSA scoring, approved learning content, accounts, durable storage, question selection, or a production backend.

## Run locally

From the repository root, start the loopback-only server:

```sh
node apps/practice-prototype/server.mjs
```

Open <http://127.0.0.1:4173>. To use a different local port, set `PORT` when starting the server. The mock session and answers live only in server memory and are cleared when the process stops.

Choose **Chọn bài luyện tập**, filter available demos, and open the Toán học
instructions or start directly. The timer is six minutes. Positions 1–3 repeat
the existing single-choice fixture; position4 is an original synthetic arithmetic
true/false group. All are test content, not approved TSA inventory. Select or
clear choices, bookmark a question, use the filtered question navigator, and
review answered/unfinished/bookmarked counts before confirming submission.

Reloading in the same browser resumes acknowledged answers and the original
deadline while the server process remains running. Partial true/false selections
are saved but the question remains unfinished until every statement is answered.
The group earns one point only when every statement is correct. Bookmarks live
in tab-scoped sessionStorage, independently of server answer saves; they clear
on completion/cancellation and degrade to memory if browser storage is unavailable.

Results show unofficial correct/incorrect/unfinished counts and elapsed time.
**Chi tiết đáp án** explicitly loads released inline answer details;
**Ôn tập đáp án** opens focused question review with previous/next, answer filters
and expandable explanations. The score response remains free of keys/explanations.
The catalog lets you explicitly start another demo; Đọc hiểu and Khoa học remain
unavailable. No automatic cross-domain transition or combined exam is implemented.

The catalog uses a grouped responsive grid with real availability counts; only
Toán học is enabled. **Xem chi tiết** opens the measured detail/introduction
layout with breadcrumbs, genuine demo structure and the existing start/resume
action. Three cards represent domains, not a replicated reference exam bank.

The measured exam workspace uses a compact persistent header/timer and footer,
an independently scrolling question column, and a bottom counter that opens the
question drawer. Press Escape to close the drawer. Submission requires explicit
confirmation. The result ticket shows raw demo counts and percentage; focused
review opens a warm explanation pane beside the question at desktop/tablet
widths and below it on mobile. The solution heading stays visible during scroll.
Be Vietnam Pro is bundled locally under OFL1.1; no runtime font service is used.
See [direct-observation evidence](../../docs/reviews/WEB_B0_3_VERIFICATION.md) for
measurements, verification and capture limitations.

The single-choice fixture is from
[`packages/contracts/test/question.test.ts`](../../packages/contracts/test/question.test.ts).
The arithmetic true/false fixture is original synthetic test material in the
server-only `src/private-question-fixture.mjs`. No reference-site question content,
assets, branding or code was reused. The owned GRADED review route alone exposes
keys and explanations; active/foreign sessions cannot read them. The mock service
scores only after submission or expiry.

## Tests

Run the focused Node tests with:

```sh
node --test apps/practice-prototype/test/*.test.mjs
```

They cover mock-session and answer handling, partial/complete/cleared true/false
answers, exact-match group scoring, timer/closure, resume, review authorization,
strict per-slot validation, private-field exclusion and static public boundaries.

Run `npm run test:b0:browser` for the installed-Chromium journey (no download).
It exercises save delays/offline retry, bookmarks, filters, original deadline
resume, submission and released inline/focused review at1440/768/390 widths.
Screenshots/report are written to `/tmp/tsa-b0-browser-evidence` by default;
`B0_BROWSER` selects an installed browser and `B0_ARTIFACT_DIR` selects output.
See [latest executed evidence](../../docs/reviews/WEB_B0_3_VERIFICATION.md) for observed
results and limitations.

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

A fresh preview for this checkout is running at <http://localhost:4176>. Existing
4173/4175 servers were preserved. To launch after stopping that preview, run
`PORT=4176 npm run dev:b0`; use localhost for a separate preview browser session.
