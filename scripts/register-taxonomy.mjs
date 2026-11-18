// Owner command: add a taxonomy version (one or more domains, each with one or more skills) so a subject can be imported.
//   npm run bank:register-taxonomy -- --name "Private corpus Science provisional taxonomy" --domain SCIENCE --skills SCIENCE_REASONING
//   npm run bank:register-taxonomy -- --name "TSA simulation taxonomy v1" --domains "MATH=MATH_REASONING;READING=READING_REASONING;SCIENCE=SCIENCE_REASONING"
//   npm run bank:register-taxonomy -- ... --confirm "REGISTER TAXONOMY"
// A taxonomy with several domains lets one test form draw Math, Reading and Science questions from a single version.
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

/** `MATH=MATH_REASONING,MATH_GEOMETRY;READING=READING_REASONING` -> [{ domain, skills }, ...] */
export function parseDomains(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new TypeError('--domains needs DOMAIN=SKILL_A,SKILL_B pairs separated by ";"');
  return text.split(';').filter(Boolean).map((entry) => {
    const [domain, list, ...extra] = entry.split('=');
    if (extra.length || list === undefined) throw new TypeError(`Expected DOMAIN=SKILL_A,SKILL_B, got "${entry}"`);
    return { domain, skills: list.split(',').filter(Boolean) };
  });
}

export async function registerTaxonomy({ dataDirectory, name, domain, skills, domains, confirm, log = (line) => process.stdout.write(`${line}\n`) }) {
  if (typeof name !== 'string' || name.length < 5 || name.length > 200) throw new TypeError('The name must be 5 to 200 characters');
  if (domains !== undefined && (domain !== undefined || skills !== undefined)) throw new TypeError('Use either --domain with --skills, or --domains');
  const groups = domains ?? [{ domain, skills }];
  if (groups.length < 1 || groups.length > 5 || new Set(groups.map((group) => group.domain)).size !== groups.length) throw new TypeError('Give one to five distinct domains');
  for (const group of groups) {
    if (!CODE.test(group.domain ?? '') || !Array.isArray(group.skills) || group.skills.length < 1 || group.skills.length > 20 || group.skills.some((skill) => !CODE.test(skill)) || new Set(group.skills).size !== group.skills.length) {
      throw new TypeError('The domain and each skill must be upper-case codes such as SCIENCE and SCIENCE_REASONING');
    }
  }
  const allSkills = groups.flatMap((group) => group.skills);
  if (new Set(allSkills).size !== allSkills.length) throw new TypeError('A skill code may belong to one domain only');
  const database = await startPersistentPostgres(dataDirectory);
  try {
    const existing = (await database.ownerPool.query('SELECT id FROM tsa.taxonomy_versions WHERE name = $1', [name])).rows[0];
    if (existing) { log(`Already registered: ${existing.id}`); return { taxonomyVersionId: existing.id, created: false }; }
    log(`Would register "${name}": ${groups.map((group) => `domain ${group.domain}, skills ${group.skills.join(', ')}`).join('; ')}`);
    if (confirm === undefined) { log(`Dry run. Add --confirm "${PHRASE}" to register it.`); return { taxonomyVersionId: null, created: false }; }
    if (confirm !== PHRASE) throw new Error(`Confirmation does not match. Expected exactly: "${PHRASE}"`);
  } finally { await database.stop(); }
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' }, dataDirectory, port: 0 });
  await runtime.close(); // takes the backup
  const writer = await startPersistentPostgres(dataDirectory);
  try {
    const taxonomyVersionId = randomUUID();
    const nodes = groups.flatMap((group) => {
      const domainId = randomUUID();
      return [{ id: domainId, code: group.domain, kind: 'DOMAIN', parentId: null }, ...group.skills.map((code) => ({ id: randomUUID(), code, kind: 'SKILL', parentId: domainId }))];
    });
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
  const names = { '--name': 'name', '--domain': 'domain', '--skills': 'skills', '--domains': 'domains', '--confirm': 'confirm' };
  for (let index = 0; index < args.length; index += 2) {
    if (!names[args[index]] || typeof args[index + 1] !== 'string') { process.stderr.write('Usage: npm run bank:register-taxonomy -- --name "<name>" (--domain SCIENCE --skills SKILL_A,SKILL_B | --domains "MATH=SKILL_A;SCIENCE=SKILL_B,SKILL_C") [--confirm "REGISTER TAXONOMY"]\n'); process.exit(1); }
    options[names[args[index]]] = args[index + 1];
  }
  try { await registerTaxonomy({ ...options, skills: options.skills?.split(',').filter(Boolean), domains: options.domains === undefined ? undefined : parseDomains(options.domains), dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') }); }
  catch (error) { process.stderr.write(`Registration stopped: ${error.message}\n`); process.exitCode = 1; }
}
