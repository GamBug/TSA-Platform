# CP7 step 1: owner publication of corpus items

Status: DONE_WITH_CONCERNS — the tool works on a copy of the retained Bank; the owner has not yet run it on the real Bank. Uncommitted.
Date: 2026-11-11 (Asia/Bangkok). Authority: [owner attestation and CP7 authorization](../../docs/decisions/OPEN_DECISIONS.md#corpus-permission-attestation-and-owner-publication--2026-11-11).

## Why students saw no questions after CP6
1. The retained workspace had no approval path: the database refuses runtime publication outside disposable fixtures.
2. The 10 corpus Reading sources had no rights record, so every publication check failed on rights.
3. The 100 Reading items sit on 10 shared passages but no passage bundle existed, so they could not be delivered even if approved.
4. The 80 Math and 78 cloze/matching drafts were only ever loaded into disposable databases.

## What changed
- `npm run bank:owner-publish` (`scripts/owner-publish.mjs`, `src/local/owner-publication.mjs`): a dry run prints counts and an
  exact confirmation phrase; the confirmed run backs up and migrates through the normal workspace, records OWNER_ATTESTED display
  rights (LICENSED, DISPLAY, VN) through the existing manager route, submits drafts through the author route, then on the owner
  connection records singletons, builds one ordered bundle per passage (import order), and approves each item only after
  `assertPublicationChecks` and a final `bank_question_selection_allowed` check. Approvals use the local reviewer account, never the author.
- `publication-gates.mjs`: `assertPublicationChecks` split out of `assertPublicationGates`; runtime behavior unchanged.
- Run-of-show guide: owner publication section.

## Executed checks
- Dry run and confirmed run on a byte copy of `.local/track-b` (scratchpad): 10 rights, 10 bundles, 100 approved and published.
- `demo:uni` on that copy: Reading 100 published and deliverable; a student created a 10-question Reading topic practice with
  the shared passage and no keys or explanations in the response. Full simulation not offered (Math 40, Science 40 short).
- The real `.local/track-b` was not changed by this session.
- `npm run test:bank` — 182 pass. `npm run test:local` — 33 pass. `node --check` on both new files — pass.

## Concerns
- No repository test covers the owner tool; evidence is the copy run above. Section practice for Reading stays off (passages are 10 questions).
- Math retained import needs a new import script and inspected-image delivery; cloze/matching items are not delivered by the demo.
- Science has no items (CP5), so a real full simulation is not possible yet.

## Next owner action
`npm run bank:owner-publish` then `npm run bank:owner-publish -- --confirm "PUBLISH 100 ALL"`, then `npm run demo:uni` with `DEMO_UNI_SOURCE_CREDIT` set.
