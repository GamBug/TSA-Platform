// Disposable offline Factory-to-website demonstration. Nothing is written to retained inventory.
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createReadingFactoryFixture } from '../tests/integration/factory-bank-exam/fixture.mjs';

export async function startReadingFactoryDemo({ env = process.env } = {}) {
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV !== 'test'
      || env.LOCAL_SYNTHETIC_ONLY !== 'true' || env.STUDENT_FIXTURE_DEMO !== 'true') {
    throw new Error('Reading Factory demo requires NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true');
  }
  let fixture;
  let closing;
  const close = () => {
    closing ??= fixture?.close() ?? Promise.resolve();
    return closing;
  };
  try {
    fixture = await createReadingFactoryFixture();
    await fixture.prepareDrafts();
    const blockedDrafts = await fixture.proveDraftsUnselectable();
    await fixture.submitReviewAndFixturePublish();
    const runtime = await fixture.startStudentRuntime();
    return Object.freeze({
      origin: runtime.origin,
      questionCount: fixture.package.candidates.length,
      passageCount: 2,
      fixture: fixture.report.fixture,
      liveLlmCalled: fixture.report.liveLlmCalled,
      humanReview: fixture.report.humanReview,
      publication: fixture.report.publication,
      blockedDrafts,
      close,
    });
  } catch (error) {
    try { await close(); } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Reading Factory demo startup and cleanup failed');
    }
    throw error;
  }
}

async function runWorker() {
  let demo;
  let stopping = false;
  let stopRequested = process.connected === false;
  const stop = async () => {
    stopRequested = true;
    if (!demo || stopping) return;
    stopping = true;
    try {
      await demo.close();
      process.exitCode = 0;
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    } finally {
      if (process.connected) process.disconnect();
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('disconnect', stop);
  try {
    demo = await startReadingFactoryDemo();
    if (stopRequested) {
      await stop();
      return;
    }
    const url = `${demo.origin}/?student=postgres`;
    process.stdout.write(`${JSON.stringify({
      event: 'ready', url, mode: 'DISPOSABLE_SYNTHETIC_ONLY',
      fixture: demo.fixture, liveLlmCalled: demo.liveLlmCalled,
      questionCount: demo.questionCount, passageCount: demo.passageCount,
      humanReview: demo.humanReview, publication: demo.publication,
      draftAssemblyBlock: demo.blockedDrafts.error,
      note: 'Original fixture only. No LLM call or human approval. Fixture-scoped synthetic publication is local and discarded on shutdown.',
    })}\n`);
    process.stdout.write('\nReading Factory · local synthetic demonstration\n');
    process.stdout.write(`Open: ${url}\n`);
    process.stdout.write('Select synthetic candidate A. The 20-question, 1,800-second READING profile uses two ordered ten-question passage bundles.\n');
    process.stdout.write('This run used labelled fixtures, deterministic validation, the existing Bank author handoff/reviewer queue and isolated fixture-only publication. It is not real LLM output, human review, or production approval.\n');
    process.stdout.write('Answer, wait for saved confirmation, reload, submit, then open the released review. The database is disposable; Ctrl+C stops the app and deletes it.\n\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv[2] === '--disposable-worker') {
    await runWorker();
  } else {
    // Keep the owned disposable postmaster outside the terminal's process group.
    const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), '--disposable-worker'], {
      detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: process.env,
    });
    worker.stdout.pipe(process.stdout);
    worker.stderr.pipe(process.stderr);
    let stopping = false;
    const stop = (signal) => {
      if (stopping) return;
      stopping = true;
      if (worker.exitCode === null && worker.signalCode === null) worker.kill(signal);
    };
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
    process.once('disconnect', () => stop('SIGTERM'));
    worker.once('error', (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
    worker.once('close', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
  }
}
