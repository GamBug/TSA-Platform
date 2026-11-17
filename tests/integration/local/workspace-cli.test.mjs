import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const entrypoint = fileURLToPath(new URL('../../../src/local/track-b.mjs', import.meta.url));
function launch(dataDirectory) {
  const child = spawn(process.execPath, [entrypoint], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true',
      LOCAL_STUDENT_ENABLED: 'true', PORT: '0', TRACK_B_DATA_DIRECTORY: dataDirectory },
  });
  let output = '', errors = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (text) => { output += text; });
  child.stderr.on('data', (text) => { errors += text; });
  const exited = once(child, 'close');
  return { child, exited, get output() { return output; }, get errors() { return errors; } };
}
async function stop(p) {
  if (p.child.exitCode !== null || p.child.signalCode !== null) return;
  p.child.kill('SIGTERM');
  let timer;
  try {
    await Promise.race([p.exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Workspace shutdown timed out')), 5000); })]);
  } finally { clearTimeout(timer); }
}

test('retained CLI survives terminal-group interruption and reopens the same owned database', { timeout: 30_000 }, async (t) => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'tsa-workspace-cli-'));
  const dataDirectory = path.join(scratch, 'cluster');
  let p;
  t.after(async () => { if (p) await stop(p); await rm(scratch, { recursive: true, force: true }); });
  for (let run = 0; run < 2; run++) {
    p = launch(dataDirectory);
    const deadline = Date.now() + 10_000;
    let url;
    while (Date.now() < deadline && !url) {
      const match = p.output.match(/Retained student practice: (http:\/\/127\.0\.0\.1:\d+\/\?student=postgres)/);
      if (match) url = match[1];
      else { assert.equal(p.child.exitCode, null, p.errors); await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    assert.ok(url, p.errors || 'Workspace failed to become ready');
    const origin = new URL(url).origin;
    assert.equal((await fetch(url)).status, 200);
    const session = await fetch(`${origin}/local-auth/session`);
    assert.equal(session.status, 200);
    assert.equal((await session.json()).authenticated, false);
    // The terminal group contains the supervisor, while the owned postmaster
    // stays in the detached worker group until orderly runtime shutdown.
    process.kill(-p.child.pid, 'SIGINT');
    const [code, signal] = await p.exited;
    assert.equal(code, 0, p.errors); assert.equal(signal, null);
    assert.doesNotMatch(p.errors, /FATAL|terminating connection|shutdown was incomplete/i);
    await assert.rejects(fetch(url));
    assert.match(await readFile(path.join(dataDirectory, 'PG_VERSION'), 'utf8'), /^18/);
    await assert.rejects(lstat(path.join(dataDirectory, 'postmaster.pid')), { code: 'ENOENT' });
    await assert.rejects(lstat(`${dataDirectory}.track-b-start.lock`), { code: 'ENOENT' });
  }
});
