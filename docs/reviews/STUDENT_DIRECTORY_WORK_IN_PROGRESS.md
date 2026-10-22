# Historical usage-stop handoff — superseded

The resumed slice is now implemented, verified and independently reviewed.
See [final directory evidence](EXAM_STUDENT_DIRECTORY_VERIFICATION.md) and
[latest handoff](../agents/LAST_HANDOFF.md). The earlier stop below is historical;
its NOT VERIFIED statements describe that checkpoint only.

---

# Student catalog/history — unfinished handoff

2026-10-22, branch `feat/track-b-data-auth`, HEAD `71613e1`. The sustained owner
goal reached its actual service usage limit (`get_goal`: usageLimited). Native
Luna/XHigh implementation and separate Sol6.1/Medium review both terminated with
usage-limit errors. No review of this slice occurred; no passing result is inferred
from either agent. Root Sol preserves the partial implementation without committing
or accepting it. Earlier checkpoint reviews remain valid for their own scopes.

## Present worktree

- New SQL017: restricted catalog and owned-history command functions; catalog
  returns internal entry/config wrappers, history reconciles the owned page under
  the shared Bank guard and returns compact scores only for current exact releases.
- New `src/modules/attempts/directory.mjs`: Luna's unfinished directory service,
  strict frozen schemas, tagged opaque keyset cursors, full blueprint validation,
  safe projection and sanitized query failures.
- `src/http/attempts.mjs`: partial frozen GET catalog/history wiring.
- New `tests/integration/directory/directory.test.mjs`: four tests written by Luna;
  execution is NOT VERIFIED. First three appear adapter/unit cases, fourth uses
  disposable PostgreSQL/HTTP. Inspect before relying on this classification.
- New `tests/integration/directory/races.test.mjs`: five root PostgreSQL cases.
- Three Bank upgrade expectation lists append SQL017. No application schema,
  dependency, frozen G1 contract, UI or publication permission was changed.

Actual root command `node --test tests/integration/directory/races.test.mjs`
PASS5/5, zero failures/skips: lazy TTL cancellation, reconciliation fault rollback
and exact expiry job, owner-filtered pagination with full microsecond precision,
and both rights/history lock winner orders. Transcript
`/tmp/tsa-directory-races.log`. This does not prove the unfinished service/HTTP
adapter, full regressions or independent review. No directory test script is yet
registered. No final engineering completion claim or checkpoint commit exists.

## Resume exactly here

Recommended implementer: Codex Sol6.1/High (available direct fallback) or native
Luna/XHigh after verified quota recovery for isolated adapter/tests. Recommended
independent reviewer: separate Sol6.1/Medium after quota recovery; recommendation
is not evidence of review. Root integrates shared records/migration expectations.
Owner authorized sustained implementation; no new permission is needed within
this scope. Preserve owner AGENTS/UI/research and the existing unstaged shared
records. Do not restart or overwrite the partial implementation blindly.

1. Inspect current Git state and these files; run the new directory tests with
   the pinned Node24.18/npm11.16 and real disposable PostgreSQL18.6.
2. Repair concrete failures; scrutinize full-schema catalog projection, malformed/
   duplicate/cross-kind cursors, exact microseconds, owner history and score release
   privacy, current rights and overlapping-page lock order.
3. Register a focused directory test command; run relevant full regressions,
   migration upgrades, contract/consumer/build/typecheck/drift/import checks.
4. Obtain actual separate engineering review and fix findings. Only then make a
   narrow local checkpoint. Never claim self-review is independent.
5. Connect the existing student client without UI redesign after catalog/history
   verification. Prototype UI still uses mock APIs. No synthetic production stock,
   real human-review evidence, production worker/OIDC or Track A completion claim.

Verified local checkpoints this session: `86edda7` leased scoring/release,
`f551f8d` owner released results, `bc3ed0a` local API/worker composition, `71613e1`
trusted expiry recovery. The latter independently passed recovery16/student5 and
all relevant PG/contract regressions (see its dedicated evidence). G1 accepted;
G2/G3 owner accepted; per-question lawful rights and qualified human review remain
separate. No push/merge/deployment/Astra/paid model API/publication.
