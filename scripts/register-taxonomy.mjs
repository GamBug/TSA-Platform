// Owner command: add a provisional taxonomy version (one domain with one or more skills) so a new subject can be imported.
//   npm run bank:register-taxonomy -- --name "Private corpus Science provisional taxonomy" --domain SCIENCE --skills SCIENCE_REASONING
//   npm run bank:register-taxonomy -- ... --confirm "REGISTER TAXONOMY"
// Dry run by default. Existing taxonomy versions are never changed; the name must be new. The runtime start-up takes a
// database backup before the write, as for every owner command.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jsonDigest } from '../src/modules/bank/common.mjs';
import { withTransaction } from '../src/modules/database/pool.mjs';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHRASE = 'REGISTER TAXONOMY';
const CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

export async function registerTaxonomy({ dataDirectory, name, domain, skills, confirm, log = (line) => process.stdout.write(`${line}\n`) }) {
  if (typeof name !== 'string' || name.length < 5 || name.length > 200) throw new TypeError('The name must be 5 to 200 characters');
  if (!CODE.test(domain ?? '') || !Array.isArray(skills) || skills.length < 1 || skills.length > 20 || skills.some((skill) => !CODE.test(skill)) || new Set(skills).size !== skills.length) {
    throw new TypeError('The domain and each skill must be upper-case codes such as SCIENCE and SCIENCE_REASONING');
  }
  const database = await startPersistentPostgres(dataDirectory);
  try {
    const existing = (await database.ownerPool.query('SELECT id FROM tsa.taxonomy_versions WHERE name = $1', [name])).rows[0];
    if (existing) { log(`Already registered: ${existing.id}`); return { taxonomyVersionId: existing.id, created: false }; }
    log(`Would register "${name}": domain ${domain}, skills ${skills.join(', ')}`);
    if (confirm === undefined) { log(`Dry run. Add --confirm "${PHRASE}" to register it.`); return { taxonomyVersionId: null, created: false }; }
    if (confirm !== PHRASE) throw new Error(`Confirmation does not match. Expected exactly: "${PHRASE}"`);
  } finally { await database.stop(); }
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' }, dataDirectory, port: 0 });
  await runtime.close(); // takes the backup
  const writer = await startPersistentPostgres(dataDirectory);
  try {
    const taxonomyVersionId = randomUUID(), domainId = randomUUID();
    const nodes = [{ id: domainId, code: domain, kind: 'DOMAIN', parentId: null }, ...skills.map((code) => ({ id: randomUUID(), code, kind: 'SKILL', parentId: domainId }))];
    await withTransaction(writer.ownerPool, async (client) => {
      await client.query('INSERT INTO tsa.taxonomy_versions (id, name, version_no, definition_hash) VALUES ($1, $2, 1, $3)', [taxonomyVersionId, name, jsonDigest({ taxonomyVersionId, name, versionNo: 1, nodes })]);
      for (const node of nodes) await client.query(`INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind, parent_id, metadata) VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)`,
        [node.id, taxonomyVersionId, node.code, node.kind, node.parentId]);
    });
    log(`Registered taxonomy version ${taxonomyVersionId}.`);
    return { taxonomyVersionId, created: true };
  } finally { await writer.stop(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  const names = { '--name': 'name', '--domain': 'domain', '--skills': 'skills', '--confirm': 'confirm' };
  for (let index = 0; index < args.length; index += 2) {
    if (!names[args[index]] || typeof args[index + 1] !== 'string') { process.stderr.write('Usage: npm run bank:register-taxonomy -- --name "<name>" --domain SCIENCE --skills SKILL_A,SKILL_B [--confirm "REGISTER TAXONOMY"]\n'); process.exit(1); }
    options[names[args[index]]] = args[index + 1];
  }
  try { await registerTaxonomy({ ...options, skills: options.skills?.split(',').filter(Boolean), dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') }); }
  catch (error) { process.stderr.write(`Registration stopped: ${error.message}\n`); process.exitCode = 1; }
}
