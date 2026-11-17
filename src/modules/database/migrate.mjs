import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIGRATION_NAME = /^(\d{3,}_[a-z0-9_]+)\.sql$/;
const LOCK_KEYS = [1_414_672_977, 1];
const DEFAULT_DIRECTORY = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function loadMigrations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length === 0) throw new Error('Migration directory is empty');
  const migrations = [];
  const numericPrefixes = new Set();
  for (const entry of entries) {
    const match = MIGRATION_NAME.exec(entry.name);
    if (!entry.isFile() || !match) {
      throw new Error(`Migration directory contains a non-numbered SQL file: ${entry.name}`);
    }
    const prefix = BigInt(match[1].slice(0, match[1].indexOf('_')));
    if (numericPrefixes.has(prefix.toString())) throw new Error(`Duplicate migration number: ${prefix}`);
    numericPrefixes.add(prefix.toString());
    const bytes = await readFile(path.join(directory, entry.name));
    if (bytes.length === 0) throw new Error(`Migration is empty: ${entry.name}`);
    migrations.push({ version: entry.name, order: prefix, checksum: digest(bytes), sql: bytes.toString('utf8') });
  }
  migrations.sort((left, right) => left.order < right.order ? -1 : left.order > right.order ? 1 : 0);
  return migrations;
}

async function ensureLedger(client) {
  await client.query('BEGIN');
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS tsa_meta');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tsa_meta.schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    await client.query('REVOKE ALL ON SCHEMA tsa_meta FROM PUBLIC');
    await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA tsa_meta FROM PUBLIC');
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {
      // The caller must discard a client whose transaction state is unknown.
      error.destroyClient = true;
    }
    throw error;
  }
}

/**
 * Apply numbered SQL migrations under one session advisory lock. Each migration
 * and its ledger row share a transaction; migration SQL is never auto-rolled back
 * by editing or deleting an applied migration.
 */
export async function migrate(pool, { directory = DEFAULT_DIRECTORY } = {}) {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  let locked = false;
  let destroyClient = false;
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', LOCK_KEYS);
    locked = true;
    await ensureLedger(client);

    const appliedRows = await client.query('SELECT version, checksum FROM tsa_meta.schema_migrations ORDER BY version');
    const applied = new Map(appliedRows.rows.map((row) => [row.version, row.checksum]));
    const available = new Map(migrations.map((migration) => [migration.version, migration]));

    for (const [version, checksum] of applied) {
      const migration = available.get(version);
      if (!migration) throw new Error(`Applied migration is missing from disk: ${version}`);
      if (migration.checksum !== checksum) throw new Error(`Applied migration checksum drift: ${version}`);
    }

    const newlyApplied = [];
    const alreadyApplied = [];
    const appliedOrders = [...applied.keys()].map((version) => BigInt(version.slice(0, version.indexOf('_'))));
    const greatestAppliedOrder = appliedOrders.length ? appliedOrders.reduce((max, value) => value > max ? value : max) : -1n;
    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        alreadyApplied.push(migration.version);
        continue;
      }
      if (migration.order < greatestAppliedOrder) {
        throw new Error(`Cannot apply older migration after a newer migration: ${migration.version}`);
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO tsa_meta.schema_migrations (version, checksum) VALUES ($1, $2)',
          [migration.version, migration.checksum],
        );
        await client.query('COMMIT');
        newlyApplied.push(migration.version);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {
          destroyClient = true;
        }
        throw error;
      }
    }
    return { applied: newlyApplied, alreadyApplied };
  } catch (error) {
    if (error?.destroyClient === true) destroyClient = true;
    throw error;
  } finally {
    if (locked) {
      try {
        const result = await client.query('SELECT pg_advisory_unlock($1, $2) AS unlocked', LOCK_KEYS);
        if (result.rows[0]?.unlocked !== true) destroyClient = true;
      } catch {
        destroyClient = true;
      }
    }
    if (destroyClient) client.release(true);
    else client.release();
  }
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(path.resolve(entrypoint)).href === import.meta.url;
}

if (isDirectExecution()) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL is required for the owner-run migration CLI.\n');
    process.exitCode = 2;
  } else {
    const { createDatabasePool } = await import('./pool.mjs');
    const pool = createDatabasePool(databaseUrl, { applicationName: 'tsa-owner-migrate', max: 1 });
    try {
      const result = await migrate(pool);
      process.stdout.write(`Migration run complete: ${result.applied.length} applied, ${result.alreadyApplied.length} already applied.\n`);
    } catch (error) {
      const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
      process.stderr.write(`Database migration failed${code}. Connection details are not logged.\n`);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
