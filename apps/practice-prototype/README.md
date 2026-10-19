# Local practice prototype

This dependency-free browser prototype demonstrates a short practice flow with local mock data. It is unofficial and does not provide TSA scoring, approved learning content, accounts, durable storage, question selection, or a production backend.

## Run locally

From the repository root, start the loopback-only server:

```sh
node apps/practice-prototype/server.mjs
```

Open <http://127.0.0.1:4173>. To use a different local port, set `PORT` when starting the server. The mock session and answers live only in server memory and are cleared when the process stops.

Choose **Chọn bài luyện tập**, then start the Toán học demo. The timer is six minutes. The four positions repeat the same test question and are labeled as repeated data; they are not four distinct questions or an approved exam. Select options, move between positions, then choose **Nộp bài** and confirm. The demonstration result shows the raw correct count and percentage, marked unofficial. Returning to the catalog lets you start another explicit demo. Đọc hiểu and Khoa học are visible but unavailable.

The sole question is the existing synthetic fixture from [`packages/contracts/test/question.test.ts`](../../packages/contracts/test/question.test.ts): “What is x if x + 2 = 5?” with its original options. Its answer key and explanation stay in the server-side fixture and are never returned to the browser. The mock service scores only after submission or timer expiry.

## Tests

Run the focused Node tests with:

```sh
node --test apps/practice-prototype/test/*.test.mjs
```

They cover mock-session and answer handling, timer and closure behavior, repeated-start behavior, strict request validation, private-field exclusion, and the explicit public-file allowlist.

## Limits

The server binds to `127.0.0.1` and has no external requests. Its random session cookie is only an in-memory demo handle, not authentication. It does not use a database, persist progress, select fresh questions, verify content permissions, or provide real exam services. Client code and browser assets are public; the prototype demonstrates server-side separation of the answer key, but it is not a deployment or browser-bundle security assessment.
