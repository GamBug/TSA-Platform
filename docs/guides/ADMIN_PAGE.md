# Admin page (local demo only)

The local demo (`npm start` or `npm run demo:uni`) has one account that signs in: **`AdminBao`**, with the password the
owner chose on 2026-11-22. Students need no account: the start screen gives every browser its own guest with
**Bắt đầu luyện tập**, as on the public site. The synthetic Student A/B buttons and the old staff workspace are no longer
shown; the bare address `http://127.0.0.1:4180/` opens the student app. Decision:
[OPEN_DECISIONS 2026-11-22](../decisions/OPEN_DECISIONS.md#admin-account-and-local-admin-page--2026-11-22).

Open `http://127.0.0.1:4180/student/?page=admin` (the terminal prints it; the student start screen links to it as
**Quản trị (Admin)**).

The admin page exists only on this computer. The public demo (`DEMO_PUBLIC=true`) answers 404 for every admin path, so
the answer keys never leave the machine.

## What the admin can do

| Tab | What it does |
|---|---|
| **All questions** | Every question version in the Bank, in every state (DRAFT, IN_REVIEW, APPROVED, superseded, QUARANTINED, RETIRED), with passage, images, options, the answer key marked, and the explanation. Filter by section, state and type; search text, exchange id or taxonomy. On the real Bank, **Change status or section** changes the open question (below). |
| **Import & publish** | 1. Add ChatGPT answer files (`.json`, `.txt`, `.md`) by upload or paste; they are saved to `question-inbox/<subject>/`. Add figure PNGs with **Upload figures**, or with **add image** next to each figure a waiting or rejected answer needs; **Back to the inbox** returns a rejected answer for the next check. 2. **Check the inbox** (writes nothing), then **Import** with the phrase the check printed: good files become DRAFTs in the practice pool, rejected files move aside with a message to paste back into ChatGPT. 3. **Check what would be published**, then **Publish** with the printed phrase: approves and publishes the practice pool's eligible drafts. |
| **AI questions** | With `OPENAI_API_KEY` set: one CREATE batch of up to 10 original questions per run, written by OpenAI with the same instructions as the ChatGPT Projects, saved into the inbox for the normal check, import and publication. Without a key: the steps for a free ChatGPT Project in the browser ([guide](chatgpt-projects/README.md)). |

Figure uploads accept PNG, JPEG and WebP files up to 2 MiB each.

### Changing one question

**Change status or section** works on the latest version of the open question, as a check first (writes nothing) and
then **Confirm** with the printed phrase. Each confirmed change backs up the Bank and runs
`npm run bank:question` ([`scripts/question-change.mjs`](../../scripts/question-change.mjs)), the same owner workflow
as publication:

| Action | From | Result |
|---|---|---|
| **Publish** | DRAFT, IN_REVIEW | Approved and served, with the same rights, checks and approval as **Publish** (a question with a shared passage is published with its passage, on the Import & publish tab). |
| **Withhold** (with a reason) | DRAFT, IN_REVIEW, APPROVED | QUARANTINED: no longer served; tests already built with it are held. |
| **Restore** | QUARANTINED | Submitted, confirmed and approved again by the owner. |
| **Move** to another section | DRAFT, IN_REVIEW, APPROVED | A new version in that section; the old version stays as history. A published question is replaced at once; a draft stays a draft for **Publish**. |

Question versions are immutable, so nothing is edited in place. A move takes the new section's domain and skill in the
question's own taxonomy version when it has that section; a question of a single-subject corpus taxonomy goes to the
real-content taxonomy version that already serves the most questions in that section (the check names it). Practice-pool
questions stay in the pool and real content stays out of it. A question with a shared passage cannot be moved on its
own. **No duplicates:** a move is refused when an identical question is already in the target section; withhold this
one instead.
A move preview runs the workflow and approval checks in a transaction that is rolled back. A published question with
a confirmed equivalent fails the singleton check. A confirmed move commits the new version only if every required
check succeeds.

Import and publication run the same owner commands as the terminal (`npm run questions:inbox` and
`npm run bank:owner-publish -- --taxonomy-version <practice pool>`), one at a time, on the owner's retained Bank
(`.local/track-b`). Each command backs up the Bank before it writes. Nothing is approved without the admin pressing
**Publish** with the confirmation phrase, and AI-written questions are never published automatically.

The running demo serves the copy it made at start, so students see newly published questions **after the demo
restarts** (or after `bash infra/server/upload-bank.sh` and a server restart, for the public site). The **All
questions** tab re-reads the retained Bank after each import or publication, so the admin sees new drafts at once.

In rehearsal mode (`npm run demo:uni:rehearsal`) the admin can browse the synthetic Bank, but imports, publication and
AI questions are disabled: there is no real Bank to write.

## Settings

| Variable | Effect |
|---|---|
| `DEMO_ADMIN_PASSWORD` | Replaces the admin password for this run (the automated checks use it). |
| `OPENAI_API_KEY` | Turns on **AI questions**. Paid by the owner's OpenAI account; the key is never sent to the student pages or to the import commands. |
| `OPENAI_MODEL` | The OpenAI model; default `gpt-5-mini` (REQUIRES_VERIFICATION: it must exist for the owner's account). |

```bash
OPENAI_API_KEY=sk-... OPENAI_MODEL=<model> npm start
```

## Security

- The password is stored as a scrypt hash in `src/local/admin/admin-auth.mjs`; sessions are in memory, last 8 hours and
  end when the demo stops. Five wrong passwords lock sign-in for 15 minutes.
- The session cookie is `HttpOnly`, `SameSite=Strict` and limited to `/local/admin/`. Every change also needs the
  page's CSRF token and the loopback `Origin`.
- The question list carries no keys. A question's key and explanation are sent only when the admin opens it.
- The Bank snapshot is read with the database owner connection at start, before requests are served, or from the
  retained Bank after an admin job. Request handlers hold no connection that can read keys.

## Checks

```bash
npm run test:admin                      # account, jobs, AI generation (fake OpenAI), rehearsal demo end to end
npm run test:question-change            # publish, withhold, restore and move single questions on a disposable Bank
npm run test:question-inbox             # inbox import, including figure files registered and attached
npm run test:demo:uni:browser           # Chromium: guest start, practice, full test, admin sign-in and question view
```
