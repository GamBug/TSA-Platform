# Numeric-response practice

This optional local Track B capability adds decimal entry through the existing Bank, allocation, attempt, grading and released-review services. It is unofficial independent practice. It does not import `TSA_Example_Questions`, establish reuse rights, or implement a combined timed TSA examination.

## Run a disposable demonstration

Use the repository's Node24.18.0, npm11.16.0 and PostgreSQL18.6 environment; PostgreSQL binaries must be available as described in [local setup](TRACK_B_SUPERVISOR_DEMO.md).

```sh
npm ci --ignore-scripts
npm run build
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:numeric
```

The launcher creates and backs up its own temporary database, prepares four original synthetic questions, and prints a loopback URL ending in `?student=postgres-v2`. Open that exact URL, explicitly choose synthetic candidate A, start the listed practice, enter an answer, select Save, navigate or refresh, then submit through confirmation and open released review. Stop with Ctrl+C to close the application and remove its temporary database. These fixture approvals are engineering controls, not human content approval or production publication.

## Answer behavior

Responses retain the confirmed raw string. Exact canonical comparison accepts an optional ASCII sign, 1–40 integer digits and optionally a period or comma followed by 1–20 fractional digits. The entire raw string is limited to64 UTF-16 code units. Outer whitespace is accepted. A comma is a decimal separator: `1,000` means one, not one thousand. Thousands grouping, fractions, exponents, units and expressions are rejected. Grading never converts decimal values to floating-point numbers.

Save and Clear are explicit. Clear persists a tagged null response. Partial or invalid drafts remain visibly unsaved, typing bypasses global shortcuts, and navigation cannot silently discard them. Failed acknowledgements remain uncertain until an explicit retry or authoritative reload. Existing shortcut help, native focus and submit confirmation apply.

## Version boundaries

Question/1 and `/api/v1` remain closed to numeric questions. The additive path uses `question/2`, `blueprint/2`, `assembly-manifest/2`, `sealed-form/2` and `practice-binary-v2`, while retaining the existing `assembly/1` solver and lifecycle. All slots in a numeric-policy form use q2/policy2, including supported choice and true/false types. Historical v1 forms, hashes and receipts are preserved.

SQL029 adds the schema/policy guards, private immutable numeric profile pins, exact decimal validator, narrow catalog and version-aware lifecycle predicates. It backfills no historical questions or profile pins. Applications receive no raw access to the profile table. Bank delivery has distinct q2 text and inspected-image profiles; general image activation remains separate.

`/api/v2/catalog` lists only pinned numeric offerings. `/api/v2/attempts` supports the existing create, history, start, answer PUT, submit, owned read and released result paths with versioned schemas. V1 discovery and attempt reads/mutations exclude q2 forms. V2 history can resume compatible v1 forms. Numeric repeat/review allocation is unsupported and never advertised. Keys and explanations remain absent until authorized released review.

The safe contract subpath is `@tsa/contracts/student-v2`; private released review is separately exposed as `@tsa/contracts/released-review-v2`. V1 generated OpenAPI artifacts are unchanged; the additive route definitions live in `packages/contracts/src/routes-v2.ts`.

## Staff and retained local runtime

The feature remains off by default. A retained local runtime requires both flags:

```sh
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true LOCAL_STUDENT_ENABLED=true LOCAL_NUMERIC_PRACTICE_ENABLED=true npm run dev:track-b
```

Startup takes a private backup before migrations/bootstrap. Staff template capability enables the numeric editor, taxonomy selectors and canonical private key validation. Numeric creation/revision/review uses the additive v2 Bank routes and `staff-review-context/2`; ordinary v1 services retain their existing behavior. Creation stays DRAFT, source rights remain authoritative, and an UNKNOWN-rights template produces a blocked preview. This command does not install numeric offerings or authorize source qualification/publication. Use the disposable launcher for a ready engineering demonstration.

Reviewers and Bank managers discover numeric metadata through the enabled v2
route without reading the author template. Their existing role and workflow
restrictions still control private inspection; discovery does not grant access to
keys, explanations or publication.

## Verification

```sh
npm run test:numeric
npm run typecheck
npm run contracts:check
npm run contracts:consumer-check
npm run test:student:numeric
npm run test:student:numeric:firefox
TRACK_B_NUMERIC_TEST=true npm run test:track-b:browser
```

Browser scripts require the existing local Chromium/geckodriver setup. Chromium verifies375px and Firefox verifies actual500px narrow width, plus768px and desktop. See [executed evidence and review limits](../../plans/reports/implementation-261107-1354-versioned-numeric-practice.md). Input instructions and errors follow [W3C form-validation guidance](https://www.w3.org/WAI/tutorials/forms/validation/); HUST's [published question examples](https://www.hust.edu.vn/vi/tuyen-sinh/dai-hoc/bai-thi-danh-gia-tu-duy-2023-muc-do-danh-gia-tu-duy-dang-cau-hoi-va-cac-vi-du-mau-651869.html) establish short-answer relevance without making this exact decimal policy an official examination rule.
