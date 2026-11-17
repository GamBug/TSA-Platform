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
const authored = ['agents', 'architecture', 'decisions', 'guides', 'quality', 'reviews', 'specifications', 'tasks'].map((name) => `docs/${name}`);
const archiveFiles = ['docs/archive/2026-11-08/PROJECT_STATE.md','docs/archive/2026-11-08/LAST_HANDOFF.md','docs/archive/2026-11-08/TASK_BACKLOG.md'];
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const baselineUntracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', ...authored, ...archiveFiles], { cwd: root, encoding: 'utf8' })
  .split('\0').filter((filename) => filename.endsWith('.md') && (authored.some((directory) => filename.startsWith(`${directory}/`)) || archiveFiles.includes(filename)));
const probe = 'docs/guides/__docs_checker_probe__.md';

/** Execute the actual embedded checker with read-only virtual mutations. No
 * probe file is written to the workspace, private folders or pinned inputs. */
function run({ entries = {}, untracked = [], gitFails = false, trackedExtra = [], missing = [] } = {}) {
  const virtual = new Map(), reads = [], walks = [], gitCalls = [];
  for (const [filename, value] of Object.entries(entries)) {
    const absolute = path.resolve(root, filename);
    virtual.set(absolute, typeof value === 'string' ? { type: 'file', text: value } : value);
    for (let parent = path.dirname(absolute); parent.startsWith(root) && parent !== root; parent = path.dirname(parent)) {
      if (!existsSync(parent) && !virtual.has(parent)) virtual.set(parent, { type: 'directory' });
    }
  }
  const absolute = (name) => path.resolve(root, name);
  const missingPaths = new Set(missing.map(absolute));
  const dirent = (name, kind) => ({ name, isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file', isSymbolicLink: () => kind === 'symlink' });
  const fakeFs = {
    ...realFs,
    existsSync(filename) { const resolved = absolute(filename); return virtual.has(resolved) || (!missingPaths.has(resolved) && existsSync(resolved)); },
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
        return `${(args.includes('--others') ? [...baselineUntracked,...untracked] : [...tracked, ...trackedExtra]).join('\0')}\0`;
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
  assert.deepEqual(result.gitCalls[1], ['ls-files', '--others', '--exclude-standard', '-z', '--', ...authored, ...archiveFiles]);
  const artifact = run({ entries: { 'unapproved.bin': 'synthetic' }, trackedExtra: ['unapproved.bin'] });
  assert.equal(artifact.exitCode, 1);
  assert.ok(artifact.output.errors.some((error) => error.includes('Unsupported tracked artifacts')));
});

test('archived document links resolve from their original locations and broken history links fail', () => {
  const archive = 'docs/archive/2026-11-08/PROJECT_STATE.md';
  const valid = run({ entries: { [archive]: '[Decision](../decisions/OPEN_DECISIONS.md)\n' } });
  assert.equal(valid.exitCode, 0);
  const broken = run({ entries: { [archive]: '[Missing](./__absent_archive_target__.md)\n' } });
  assert.equal(broken.exitCode, 1);
  assert.ok(broken.output.errors.includes(`Broken link: ${archive} -> ./__absent_archive_target__.md`));
});

test('active and archived task registries resolve historical IDs and reject unknown or duplicate IDs', () => {
  const active = 'docs/tasks/TASK_BACKLOG.md', archive = 'docs/archive/2026-11-08/TASK_BACKLOG.md';
  const registered = run({ entries: {
    [archive]: `${readFileSync(path.join(root, archive), 'utf8')}\n## AI-998 Historical fixture\n`,
    [probe]: 'AI-998\n',
  }, untracked: [probe] });
  assert.equal(registered.exitCode, 0);
  const unknown = run({ entries: { [probe]: 'AI-999\n' }, untracked: [probe] });
  assert.equal(unknown.exitCode, 1);
  assert.ok(unknown.output.errors.some((error) => error.startsWith(`Unknown task: AI-999 in ${probe}`)));
  const duplicate = run({ entries: { [active]: `${readFileSync(path.join(root, active), 'utf8')}\n## AI-001 Duplicate fixture\n` } });
  assert.equal(duplicate.exitCode, 1);
  assert.ok(duplicate.output.errors.includes('Duplicate task ID across active and archived registries'));
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
  const baseline = run();
  const skipped = ['data/private.md', 'docs/research/__unassigned_probe__.md',
    'docs/guides/tmp/private.md', 'docs/reviews/node_modules/dependency.md', 'docs/guides/private.json'];
  const entries = Object.fromEntries(skipped.map((name) => [name, '[Broken](./absent)\n']));
  const result = run({ entries, untracked: skipped });
  assert.equal(result.exitCode, 0);
  assert.ok(skipped.every((filename) => !result.reads.includes(filename)));
  assert.equal(result.output.untrackedMarkdown, baseline.output.untrackedMarkdown);
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

test('Git-unavailable fallback retains archive registry and original-base link checks', () => {
  const result = run({ gitFails: true, entries: {
    'docs/archive/2026-11-08/TASK_BACKLOG.md': `${readFileSync(path.join(root, 'docs/archive/2026-11-08/TASK_BACKLOG.md'), 'utf8')}\n## AI-998 Historical fixture\n`,
    'docs/archive/2026-11-08/LAST_HANDOFF.md': '[Missing](./__fallback_missing__.md)\n',
    [probe]: 'AI-998\n',
  } });
  assert.equal(result.exitCode, 1);
  assert.ok(result.reads.includes('docs/archive/2026-11-08/TASK_BACKLOG.md'));
  assert.ok(result.reads.includes('docs/archive/2026-11-08/LAST_HANDOFF.md'));
  assert.ok(result.output.errors.includes('Broken link: docs/archive/2026-11-08/LAST_HANDOFF.md -> ./__fallback_missing__.md'));
  assert.equal(result.output.errors.some((error) => error.startsWith('Unknown task: AI-998')), false);
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

test('archive symlink ancestors are rejected without reading archive targets', () => {
  const archives = ['docs/archive/2026-11-08/PROJECT_STATE.md','docs/archive/2026-11-08/LAST_HANDOFF.md','docs/archive/2026-11-08/TASK_BACKLOG.md'];
  for (const gitFails of [false, true]) {
    const result = run({ gitFails, entries: { 'docs/archive': { type: 'symlink' } } });
    assert.equal(result.exitCode, 1);
    assert.ok(archives.every((filename) => !result.reads.includes(filename)));
    assert.ok(result.output.errors.some((error) => /unsafe/i.test(error)));
  }
});

test('only the exact demo agent config and capture PNG names are approved artifacts', () => {
  const approved = ['.codex/agents/tsa_light_builder.toml', ...[
    'image-enlarged-mobile','image-exam-desktop','image-exam-mobile','image-firefox-released-review',
    'topic-catalog-desktop','topic-catalog-firefox-narrow','topic-exam-desktop','topic-exam-mobile',
  ].map((name) => `plans/reports/track-b-modernization-evidence/${name}.png`)];
  assert.equal(run({ trackedExtra: approved }).exitCode, 0);
  for (const filename of ['.codex/agents/unapproved.toml','plans/reports/track-b-modernization-evidence/neighbor.png']) {
    const denied = run({ entries: { [filename]: 'Synthetic unsupported artifact\n' }, trackedExtra: [filename] });
    assert.equal(denied.exitCode, 1);
    assert.ok(denied.output.errors.some((error) => error.startsWith('Unsupported tracked artifacts:') && error.includes(filename)));
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

test('inherited whitespace is allowed only for the exact pinned Vietnamese research bytes', () => {
  const baseline = run();
  assert.equal(baseline.exitCode, 0);
  assert.ok(baseline.output.warnings.includes('Preserved input whitespace: docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md'));
  assert.equal(baseline.output.warnings.filter((warning) => warning.startsWith('Preserved pinned evidence link: docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md')).length, 4);
  const mutated = run({ entries: { 'docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md': 'Changed research bytes\ntrailing space \n' } });
  assert.equal(mutated.exitCode, 1);
  assert.ok(mutated.output.errors.includes('Trailing whitespace: docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md'));
  const missingEvidence = '/tmp/tsa-vn-exams-research-20261020/public-tests-headless.png';
  const changedLink = run({ entries: { 'docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md': `[Evidence](${missingEvidence})\n` }, missing: [missingEvidence] });
  assert.equal(changedLink.exitCode, 1);
  assert.ok(changedLink.output.errors.some((error) => error.includes('Broken link: docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md')));
  const ordinary = run({ entries: { [probe]: `[Evidence](${missingEvidence})\n` }, untracked: [probe], missing: [missingEvidence] });
  assert.equal(ordinary.exitCode, 1);
  assert.ok(ordinary.output.errors.some((error) => error.includes(`Broken link: ${probe}`)));
});
