// Image library command line.
//   npm run images -- init                                   back up, then apply pending migrations (adds the library)
//   npm run images -- list [--status ACTIVE|RETIRED]
//   npm run images -- show IMG-GEO-000123
//   npm run images -- references IMG-GEO-000123              questions that show the image
//   npm run images -- catalog [--out assets.json]            active ids, for `questions:validate --assets`
//   npm run images -- check questions.json                   image ids in a question set against the library
//   npm run images -- fetch IMG-GEO-000123 --out file.png    verified stored bytes
//   npm run images -- register --file f.png --area GEO --alt "..." [--title "..."] --source-version <uuid> [--apply]
//   npm run images -- retire IMG-GEO-000123 [--apply]
// Writes default to a dry run. Applying takes a database backup first. Registering names an existing source version and
// never creates or edits sources or rights. Assets are never deleted.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backupLocalDatabase } from '../src/local/database-backup.mjs';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { migrate } from '../src/modules/database/migrate.mjs';
import { createLocalImageStore } from '../src/modules/media/local-image-store.mjs';
import {
  activeAssetCodes, describeImage, findByHash, getImageAsset, imageAssetReferences, ImageLibraryError, listImageAssets,
  missingImageAssets, readImageAsset, registerImage, retireImageAsset,
} from '../src/modules/bank/image-library.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = () => process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b');
const storeDirectory = () => process.env.TSA_IMAGE_STORE_DIRECTORY ?? path.join(ROOT, '.local', 'track-b-images');
const USAGE = 'Usage: npm run images -- <init|list|show|references|catalog|check|fetch|register|retire> [options]\n';

function parse(args) {
  const options = { _: [], flags: new Set() };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--apply') options.flags.add('apply');
    else if (value.startsWith('--')) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith('--')) throw new TypeError(`${value} needs a value`);
      options[value.slice(2)] = next;
      index += 1;
    } else options._.push(value);
  }
  return options;
}

async function withDatabase(action) {
  const database = await startPersistentPostgres(dataDirectory());
  try { return await action(database); }
  finally { await database.stop(); }
}

async function requireLibrary(pool) {
  if ((await pool.query(`SELECT to_regclass('tsa.image_assets') AS name`)).rows[0].name === null) {
    throw new ImageLibraryError('LIBRARY_NOT_INITIALISED', 'The image library is not in this database yet; run: npm run images -- init');
  }
}

/** The owner's private image store (created on first use), as the register and fetch commands use it. */
export async function openImageStore(directory = storeDirectory()) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return createLocalImageStore({ rootDirectory: directory, enabled: true, env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' } });
}
const store = () => openImageStore();

const line = (asset) => `${asset.assetCode}  ${asset.status.padEnd(7)} ${String(asset.width ?? '?')}x${String(asset.height ?? '?')}  ${asset.mediaType}  ${asset.contentHash.slice(0, 19)}…  ${asset.title ?? asset.alt ?? ''}`;

/** Asset ids used in a question set, found by walking the JSON, so a broken set can still be checked. */
export function imageIdsIn(document) {
  const found = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      if (value.type === 'image' && typeof value.asset_id === 'string') found.add(value.asset_id);
      Object.values(value).forEach(walk);
    }
  };
  walk(document);
  return [...found].sort();
}

export async function run(argv, { out = (text) => process.stdout.write(`${text}\n`) } = {}) {
  const options = parse(argv);
  const [command, argument] = options._;
  const apply = options.flags.has('apply');
  switch (command) {
    case 'init': {
      if (!apply) { out('Dry run. This would back up the database and apply pending migrations. Add --apply to run it.'); return; }
      await withDatabase(async (database) => {
        const backup = await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: `${dataDirectory()}-backups` });
        const result = await migrate(database.ownerPool);
        out(`Backed up to ${backup.directory ?? backup.archive ?? 'the backup directory'}; applied ${result.applied.length} migration(s)${result.applied.length ? `: ${result.applied.join(', ')}` : ''}.`);
      });
      return;
    }
    case 'list': return withDatabase(async ({ ownerPool }) => {
      await requireLibrary(ownerPool);
      const assets = await listImageAssets(ownerPool, { status: options.status ?? null });
      for (const asset of assets) out(line(asset));
      out(`${assets.length} asset(s).`);
    });
    case 'show': return withDatabase(async ({ ownerPool }) => {
      await requireLibrary(ownerPool);
      out(JSON.stringify(await getImageAsset(ownerPool, argument ?? ''), null, 2));
    });
    case 'references': return withDatabase(async ({ ownerPool }) => {
      await requireLibrary(ownerPool);
      const references = await imageAssetReferences(ownerPool, argument ?? '');
      for (const reference of references) out(`${reference.questionVersionId}  ${reference.state}`);
      out(`${references.length} question version(s) show ${argument}.`);
    });
    case 'catalog': return withDatabase(async ({ ownerPool }) => {
      await requireLibrary(ownerPool);
      const codes = await activeAssetCodes(ownerPool);
      if (options.out) { await writeFile(options.out, `${JSON.stringify(codes, null, 2)}\n`, { flag: 'wx' }); out(`Wrote ${codes.length} active asset id(s) to ${options.out}`); }
      else out(JSON.stringify(codes, null, 2));
    });
    case 'check': return withDatabase(async ({ ownerPool }) => {
      await requireLibrary(ownerPool);
      const ids = imageIdsIn(JSON.parse(await readFile(argument ?? '', 'utf8')));
      const { unknown, retired } = await missingImageAssets(ownerPool, ids);
      for (const id of unknown) out(`MISSING  ${id}  is not in the library; register it or use an image_request block`);
      for (const id of retired) out(`RETIRED  ${id}  cannot be used in new questions`);
      out(`${ids.length} image id(s) checked: ${unknown.length} missing, ${retired.length} retired.`);
      if (unknown.length || retired.length) process.exitCode = 1;
    });
    case 'fetch': return withDatabase(async ({ ownerPool }) => {
      await requireLibrary(ownerPool);
      if (!options.out) throw new TypeError('fetch needs --out <new file>');
      const { bytes, asset } = await readImageAsset(ownerPool, await store(), argument ?? '');
      await writeFile(options.out, bytes, { flag: 'wx', mode: 0o600 });
      out(`Wrote ${bytes.length} bytes of ${asset.assetCode} (${asset.mediaType}) to ${options.out}`);
    });
    case 'register': return withDatabase(async (database) => {
      await requireLibrary(database.ownerPool);
      if (!options.file || !options.area || !options.alt || !options['source-version']) throw new TypeError('register needs --file, --area, --alt and --source-version');
      const bytes = await readFile(options.file);
      const { receipt } = await describeImage(bytes);
      const existing = await findByHash(database.ownerPool, receipt.contentHash);
      out(`${receipt.mediaType} ${receipt.width}x${receipt.height}, ${receipt.byteSize} bytes, ${receipt.contentHash}`);
      if (existing) { out(`Byte-identical to ${existing.assetCode}; nothing would be added.`); return; }
      if (!apply) { out('Dry run: new asset would be registered. Add --apply to register it.'); return; }
      await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: `${dataDirectory()}-backups` });
      const result = await registerImage(database.ownerPool, await store(), { bytes, area: options.area, alt: options.alt, title: options.title ?? null, sourceVersionId: options['source-version'] });
      out(`${result.created ? 'Registered' : 'Already registered as'} ${result.assetCode}`);
    });
    case 'retire': return withDatabase(async (database) => {
      await requireLibrary(database.ownerPool);
      const references = (await imageAssetReferences(database.ownerPool, argument ?? '')).filter((reference) => ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(reference.state));
      if (references.length) throw new ImageLibraryError('ASSET_IN_USE', `${argument} is still used by ${references.length} active question version(s)`);
      if (!apply) { out(`Dry run: ${argument} would be retired (no active question uses it). Add --apply to retire it.`); return; }
      await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: `${dataDirectory()}-backups` });
      out(`Retired ${(await retireImageAsset(database.ownerPool, argument)).assetCode}`);
    });
    default:
      throw new TypeError(USAGE.trim());
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await run(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${error instanceof ImageLibraryError ? `[${error.code}] ` : ''}${error.message}\n`);
    process.exitCode = 1;
  }
}
