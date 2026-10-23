// Explicit disposable engineering demo, never a persistent inventory seed.
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { createSharedReadingFixture } from '../tests/integration/student-runtime/shared-reading-fixture.mjs';
import { createDomainStudentFixture } from '../tests/integration/student-runtime/domain-fixture.mjs';
import { createMixedStudentFixture } from '../tests/integration/student-runtime/mixed-fixture.mjs';
import { createStudentRuntime } from '../src/local/student.mjs';
import { createDatabasePool } from '../src/modules/database/pool.mjs';

export async function startStudentFixtureDemo({ env = process.env } = {}) {
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV !== 'test'
      || env.LOCAL_SYNTHETIC_ONLY !== 'true' || env.STUDENT_FIXTURE_DEMO !== 'true') {
    throw new Error('Disposable student demo requires NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true');
  }
  for (const flag of ['STUDENT_FIXTURE_DOMAINS', 'STUDENT_FIXTURE_READING']) {
    if (env[flag] !== undefined && !['true', 'false'].includes(env[flag])) throw new Error(`${flag} must be true or false`);
  }
  const domains = env.STUDENT_FIXTURE_DOMAINS === 'true', reading = env.STUDENT_FIXTURE_READING === 'true';
  if (domains && reading) throw new Error('Choose one disposable fixture profile');
  let fixture, workerPool, runtime;
  let closing;
  const close = () => {
    closing ??= (async () => {
      const errors = [];
      for (const stop of [() => runtime?.close(), () => workerPool?.end(), () => fixture?.close()]) {
        try { await stop(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Disposable student demo cleanup failed');
    })();
    return closing;
  };
  try {
    fixture = reading ? await createSharedReadingFixture() : domains ? await createDomainStudentFixture() : await createMixedStudentFixture();
    const login = `fixture_worker_${randomUUID().replaceAll('-', '')}`;
    await fixture.pool.query(`CREATE ROLE ${login} LOGIN`);
    await fixture.pool.query(`GRANT tsa_exam_worker TO ${login}`);
    workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: login });
    const rate = { capacity: 100, refillPerSecond: 10 };
    runtime = await createStudentRuntime({ identityPool: fixture.harness.authPool, examPool: fixture.examPool, workerPool,
      env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0,
      pollMilliseconds: 100, sweepBatchSize: 10, executorId: 'disposable-student-demo', leaseSeconds: 30, retrySeconds: 1,
      createRate: rate, saveRate: { user: rate, attempt: rate } });
    return { origin: runtime.origin, fixtureProfile: reading ? 'SHARED_READING' : domains ? 'THREE_DOMAINS' : 'MIXED_MATH', close };
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Demo startup and cleanup failed'); }
    throw error;
  }
}

async function runWorker() {
  let demo, stopping = false, stopRequested = process.connected === false;
  const stop = async () => {
    stopRequested = true;
    if (!demo || stopping) return;
    stopping = true;
    try { await demo.close(); process.exitCode = 0; }
    catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
    finally { if (process.connected) process.disconnect(); }
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  process.once('disconnect', stop);
  try {
    demo = await startStudentFixtureDemo();
    if (stopRequested) await stop();
    else {
      const url = `${demo.origin}/?student=postgres`;
      process.stdout.write(`${JSON.stringify({ event: 'ready', url,
        mode: 'DISPOSABLE_SYNTHETIC_ONLY', fixtureProfile: demo.fixtureProfile, note: 'Original engineering fixtures; no human content approval or production publication. Stop with Ctrl+C; data is discarded.' })}\n`);
      process.stdout.write(`\nTSA Practice — local synthetic demonstration\nOpen: ${url}\nChoose synthetic candidate A explicitly; no password or personal data is needed.\n`);
      if (demo.fixtureProfile === 'THREE_DOMAINS') {
        process.stdout.write('Choose Mathematics (4), Reading (2), or Science (4). Each is independently timed and scored.\n');
      }
      process.stdout.write('Answer, wait for saved confirmation, reload, submit, then open the released review.\nKeep this terminal running. Ctrl+C stops the application and deletes its temporary database.\nGuide: docs/guides/TRACK_B_SUPERVISOR_DEMO.md\n\n');
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv[2] === '--disposable-worker') {
    await runWorker();
  } else {
    // Keep the fixture postmaster out of the terminal's Ctrl+C process group.
    // The supervisor forwards signals to the worker PID, which closes pools
    // before stopping its owned database through the existing fixture cleanup.
    const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), '--disposable-worker'], {
      detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: process.env,
    });
    worker.stdout.pipe(process.stdout); worker.stderr.pipe(process.stderr);
    let stopping = false;
    const stop = (signal) => {
      if (stopping) return;
      stopping = true;
      if (worker.exitCode === null && worker.signalCode === null) worker.kill(signal);
    };
    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));
    worker.once('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
    worker.once('close', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
  }
}
