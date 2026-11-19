# Legacy launchers

These commands predate the single entry point. Use `npm start` (see the
[README](../../README.md#run-the-website-locally)) to see the current website. The commands below are
kept because browser suites, fixtures and walkthroughs still use them. Each starts the same HTTP server
(`apps/practice-prototype/server.mjs`) with a different dataset, port or mode, which is why they show
different interfaces.

| Command | Port | What it shows |
|---------|------|---------------|
| `npm run dev:b0` | 4173 | Retired in-memory mock UI (B0), no database |
| `npm run dev:track-b` | 4174 | Retained staff workspace and the older student screens |
| `npm run demo:student` and `demo:student:*` | printed | Disposable synthetic fixture for one feature (reading, domains, fixed, short, numeric, cloze-matching, simulation) |
| `npm run demo:staff:review` | printed | Disposable staff review/evidence fixture |
| `npm run demo:factory:reading` | printed | Reading Question Factory experiment |

The sections below were moved unchanged from the README.


## Demonstrate the PostgreSQL-backed student website (fixtures)

For the presentation sequence, use the [one-page supervisor walkthrough](TRACK_B_SUPERVISOR_RUN_OF_SHOW.md).
Follow the [supervisor demo guide](TRACK_B_SUPERVISOR_DEMO.md) for a
complete three-domain walkthrough, pinned prerequisites, startup and teardown.
Topic selection and the keyboard shortcut guide are documented in the
[Track B topic practice guide](TRACK_B_TOPIC_PRACTICE.md).
From an installed checkout:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains
```

This runs actual persistent attempt/save/grading services with isolated synthetic
content and development authentication. Ctrl+C deletes this temporary database.
It does not provide approved real content or production authentication.

For one 100-question simulation with separate 60/30/60-minute section clocks, run
`NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:simulation`.
Open `http://127.0.0.1:3234/?student=postgres-v3`; see the
[full simulation walkthrough](TRACK_B_SUPERVISOR_DEMO.md#full-100-question-simulation).

## Retained staff workspace and student website

For the retained local staff workspace and persistent student website, run
`NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true LOCAL_STUDENT_ENABLED=true npm run dev:track-b`.
Open the printed student URL. A fresh workspace has an empty catalog; it does not
promote synthetic drafts. For a disposable engineering-only exam journey, use the
[student run guide](../../apps/practice-prototype/README.md#disposable-postgresql-student-demonstration).

## Local interactive website prototype (B0)

The owner-authorized B0 is a Vietnamese interface with isolated mock services,
independent of the remaining integrated website prerequisites.
With pinned Node.js 24.18.0/npm 11.16.0, run from this repository root:

```bash
npm run dev:b0
```

Open **http://127.0.0.1:4173**. No dependency install or build is needed for B0.
Use `PORT=4174 npm run dev:b0` if the default port is busy. Run its checks with:

```bash
npm run test:b0
npm run test:b0:browser
```

The browser check requires an already installed Chromium (`B0_BROWSER` can select
its executable); it starts/stops its own temporary server/browser and writes
screenshots/report under `/tmp/tsa-b0-browser-evidence` by default. It is separate
from the shared-contract tests below. No browser/dependency download occurs.

Demo: open catalog, start the MATH fixture, choose/clear an answer and navigate.
Reload to resume the same in-memory attempt/deadline, cancel submission once, then
confirm, view the separate post-grade explanation, and return to score/catalog.
The first three slots repeat an existing synthetic single-choice fixture; the
fourth is an original synthetic true/false group. All are visibly labeled;
this is not approved seed stock or a NEW_ONLY allocation. Session memory, timer,
saves and results are demonstrations, not durable/authenticated product features.
Reading/science cards remain unavailable. Do not enter personal information.
See the [prototype walkthrough and limitations](../../apps/practice-prototype/README.md).

## PostgreSQL-backed local staff workspace

B1 now provides explicit, server-authorized version inspection with current rights
metadata and rights-gated private preview. Retained UNKNOWN sources stay blocked.
Approved B2 adds an explicit read of current recorded evidence to synthetic Bank
Managers and independent queued Reviewers; authors/students are denied. For an
isolated original synthetic preview/evidence view in a fresh disposable database:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STAFF_REVIEW_FIXTURE_DEMO=true npm run demo:staff:review
```

Approved B3 adds explicit owned-DRAFT handoff, confirmation and same-request retry,
then independent reviewer queue access. B4 adds explicit simulated rejection and
manager quarantine with truthful recovery; it does not approve or publish content.
Use the [staff walkthrough](TRACK_B_SUPERVISOR_DEMO.md#optional-staff-demonstration).
Inspection grants no qualified review, rights attestation or publication capability.


Use the same frontend with real local identity and Bank draft APIs. Requires the
pinned Node/npm toolchain, installed PostgreSQL18.6 binaries, and `npm ci`.
`PG_BIN` can select the PostgreSQL bin directory. From the repository root:

```bash
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b
```

Open **http://127.0.0.1:4174** and choose the staff workspace. Select the synthetic
author, edit the private fixture template, create a DRAFT, then reload the list.
Drafts and sessions persist across graceful restart in ignored `.local/track-b`.
Ctrl+C stops the owned server/database and retains data. The database uses a
private Unix socket, without a TCP listener; no system database is modified.
Production/unknown runtime modes refuse startup. Do not enter personal data.

This is synthetic-only development authentication, not production login. Source
rights remain UNKNOWN; creating a draft does not approve or publish it. The
student exam journey uses the separately enabled PostgreSQL services and isolated
synthetic fixtures described below; it is distinct from the in-memory B0 mock.
Focused staff-workspace checks:

```bash
npm run test:local
npm run test:track-b:browser
```

The browser check needs existing Chromium (`TRACK_B_BROWSER` selects its path),
uses temporary data, and writes screenshots to `/tmp/tsa-track-b-browser-evidence`.
See the [walkthrough](../../apps/practice-prototype/README.md).

## PostgreSQL student engineering demo

The explicitly enabled disposable student command demonstrates real allocation,
acknowledged answers, queued grading and released review using isolated original
synthetic inventory. From the repository root:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student
```

Open the printed loopback URL and choose a synthetic candidate. Ctrl+C discards
this fixture database. This does not provision lawful production stock or satisfy
qualified human review. See the [student run guide](../../apps/practice-prototype/README.md#disposable-postgresql-student-demonstration)
for installation, test commands and scope. Default `dev:b0` remains in-memory mock.

For the isolated shared-passage READING2 journey, use the same opt-in flags with
`npm run demo:student:reading`. This creates one original disposable passage bundle,
not retained approved inventory. `npm run test:student:reading` verifies its actual
PostgreSQL/Chromium journey. See the student run guide above for scope.
