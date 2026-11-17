import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { exportFixtureFile } from '../../tools/question-factory/generic-fixture-cli.mjs';
import { exportGenericFixturePackage } from '../../tools/question-factory/generic-fixture.mjs';
import { makeGenericFixtureInput } from './fixtures/generic-generation.mjs';

test('private fixture file export is exact canonical bytes, mode0600, no-overwrite and never writes on validation failure', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tsa-generic-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = makeGenericFixtureInput();
  const inputPath = path.join(root, 'input.json'), output = path.join(root, 'package.json');
  await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
  const report = await exportFixtureFile(inputPath, output);
  assert.equal(report.candidates, 1); assert.equal(report.liveLlmCalled, false);
  const expected = (await exportGenericFixturePackage(input)).packageBytes;
  assert.deepEqual(await readFile(output), expected);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  const cliOutput = path.join(root, 'cli-package.json');
  const command = spawnSync(process.execPath, ['tools/question-factory/generic-fixture-cli.mjs', inputPath, cliOutput], { encoding: 'utf8' });
  assert.equal(command.status, 0, command.stderr);
  assert.deepEqual(JSON.parse(command.stdout), report);
  assert.deepEqual(await readFile(cliOutput), expected);
  await assert.rejects(exportFixtureFile(inputPath, output));
  assert.deepEqual(await readFile(output), expected);
  input.calls[0].fixtureResult.candidates[0].private.answerKey.optionId = 'missing';
  await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
  const failed = path.join(root, 'failed.json');
  await assert.rejects(exportFixtureFile(inputPath, failed));
  await assert.rejects(stat(failed), { code: 'ENOENT' });
});

test('killing a writer after fsync but before atomic publication leaves no final package', { timeout: 15_000 }, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tsa-generic-crash-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'input.json'), output = path.join(root, 'package.json');
  await writeFile(input, JSON.stringify(makeGenericFixtureInput()), { mode: 0o600 });
  const harness = path.join(root, 'interrupt.mjs');
  await writeFile(harness, `import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
process.on('message', () => {});
fs.link = async (temporary, target) => {
  process.send({ temporary, target });
  await new Promise(() => {});
};
syncBuiltinESMExports();
const { exportFixtureFile } = await import(pathToFileURL(process.argv[4]).href);
await exportFixtureFile(process.argv[2], process.argv[3]);
`, { mode: 0o600 });
  const child = fork(harness, [input, output, path.resolve('tools/question-factory/generic-fixture-cli.mjs')], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
  });
  let timer;
  const marker = await Promise.race([
    once(child, 'message').then(([value]) => value),
    once(child, 'exit').then(() => { throw new Error('Writer exited before publication barrier'); }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Publication barrier timeout')), 8_000); }),
  ]).finally(() => clearTimeout(timer));
  assert.equal(marker.target, output);
  assert.deepEqual(await readFile(marker.temporary), (await exportGenericFixturePackage(makeGenericFixtureInput())).packageBytes);
  assert.equal((await stat(marker.temporary)).mode & 0o777, 0o600);
  await assert.rejects(stat(output), { code: 'ENOENT' });
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  await assert.rejects(stat(output), { code: 'ENOENT' });
  assert.equal((await exportFixtureFile(input, output)).candidates, 1, 'a new run can publish after the interrupted writer');
});

test('symlink input/output and public-root targets are denied without altering referenced files', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tsa-generic-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'input.json');
  await writeFile(input, JSON.stringify(makeGenericFixtureInput()), { mode: 0o600 });
  const inputLink = path.join(root, 'input-link.json'); await symlink(input, inputLink);
  await assert.rejects(exportFixtureFile(inputLink, path.join(root, 'out.json')));
  const sentinel = path.join(root, 'sentinel'); await writeFile(sentinel, 'unchanged', { mode: 0o600 });
  const outputLink = path.join(root, 'output-link.json'); await symlink(sentinel, outputLink);
  await assert.rejects(exportFixtureFile(input, outputLink));
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged');
  const publicRoot = path.resolve('apps/practice-prototype/public');
  await assert.rejects(exportFixtureFile(input, path.join(publicRoot, 'generic-private-test.json')));
  await assert.rejects(stat(path.join(publicRoot, 'generic-private-test.json')), { code: 'ENOENT' });
  const publicAlias = path.join(root, 'public-alias'); await symlink(publicRoot, publicAlias);
  await assert.rejects(exportFixtureFile(input, path.join(publicAlias, 'generic-private-test.json')));
});

test('competing publishers preserve exactly one complete package without replacing the winner', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tsa-generic-publish-race-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputs = ['MATH', 'SCIENCE'].map((section) => makeGenericFixtureInput({ section }));
  const files = inputs.map((_, index) => path.join(root, `input-${index}.json`));
  for (const [index, input] of inputs.entries()) await writeFile(files[index], JSON.stringify(input), { mode: 0o600 });
  const target = path.join(root, 'package.json');
  const outcomes = await Promise.allSettled(files.map((file) => exportFixtureFile(file, target)));
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  const winner = outcomes.findIndex((result) => result.status === 'fulfilled');
  assert.deepEqual(await readFile(target), (await exportGenericFixturePackage(inputs[winner])).packageBytes);
  assert.deepEqual((await readdir(root)).filter((name) => name.startsWith('.generic-fixture-')), []);
});
