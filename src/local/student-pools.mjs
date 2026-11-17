const CAPABILITIES = Object.freeze({
  identityPool: 'tsa_identity',
  examPool: 'tsa_exam',
  workerPool: 'tsa_exam_worker',
});

// These are operator-provisioned credentials. Runtime startup never grants roles
// or accepts a migration owner as a substitute for a missing restricted login.
const ATTEST_CONNECTION = `
  SELECT session_user AS session_name, current_user AS current_name,
    login.rolcanlogin AS can_login, login.rolinherit AS inherits,
    login.rolsuper OR login.rolcreatedb OR login.rolcreaterole
      OR login.rolreplication OR login.rolbypassrls AS elevated_login,
    capability.rolcanlogin OR capability.rolinherit OR capability.rolsuper
      OR capability.rolcreatedb OR capability.rolcreaterole
      OR capability.rolreplication OR capability.rolbypassrls AS unsafe_capability,
    pg_catalog.pg_has_role(session_user, capability.oid, 'USAGE') AS usable_capability,
    (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member = login.oid) AS memberships,
    EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
      WHERE m.member = login.oid AND m.roleid = capability.oid
        AND m.inherit_option AND m.set_option AND NOT m.admin_option) AS expected_membership,
    EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = capability.oid) AS capability_has_parent,
    database_row.datdba IN (login.oid, capability.oid) AS owns_database,
    EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
      WHERE n.nspowner IN (login.oid, capability.oid)
        AND n.nspname IN ('tsa', 'tsa_private', 'tsa_meta')) AS owns_schema,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relowner IN (login.oid, capability.oid)
        AND n.nspname IN ('tsa', 'tsa_private', 'tsa_meta')) AS owns_relation,
    pg_catalog.current_database() AS database_name, database_row.oid::text AS database_oid,
    pg_catalog.pg_postmaster_start_time()::text AS postmaster_started_at,
    COALESCE(pg_catalog.inet_server_addr()::text, 'unix') AS server_address,
    pg_catalog.current_setting('port') AS server_port
  FROM pg_catalog.pg_roles login
  JOIN pg_catalog.pg_roles capability ON capability.rolname = $1
  JOIN pg_catalog.pg_database database_row ON database_row.datname = pg_catalog.current_database()
  WHERE login.rolname = session_user
`;

/** Attest three distinct, least-privilege local runtime credentials on one database. */
export async function assertStudentRuntimePools(pools) {
  for (const name of Object.keys(CAPABILITIES)) {
    if (!pools?.[name] || typeof pools[name].connect !== 'function') {
      throw new TypeError(`${name} must be a database pool`);
    }
  }
  if (new Set(Object.keys(CAPABILITIES).map((name) => pools[name])).size !== 3) {
    throw new TypeError('Student runtime requires three separate database pools');
  }
  const sessions = new Set();
  let database;
  for (const [name, capability] of Object.entries(CAPABILITIES)) {
    const client = await pools[name].connect();
    let row;
    try {
      const result = await client.query(ATTEST_CONNECTION, [capability]);
      row = result.rows[0];
    } catch {
      throw new Error(`Cannot attest ${name} runtime credential`);
    } finally {
      client.release();
    }
    if (!row || !row.can_login || !row.inherits || row.elevated_login
        || row.unsafe_capability || !row.usable_capability
        || row.memberships !== '1' || !row.expected_membership
        || row.capability_has_parent || row.owns_database || row.owns_schema || row.owns_relation
        || row.session_name !== row.current_name || sessions.has(row.session_name)) {
      throw new Error(`${name} requires a dedicated non-owner LOGIN member of ${capability}`);
    }
    sessions.add(row.session_name);
    const currentDatabase = JSON.stringify([
      row.database_name, row.database_oid, row.postmaster_started_at,
      row.server_address, row.server_port,
    ]);
    if (database !== undefined && database !== currentDatabase) {
      throw new Error('Student runtime pools must connect to the same PostgreSQL database');
    }
    database = currentDatabase;
  }
  return true;
}
