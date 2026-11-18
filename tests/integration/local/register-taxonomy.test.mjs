import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDomains, registerTaxonomy } from '../../../scripts/register-taxonomy.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';

test('domain specifications parse into domains with their skills', () => {
  assert.deepEqual(parseDomains('MATH=MATH_REASONING,MATH_GEOMETRY;READING=READING_REASONING'),
    [{ domain: 'MATH', skills: ['MATH_REASONING', 'MATH_GEOMETRY'] }, { domain: 'READING', skills: ['READING_REASONING'] }]);
  assert.throws(() => parseDomains('MATH'), /Expected DOMAIN=SKILL_A,SKILL_B/);
  assert.throws(() => parseDomains(''), /--domains needs/);
});

test('a taxonomy with several domains is validated before anything is written', async () => {
  const quiet = () => {};
  const base = { dataDirectory: '/nonexistent', name: 'Combined test taxonomy', log: quiet };
  await assert.rejects(registerTaxonomy({ ...base, domains: [{ domain: 'MATH', skills: ['A_ONE'] }, { domain: 'MATH', skills: ['A_TWO'] }] }), /distinct domains/);
  await assert.rejects(registerTaxonomy({ ...base, domains: [{ domain: 'MATH', skills: ['SHARED'] }, { domain: 'READING', skills: ['SHARED'] }] }), /one domain only/);
  await assert.rejects(registerTaxonomy({ ...base, domain: 'MATH', skills: ['MATH_REASONING'], domains: [{ domain: 'READING', skills: ['READING_REASONING'] }] }), /either/);
});

test('one taxonomy version can hold Math, Reading and Science domains and is registered once', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-taxonomy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDirectory = join(root, 'bank');
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, dataDirectory, port: 0 });
  await runtime.close();
  const log = [];
  const name = 'TSA combined simulation taxonomy (test)';
  const domains = parseDomains('MATH=MATH_REASONING;READING=READING_REASONING;SCIENCE=SCIENCE_REASONING');

  const dry = await registerTaxonomy({ dataDirectory, name, domains, log: (line) => log.push(line) });
  assert.equal(dry.taxonomyVersionId, null);
  assert.match(log.join('\n'), /Dry run/);

  const created = await registerTaxonomy({ dataDirectory, name, domains, confirm: 'REGISTER TAXONOMY', log: (line) => log.push(line) });
  assert.equal(created.created, true);
  const again = await registerTaxonomy({ dataDirectory, name, domains, confirm: 'REGISTER TAXONOMY', log: (line) => log.push(line) });
  assert.deepEqual(again, { taxonomyVersionId: created.taxonomyVersionId, created: false });

  const database = await startPersistentPostgres(dataDirectory);
  try {
    const nodes = (await database.ownerPool.query(`SELECT d.code AS domain, s.code AS skill FROM tsa.taxonomy_nodes s
        JOIN tsa.taxonomy_nodes d ON d.id = s.parent_id WHERE s.taxonomy_version_id = $1 AND s.kind = 'SKILL' ORDER BY d.code`, [created.taxonomyVersionId])).rows;
    assert.deepEqual(nodes, [{ domain: 'MATH', skill: 'MATH_REASONING' }, { domain: 'READING', skill: 'READING_REASONING' }, { domain: 'SCIENCE', skill: 'SCIENCE_REASONING' }]);
    const roots = (await database.ownerPool.query(`SELECT count(*)::int AS n FROM tsa.taxonomy_nodes WHERE taxonomy_version_id = $1 AND kind = 'DOMAIN' AND parent_id IS NULL`, [created.taxonomyVersionId])).rows[0].n;
    assert.equal(roots, 3);
  } finally { await database.stop(); }
});
