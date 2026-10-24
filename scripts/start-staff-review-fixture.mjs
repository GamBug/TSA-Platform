import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createReviewBrowserFixture } from '../tests/integration/bank/review-browser-fixture.mjs';

export async function startStaffReviewFixtureDemo({ env = process.env } = {}) {
  if (process.env.NODE_ENV === 'production'
      || env.NODE_ENV !== 'test'
      || env.LOCAL_SYNTHETIC_ONLY !== 'true'
      || env.STAFF_REVIEW_FIXTURE_DEMO !== 'true') {
    throw new Error('Disposable staff review demo requires NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STAFF_REVIEW_FIXTURE_DEMO=true');
  }

  const fixture = await createReviewBrowserFixture();
  let closing;
  return {
    origin: fixture.origin,
    fixtureProfile: 'MIXED_REVIEW',
    questionCount: fixture.questions.length,
    close() {
      closing ??= fixture.close();
      return closing;
    },
  };
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
    demo = await startStaffReviewFixtureDemo();
    if (stopRequested) {
      await stop();
      return;
    }
    const url = `${demo.origin}/`;
    process.stdout.write(`${JSON.stringify({
      event: 'ready',
      url,
      mode: 'LOCAL_SYNTHETIC_ONLY',
      fixtureProfile: demo.fixtureProfile,
      questionCount: demo.questionCount,
      note: 'Disposable synthetic fixture only. Rights and content are not qualified or approved for publication.',
    })}\n`);
    process.stdout.write('\nStaff review-context demonstration — local synthetic data\n');
    process.stdout.write(`Open: ${url}\n`);
    process.stdout.write('Open “Không gian bản nháp cục bộ” and select synthetic AUTHOR “Tác giả tổng hợp”. Inspect each version explicitly.\n');
    process.stdout.write('After inspecting an owned safe DRAFT, confirm its handoff to the review queue. Sign out and choose synthetic REVIEWER to open “Hàng chờ rà soát”. This does not approve content or rights.\n');
    process.stdout.write('An independent synthetic REVIEWER may explicitly reject a previewable queued version after six rubric choices and a reason. BANK_MANAGER may quarantine with the disclosed related-access impact. No content approval or publication control is provided.\n');
    process.stdout.write('For recorded evidence, sign out and choose synthetic BANK_MANAGER “Quản lý ngân hàng câu hỏi tổng hợp”; open evidence explicitly.\n');
    process.stdout.write('BANK_MANAGER can explicitly open recorded review history for an exact version; historical decisions and verbatim reasons do not attest qualification, rights or current eligibility.\n');
    process.stdout.write('BANK_MANAGER may explicitly select displayed versions for a canonical dataset preflight. Counts are not accepted inventory, rights, human review, or assembly feasibility; mandatory human/rights blockers remain.\n');
    process.stdout.write('The synthetic reviewer is not a qualified reviewer. This demo makes no real rights, content-approval, or publication claim.\n');
    process.stdout.write('Keep this terminal running. Ctrl+C stops the app and deletes its disposable database.\n\n');
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
    // Keep the owned database outside the terminal process group and forward
    // terminal signals to the worker that owns its cleanup lifecycle.
    const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), '--disposable-worker'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: process.env,
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
    worker.once('close', (code, signal) => {
      process.exitCode = signal ? 1 : code ?? 1;
    });
  }
}
