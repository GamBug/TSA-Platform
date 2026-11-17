# Approved-invariant PostgreSQL preflight

Run from the repository root with `npm run test:db:preflight` (or directly with
`node tests/integration/database/approved-invariants/run.mjs`). The probe needs
Node.js and PostgreSQL 18.6 command-line tools (`initdb`, `postgres`, `psql`,
and `pg_config`). Set `PG_BIN` to their directory if `pg_config` is unavailable.
It downloads nothing and uses no database driver.

The runner creates a mode-0700 temporary directory, initializes one disposable
cluster with local-only trust authentication and host rejection, disables TCP
listening, and connects only through its private Unix socket. It removes that
cluster in a `finally` cleanup. The SQL fixture uses its own `approved_invariants_probe`
schema and is not a product migration or proposed complete database schema.

Passing evidence covers the approved global H1 partial-unique rule, both
cross-mode insertion orders with a PostgreSQL lock-wait barrier, distinct-user
concurrency, terminal closure, transaction rollback, the immutable 600-second
or admission-capped deadline, and its strict exclusive comparison. The boundary
check evaluates the SQL predicate directly; this probe does not implement or
verify an application start transaction, authorization, rights checks, form
admission, migration/upgrade behavior, production database integration, or the
rest of DATA-001. A pass is partial prerequisite evidence only.
