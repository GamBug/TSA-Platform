import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync, readdirSync } from 'node:fs';
import * as realFs from 'node:fs';
import * as path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const strategy = readFileSync(path.join(root, 'docs/quality/TEST_STRATEGY.md'), 'utf8');
const blocks = [...strategy.matchAll(/^```javascript\n([\s\S]*?)^```$/gm)];
assert.equal(blocks.length, 1, 'the npm/sed entrypoint must select exactly one checker');
const checker = blocks[0][1];
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const authored = ['agents', 'architecture', 'decisions', 'guides', 'quality', 'reviews', 'specifications', 'tasks'].map((name) => `docs/${name}`);
const probe = 'docs/guides/__docs_checker_probe__.md';

/** Execute the actual embedded checker with read-only virtual mutations. No
 * probe file is written to the workspace, private folders or pinned inputs. */
function run({ entries = {}, untracked = [], gitFails = false, trackedExtra = [] } = {}) {
  const virtual = new Map(), reads = [], walks = [], gitCalls = [];
  for (const [filename, value] of Object.entries(entries)) {
    const absolute = path.resolve(root, filename);
    virtual.set(absolute, typeof value === 'string' ? { type: 'file', text: value } : value);
    for (let parent = path.dirname(absolute); parent.startsWith(root) && parent !== root; parent = path.dirname(parent)) {
      if (!existsSync(parent) && !virtual.has(parent)) virtual.set(parent, { type: 'directory' });
    }
  }
  const absolute = (name) => path.resolve(root, name);
  const dirent = (name, kind) => ({ name, isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file', isSymbolicLink: () => kind === 'symlink' });
  const fakeFs = {
    ...realFs,
    existsSync(filename) { return virtual.has(absolute(filename)) || existsSync(absolute(filename)); },
    lstatSync(filename) {
      const entry = virtual.get(absolute(filename));
      return entry ? dirent(path.basename(filename), entry.type) : lstatSync(absolute(filename));
    },
    readFileSync(filename, options) {
      const resolved = absolute(filename); reads.push(path.relative(root, resolved));
      const entry = virtual.get(resolved);
      if (entry) {
        if (entry.type !== 'file') throw new Error('Checker attempted to read a non-file virtual probe');
        return options ? entry.text : Buffer.from(entry.text);
      }
      return readFileSync(resolved, options);
    },
    readdirSync(dirname) {
      const resolved = absolute(dirname); walks.push(path.relative(root, resolved));
      const own = virtual.get(resolved);
      if (own && own.type !== 'directory') throw new Error('Checker followed a virtual symlink');
      const children = new Map();
      if (existsSync(resolved)) for (const item of readdirSync(resolved, { withFileTypes: true })) children.set(item.name, item);
      for (const [filename, entry] of virtual) if (path.dirname(filename) === resolved) children.set(path.basename(filename), dirent(path.basename(filename), entry.type));
      return [...children.values()];
    },
  };
  let output, exitCode = 0;
  const fakeProcess = { get exitCode() { return exitCode; }, set exitCode(value) { exitCode = value; } };
  runInNewContext(checker, {
    Buffer, process: fakeProcess, console: { log(value) { output = JSON.parse(value); } },
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'path') return path;
      if (name === 'crypto') return crypto;
      if (name === 'child_process') return { execFileSync(command, args) {
        assert.equal(command, 'git'); gitCalls.push([...args]);
        if (gitFails) throw new Error('Synthetic unavailable Git');
        return `${(args.includes('--others') ? untracked : [...tracked, ...trackedExtra]).join('\0')}\0`;
      } };
      throw new Error('Unexpected checker dependency');
    },
  }, { filename: 'embedded-docs-checker.cjs', timeout: 5000 });
  assert.ok(output, 'checker emits structured evidence');
  return { output, exitCode, reads, walks, gitCalls };
}

test('Git discovery adds authored untracked Markdown and keeps tracked-artifact coverage', () => {
  const baseline = run(); assert.equal(baseline.exitCode, 0);
  const result = run({ entries: { [probe]: '[Valid](../agents/PROJECT_STATE.md)\n' }, untracked: [probe, probe] });
  assert.equal(result.exitCode, 0); assert.equal(result.output.discovery, 'git');
  assert.equal(result.output.trackedMarkdown, baseline.output.trackedMarkdown);
  assert.equal(result.output.markdown, baseline.output.markdown + 1);
  assert.equal(result.output.links, baseline.output.links + 1);
  assert.equal(result.reads.filter((filename) => filename === probe).length, 1, 'deduplicated discovery');
  assert.equal(result.output.anchors, 'NOT_CHECKED');
  assert.deepEqual(result.gitCalls[1], ['ls-files', '--others', '--exclude-standard', '-z', '--', ...authored]);
  const artifact = run({ entries: { 'unapproved.bin': 'synthetic' }, trackedExtra: ['unapproved.bin'] });
  assert.equal(artifact.exitCode, 1);
  assert.ok(artifact.output.errors.some((error) => error.includes('Unsupported tracked artifacts')));
});

test('original synthetic text fixtures are supported when tracked without admitting other text artifacts', () => {
  const fixtures = ['single', 'multiple', 'truth-ambiguous']
    .map((name) => `tests/ai/fixtures/reading-captures/${name}.txt`);
  const result = run({ trackedExtra: fixtures });
  assert.equal(result.exitCode, 0);
  assert.ok(fixtures.every((filename) => !result.reads.includes(filename)), 'text fixtures are not parsed as documentation');
  for (const filename of [
    'tests/ai/fixtures/reading-captures/unapproved.txt',
    'tests/ai/fixtures/single.txt',
    'tests/ai/fixtures/reading-captures/nested/single.txt',
    'docs/research/raw-capture.txt', 'data/research/capture.txt', 'unapproved.txt',
  ]) {
    const denied = run({ entries: { [filename]: 'Synthetic unsupported artifact\n' }, trackedExtra: [filename] });
    assert.equal(denied.exitCode, 1);
    assert.ok(denied.output.errors.some((error) => error.startsWith('Unsupported tracked artifacts:') && error.includes(filename)));
  }
  const symlink = run({ entries: { [fixtures[0]]: { type: 'symlink' } }, trackedExtra: [fixtures[0]] });
  assert.equal(symlink.exitCode, 1);
  assert.ok(symlink.output.errors.includes(`Missing/unsafe file: ${fixtures[0]}`));
  assert.equal(symlink.reads.includes(fixtures[0]), false);
});

test('new authored document mutations fail links, fences, whitespace and task-reference checks', () => {
  for (const [text, expected] of [
    ['[Broken](./__absent_target__.md)\n', 'Broken link:'],
    ['```text\nunclosed\n', 'Unbalanced fence:'],
    ['Trailing space \n', 'Trailing whitespace:'],
    ['AI-999 is not assigned.\n', 'Unknown task:'],
  ]) {
    const result = run({ entries: { [probe]: text }, untracked: [probe] });
    assert.equal(result.exitCode, 1);
    assert.ok(result.output.errors.some((error) => error.startsWith(expected) && error.includes(probe)));
  }
});

test('Git scope excludes private, generated and unassigned research inputs', () => {
  const skipped = ['data/private.md', 'docs/research/__unassigned_probe__.md',
    'docs/guides/tmp/private.md', 'docs/reviews/node_modules/dependency.md', 'docs/guides/private.json'];
  const entries = Object.fromEntries(skipped.map((name) => [name, '[Broken](./absent)\n']));
  const result = run({ entries, untracked: skipped });
  assert.equal(result.exitCode, 0);
  assert.ok(skipped.every((filename) => !result.reads.includes(filename)));
  assert.equal(result.output.untrackedMarkdown, 0);
});

test('Git-unavailable fallback remains bounded, checks authored mutations and reports reduced coverage', () => {
  const result = run({ gitFails: true, entries: {
    [probe]: '[Broken](./__absent_target__.md)\n',
    'data/private.md': '[Broken](./private)\n',
    'docs/research/__unassigned_probe__.md': '[Broken](./research)\n',
    'docs/guides/tmp/ignored.md': '[Broken](./ignored)\n',
  } });
  assert.equal(result.exitCode, 1); assert.equal(result.output.discovery, 'bounded-workspace');
  assert.equal(result.output.trackedMarkdown, null); assert.equal(result.output.untrackedMarkdown, null);
  assert.ok(result.output.warnings.some((warning) => warning.includes('Git-ignore coverage NOT_CHECKED')));
  assert.ok(result.output.errors.some((error) => error.includes(`Broken link: ${probe}`)));
  assert.equal(result.reads.includes('data/private.md'), false);
  assert.equal(result.reads.includes('docs/research/__unassigned_probe__.md'), false);
  assert.equal(result.reads.includes('docs/guides/tmp/ignored.md'), false);
  assert.ok(result.walks.every((dirname) => authored.some((allowed) => dirname === allowed || dirname.startsWith(`${allowed}/`))));
});

test('discovery refuses symlink files and ancestors without reading their targets', () => {
  for (const gitFails of [false, true]) {
    const result = run({ gitFails, entries: { [probe]: { type: 'symlink' } }, untracked: [probe] });
    assert.equal(result.exitCode, 1);
    assert.ok(result.output.errors.some((error) => /unsafe|symlink/i.test(error)));
    assert.equal(result.reads.includes(probe), false);
  }
  const nested = 'docs/guides/__linked_directory__/probe.md';
  for (const gitFails of [false, true]) {
    const result = run({ gitFails, entries: {
      'docs/guides/__linked_directory__': { type: 'symlink' }, [nested]: 'Never read\n',
    }, untracked: [nested] });
    assert.equal(result.exitCode, gitFails ? 0 : 1);
    assert.equal(result.reads.includes(nested), false);
    assert.equal(result.walks.includes('docs/guides/__linked_directory__'), false);
  }
});

test('pinned research/review changes still fail verification', () => {
  for (const [filename, expected] of [
    ['docs/research/TSA_DEEP_RESEARCH.md', 'Research changed'],
    ['docs/reviews/ARCHITECTURE_REVIEW_001.md', 'Review input missing/changed'],
  ]) {
    const result = run({ entries: { [filename]: 'Synthetic mutation only in memory\n' } });
    assert.equal(result.exitCode, 1);
    assert.ok(result.output.errors.includes(expected));
  }
});
