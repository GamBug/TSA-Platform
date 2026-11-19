// Faster test creation for the public demo, applied only to the disposable demo copy of the Bank.
//
// Creating a 40/20/40 test re-checks the whole published pool inside the database. On the real pool that took
// about 14 s on a laptop and about 30 s on the shared VPS, and simultaneous starts timed out. Two changes keep
// the results identical and cut it to about 1.5 s:
//   1. The enemy-pair check of the bundle validation is planned with nested loops over intermediate results the
//      planner believes hold one row (they hold hundreds), comparing about 11 million row pairs. Switching nested
//      loops off for the three assembly functions makes the planner use hash joins. Planner choice only.
//   2. tsa.bank_question_sources(version) is called tens of thousands of times per creation. Its inputs are
//      immutable rows (dependencies, provenance, stimulus and asset sources of a version and its ancestors), so the
//      answers are computed once for every version present at start. A version unknown to the cache falls back to
//      the original function, which stays available as bank_question_sources_uncached.
// Public mode has no staff or import routes, so no version or source row can change while the copy is running.
// The retained Bank and the migrations are never touched.
import { withTransaction } from '../modules/database/pool.mjs';

const NESTLOOP_OFF = Object.freeze([
  'tsa.assembly_standalone_stock(uuid)',
  'tsa.assembly_commit_simulation(text,text,jsonb)',
  'tsa.assembly_commit_personal(text,text,jsonb)',
]);

const SOURCE_CACHE_SQL = `
DO $speedup$
DECLARE acl aclitem[]; owner_name name; grantee_role record;
BEGIN
  IF to_regclass('tsa_private.demo_question_sources') IS NOT NULL THEN RETURN; END IF;
  SELECT proacl, pg_get_userbyid(proowner) INTO acl, owner_name FROM pg_proc WHERE oid='tsa.bank_question_sources(uuid)'::regprocedure;
  ALTER FUNCTION tsa.bank_question_sources(uuid) RENAME TO bank_question_sources_uncached;
  CREATE TABLE tsa_private.demo_question_sources(
    question_version_id uuid NOT NULL, source_version_id uuid NOT NULL, PRIMARY KEY(question_version_id, source_version_id));
  CREATE TABLE tsa_private.demo_question_sources_done(question_version_id uuid PRIMARY KEY);
  INSERT INTO tsa_private.demo_question_sources_done SELECT id FROM tsa.question_versions;
  INSERT INTO tsa_private.demo_question_sources
    SELECT q.id, s.id FROM tsa.question_versions q CROSS JOIN LATERAL tsa.bank_question_sources_uncached(q.id) s;
  EXECUTE format('GRANT SELECT ON tsa_private.demo_question_sources, tsa_private.demo_question_sources_done TO %I', owner_name);
  CREATE FUNCTION tsa.bank_question_sources(version_id uuid) RETURNS TABLE(id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $body$
    SELECT c.source_version_id FROM tsa_private.demo_question_sources c WHERE c.question_version_id=version_id
    UNION ALL
    SELECT u.id FROM tsa.bank_question_sources_uncached(version_id) u
    WHERE NOT EXISTS(SELECT 1 FROM tsa_private.demo_question_sources_done d WHERE d.question_version_id=version_id)
  $body$;
  -- A SECURITY DEFINER function must run as the role that owned the original, with the same execute rights.
  EXECUTE format('ALTER FUNCTION tsa.bank_question_sources(uuid) OWNER TO %I', owner_name);
  IF acl IS NOT NULL THEN
    REVOKE ALL ON FUNCTION tsa.bank_question_sources(uuid) FROM PUBLIC;
    FOR grantee_role IN SELECT r.rolname FROM aclexplode(acl) a JOIN pg_roles r ON r.oid=a.grantee
      WHERE a.privilege_type='EXECUTE' AND r.rolname<>owner_name LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION tsa.bank_question_sources(uuid) TO %I', grantee_role.rolname);
    END LOOP;
  END IF;
END $speedup$`;

const SIGNATURE = 'tsa.bank_question_sources(uuid)';
const UNCACHED = 'tsa.bank_question_sources_uncached(uuid)';
const ACL_OF = (signature) => `(SELECT coalesce(array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee::text,a.privilege_type),'{}')
  FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid='${signature}'::regprocedure)`;

/**
 * Apply both changes. Run once, with the migration owner pool, on a freshly restored demo copy.
 * The same transaction proves the replacement: for every question version the cached function returns
 * exactly what the original returns, a version missing from the cache falls back to the original, and the
 * execute rights are unchanged. Any difference aborts the start.
 */
export async function applyPublicDemoSpeedups(ownerPool) {
  return withTransaction(ownerPool, async (client) => {
    for (const signature of NESTLOOP_OFF) await client.query(`ALTER FUNCTION ${signature} SET enable_nestloop = off`);
    await client.query(SOURCE_CACHE_SQL);
    const sameSources = (condition) => `SELECT count(*)::integer AS differing FROM tsa.question_versions q WHERE ${condition}
      AND (SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM ${SIGNATURE.replace('(uuid)', '(q.id)')})
        IS DISTINCT FROM (SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM ${UNCACHED.replace('(uuid)', '(q.id)')})`;
    const all = (await client.query(sameSources('true'))).rows[0].differing;
    if (all !== 0) throw new Error(`Cached question sources differ from the original for ${all} versions`);
    // Fallback: forget one version that has sources, compare, restore.
    const probe = (await client.query(`SELECT question_version_id AS id FROM tsa_private.demo_question_sources LIMIT 1`)).rows[0]?.id;
    if (probe) {
      const kept = (await client.query('SELECT source_version_id FROM tsa_private.demo_question_sources WHERE question_version_id=$1', [probe])).rows;
      await client.query('DELETE FROM tsa_private.demo_question_sources_done WHERE question_version_id=$1', [probe]);
      await client.query('DELETE FROM tsa_private.demo_question_sources WHERE question_version_id=$1', [probe]);
      const fallback = (await client.query(`SELECT count(*)::integer AS n FROM tsa.question_versions q WHERE q.id=$1
        AND (SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM tsa.bank_question_sources(q.id))
          IS DISTINCT FROM (SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM tsa.bank_question_sources_uncached(q.id))`, [probe])).rows[0].n;
      if (fallback !== 0) throw new Error('A question version missing from the source cache does not fall back to the original');
      await client.query('INSERT INTO tsa_private.demo_question_sources_done VALUES($1)', [probe]);
      for (const row of kept) await client.query('INSERT INTO tsa_private.demo_question_sources VALUES($1,$2)', [probe, row.source_version_id]);
    }
    const rights = (await client.query(`SELECT ${ACL_OF(SIGNATURE)} AS cached, ${ACL_OF(UNCACHED)} AS original`)).rows[0];
    if (JSON.stringify(rights.cached) !== JSON.stringify(rights.original)) {
      throw new Error(`The cached source function has different execute rights than the original: ${JSON.stringify(rights)}`);
    }
    const counts = (await client.query(`SELECT (SELECT count(*)::integer FROM tsa_private.demo_question_sources_done) AS versions,
      (SELECT count(*)::integer FROM tsa_private.demo_question_sources) AS rows`)).rows[0];
    return { sourceCache: { versions: counts.versions, rows: counts.rows }, nestedLoopsOffFor: [...NESTLOOP_OFF] };
  });
}
