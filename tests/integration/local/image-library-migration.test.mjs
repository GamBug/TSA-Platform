import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';

const MIGRATION = '032_image_library.sql';

async function copyMigrations(source, target, maximum) {
  await mkdir(target);
  for (const name of await readdir(source)) {
    if (/^\d+_[a-z0-9_]+\.sql$/.test(name) && Number(name.slice(0, name.indexOf('_'))) <= maximum) await copyFile(path.join(source, name), path.join(target, name));
  }
}

async function tableDigests(pool) {
  const tables = (await pool.query(`SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema IN ('tsa','tsa_private') AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'image_asset%' ORDER BY 1, 2`)).rows;
  const digests = {};
  for (const { table_schema: schema, table_name: table } of tables) {
    const rows = await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text), '[]'::jsonb) AS rows FROM (SELECT to_jsonb(t) AS value FROM "${schema}"."${table}" t) snapshot`);
    digests[`${schema}.${table}`] = jsonDigest(rows.rows[0].rows);
  }
  return digests;
}

test('the image library migration registers existing assets without changing any existing row', { timeout: 120_000 }, async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'tsa-image-library-migration-'));
  let fixture;
  t.after(async () => { try { await fixture?.close(); } finally { await rm(scratch, { recursive: true, force: true }); } });
  const sourceMigrations = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
  const baseline = path.join(scratch, 'baseline-031');
  const target = path.join(scratch, 'target-032');
  await copyMigrations(sourceMigrations, baseline, 31);
  await copyMigrations(sourceMigrations, target, 32);
  fixture = await createAllocationFixture({ questionCount: 2, migrationDirectory: baseline });
  const { pool } = fixture;
  assert.equal((await pool.query(`SELECT to_regclass('tsa.image_assets') AS name`)).rows[0].name, null, 'the baseline has no library');

  // Legacy assets: one file in both purposes, one exact copy for the same purpose, and one unrelated file.
  const hash = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
  const insert = async (name, contentHash, purpose, alt) => {
    const id = randomUUID();
    await pool.query(`INSERT INTO tsa.asset_versions (id, source_version_id, object_key, content_hash, mime, byte_size, alt_metadata, security_class)
      VALUES ($1, $2, $3, $4, 'image/png', 100, $5::jsonb, $6)`, [id, fixture.source.sourceVersionId, `legacy:${name}`, contentHash, JSON.stringify(alt ? { alt } : {}), purpose]);
    return id;
  };
  const shared = hash('shared file');
  const questionA = await insert('a', shared, 'QUESTION', 'Hình A');
  const explanationA = await insert('b', shared, 'EXPLANATION', null);
  const copyOfA = await insert('c', shared, 'QUESTION', null);
  const unrelated = await insert('d', hash('another file'), 'QUESTION', null);
  const before = await tableDigests(pool);

  const applied = await migrate(pool, { directory: target });
  assert.deepEqual(applied.applied, [MIGRATION]);
  assert.deepEqual(await tableDigests(pool), before, 'no existing table row changed');

  const assets = (await pool.query('SELECT asset_code, content_hash, alt_text, status FROM tsa.image_assets ORDER BY asset_code')).rows;
  assert.deepEqual(assets.map((asset) => asset.asset_code), ['IMG-LEG-000001', 'IMG-LEG-000002']);
  assert.equal(assets[0].content_hash, shared);
  assert.equal(assets[0].alt_text, 'Hình A');
  assert.ok(assets.every((asset) => asset.status === 'ACTIVE'));
  const links = (await pool.query('SELECT asset_version_id, asset_code, purpose::text AS purpose FROM tsa.image_asset_versions ORDER BY asset_code, purpose')).rows;
  assert.deepEqual(links.map((link) => [link.asset_version_id, link.asset_code, link.purpose]).sort(),
    [[questionA, 'IMG-LEG-000001', 'QUESTION'], [explanationA, 'IMG-LEG-000001', 'EXPLANATION'], [unrelated, 'IMG-LEG-000002', 'QUESTION']].sort(),
    'the file becomes one asset with a question and an explanation version');
  assert.ok(!links.some((link) => link.asset_version_id === copyOfA), 'an exact copy for the same purpose stays valid but unlinked');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM tsa.asset_versions WHERE id = $1', [copyOfA])).rows[0].n, 1);

  // New registrations continue after the legacy numbers; replaying the migration is inert.
  assert.equal((await pool.query(`SELECT tsa.next_image_asset_code('LEG') AS code`)).rows[0].code, 'IMG-LEG-000003');
  assert.deepEqual((await migrate(pool, { directory: target })).applied, []);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM tsa.image_assets')).rows[0].n, 2);

  // The runtime Bank role may read the library but not write it.
  const privileges = (await pool.query(`SELECT has_table_privilege('tsa_bank','tsa.image_assets','SELECT') AS read,
      has_table_privilege('tsa_bank','tsa.image_assets','INSERT') AS write, has_table_privilege('tsa_exam','tsa.image_assets','SELECT') AS exam,
      has_table_privilege('tsa_web','tsa.image_assets','SELECT') AS web`)).rows[0];
  assert.deepEqual(privileges, { read: true, write: false, exam: false, web: false });
});
