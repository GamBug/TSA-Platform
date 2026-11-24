# Admin page

The local demo (`npm start` or `npm run demo:uni`) has one account that signs in: **`AdminBao`**, with the password the
owner chose on 2026-11-22. Students need no account: the start screen gives every browser its own guest with
**Bắt đầu luyện tập**, as on the public site. The synthetic Student A/B buttons and the old staff workspace are no longer
shown; the bare address `http://127.0.0.1:4180/` opens the student app. Decision:
[OPEN_DECISIONS 2026-11-22](../decisions/OPEN_DECISIONS.md#admin-account-and-local-admin-page--2026-11-22).

Open `http://127.0.0.1:4180/student/?page=admin` (the terminal prints it; the student start screen links to it as
**Quản trị (Admin)**).

On the public site the same page is **view only**: `https://tsa.smartnovi.tech/student/?page=admin` signs AdminBao in
(same password) and shows every question of the Bank the server serves, with keys and explanations, but has only the
**All questions** tab and no change box. Every route that imports, publishes, changes or generates answers 404 there.
Decision: [OPEN_DECISIONS 2026-11-24](../decisions/OPEN_DECISIONS.md#question-ids-identical-images-three-states-ai-writers-and-the-view-only-public-admin--2026-11-24).

## What the admin can do

| Tab | What it does |
|---|---|
| **All questions** | Every question version in the Bank in three states: **DRAFT** (including versions waiting for Publish), **APPROVED** (an older approved version is marked superseded) and **QUARANTINED** (withheld). Each question shows its **id**: the exchange id of an imported question (`MATH-S261122A-000031`), otherwise `Q-` and 8 hex digits (`Q-08EBF611`). Each image shows its library code (`IMG-GEO-000123`) under the picture and in the detail. Filter by section, state and type; search text, question id, image code or taxonomy. On the local real Bank, **Change status or section** changes the open question (below). |
| **Import & publish** | 1. Upload what ChatGPT gave you with **Upload ZIP or files**: the one ZIP it offers (answer plus figures), or the answer file (`.json`, `.txt`, `.md`) and figure images together; or paste an answer. Everything is saved to `question-inbox/<subject>/`, sorted by the subject written in the answer. A figure can also be added with **add image** next to each figure a waiting or rejected answer needs; **Back to the inbox** returns a rejected answer for the next check. 2. **Check the inbox** (writes nothing), then **Import** with the phrase the check printed: good files become DRAFTs in the practice pool, rejected files move aside with a message to paste back into ChatGPT. 3. **Check what would be published**, then **Publish** with the printed phrase: approves and publishes the practice pool's eligible drafts. |
| **AI questions** | One CREATE batch of up to 10 original questions per run, written with the same instructions as the ChatGPT Projects and saved into the inbox for the normal check, import and publication. **Writer**: Codex, Claude Code or Antigravity when the command (`codex`, `claude`, `agy`) is installed and signed in on this computer (your subscription, no API cost; a run takes about 20 s to 2 min), or OpenAI with `OPENAI_API_KEY`. With none of these: the steps for a ChatGPT Project in the browser ([guide](chatgpt-projects/README.md)). |

Figure uploads accept PNG, JPEG and WebP files up to 2 MiB each. A ZIP holds up to 100 files and 24 MiB; figures in it must be named like `MATH-S261122A-000031_NEW-IMG-001.png` (any folder), and other files are ignored and listed. A ZIP with a bad figure, or with answers of different subjects, is refused whole.

### Changing one question

**Change status or section** works on the latest version of the open question, as a check first (writes nothing) and
then **Confirm** with the printed phrase. Each confirmed change backs up the Bank and runs
`npm run bank:question` ([`scripts/question-change.mjs`](../../scripts/question-change.mjs)), the same owner workflow
as publication:

| Action | From | Result |
|---|---|---|
| **Publish** | DRAFT | Approved and served, with the same rights, checks and approval as **Publish** (a question with a shared passage is published with its passage, on the Import & publish tab). |
| **Withhold** (with a reason) | DRAFT, APPROVED | QUARANTINED: no longer served; tests already built with it are held. |
| **Back to draft** | QUARANTINED | DRAFT again, still not served. Check it, then press **Publish**: a withheld question never goes straight back to APPROVED. |
| **Move** to another section | DRAFT, APPROVED | A new version in that section; the old version stays as history. A published question is replaced at once; a draft stays a draft for **Publish**. |

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
| `OPENAI_API_KEY` | Adds OpenAI as an **AI questions** writer. Paid by the owner's OpenAI account; the key is never sent to the student pages or to the import commands. Codex, Claude Code and Antigravity need no setting: the page finds them on `PATH` (restart the demo after installing one). |
| `OPENAI_MODEL` | The OpenAI model; default `gpt-5-mini` (REQUIRES_VERIFICATION: it must exist for the owner's account). |

```bash
OPENAI_API_KEY=sk-... OPENAI_MODEL=<model> npm start
```

## Security

- The password is stored as a scrypt hash in `src/local/admin/admin-auth.mjs`; sessions are in memory, last 8 hours and
  end when the demo stops. Five wrong passwords from one address lock that address for 15 minutes; 50 from all
  addresses together lock every sign-in for 15 minutes.
- The session cookie is `HttpOnly`, `SameSite=Strict` and limited to `/local/admin/` (and `Secure` on the public
  site). Every change also needs the page's CSRF token and the loopback `Origin`.
- An AI writer runs as a separate process without a shell, in an empty temporary directory, with no tools (Claude Code)
  or a read-only sandbox (Codex); its reply is only saved as an inbox file.
- The question list carries no keys. A question's key and explanation are sent only when the admin opens it.
- The Bank snapshot is read with the database owner connection at start, before requests are served, or from the
  retained Bank after an admin job. Request handlers hold no connection that can read keys.

## Checks

```bash
npm run test:admin                      # account, jobs, ZIP upload, AI generation (fake OpenAI and agent CLIs), rehearsal demo
npm run test:question-change            # publish, withhold, back to draft, publish again and move on a disposable Bank
node --test tests/integration/local/uni-demo-public.test.mjs   # public mode, including the view-only admin
npm run test:question-inbox             # inbox import, including figure files registered and attached
npm run test:demo:uni:browser           # Chromium: guest start, practice, full test, admin sign-in and question view
```
