// One-command university demo: database, server, staff and student URLs.
//   npm run demo:uni             published Bank items only (honest shortage report)
//   npm run demo:uni:rehearsal   explicit synthetic rehearsal inventory, labelled on every page
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startUniDemo, UNI_DEMO_DEFAULT_PORT } from '../src/local/uni-demo.mjs';
import { DEMO_SECTIONS } from '../src/local/uni-demo-seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECTION_NAMES = Object.freeze({ MATH: 'Mathematics', READING: 'Reading', SCIENCE: 'Science' });

function parsePort(value) {
  if (value === undefined || value === '') return UNI_DEMO_DEFAULT_PORT;
  if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65_535) throw new Error('DEMO_UNI_PORT must be an integer from 1 through 65535');
  return Number(value);
}

/** Human-readable stock and URL summary printed once the demo is ready. */
export function formatDemoSummary(demo) {
  const { report, mode } = demo;
  const row = (label, values) => `  ${label.padEnd(26)}${DEMO_SECTIONS.map((section) => String(values[section]).padStart(12)).join('')}`;
  const simulation = report.fullSimulation;
  const lines = [
    '',
    'TSA Practice — university demo (unofficial practice, not affiliated with HUST, non-profit)',
    mode === 'REHEARSAL'
      ? 'Content mode: REHEARSAL — synthetic items written for rehearsal; every student page is labelled.'
      : 'Content mode: PUBLISHED — only owner-approved, published Bank items reach students.',
    ...(demo.sourceBackup ? [`Private Bank backup taken before start: ${demo.sourceBackup}`] : []),
    '',
    `  ${''.padEnd(26)}${DEMO_SECTIONS.map((section) => SECTION_NAMES[section].padStart(12)).join('')}`,
    row('Approved in the Bank', report.approved),
    row('Published', report.published),
    row('Deliverable in this demo', report.deliverable),
    row('One full simulation needs', simulation.required),
    '',
    `Full simulations without repeats per student: ${simulation.withoutRepeats > 0 ? 'at least ' : ''}${simulation.withoutRepeats}`,
    simulation.offered ? 'Full simulation: offered.'
      : `Full simulation: NOT offered — short by ${simulation.shortages.map((shortage) =>
        `${SECTION_NAMES[shortage.section]} ${shortage.required - shortage.available}`).join(', ') || 'a complete set in one taxonomy version'}.`,
    ...(simulation.splitAcrossTaxonomies ? ['  Published items are split across taxonomy versions; one simulation needs all three sections in one version.'] : []),
    `Section practice: ${report.sectionPractice.map((profile) =>
      `${SECTION_NAMES[profile.section]} ${profile.offered ? 'offered' : 'not offered'} (${profile.available}/${profile.required})`).join(' · ')}`,
    `Numeric practice: ${report.numericPractice.map((profile) =>
      `${SECTION_NAMES[profile.section]} ${profile.offered ? 'offered' : 'not offered'} (${profile.available}/${profile.required})`).join(' · ')}`,
    `Topic practice: ${report.topicPractice.available ? 'available for published topics' : 'no published items'}`,
    `Bank workflow: ${report.workflow.map((entry) => `${SECTION_NAMES[entry.section]} ${entry.state} ${entry.count}`).join(' · ') || 'no question versions'}`,
  ];
  const other = DEMO_SECTIONS.reduce((sum, section) => sum + report.otherProtocols[section] + report.incompleteBundles[section], 0);
  if (other > 0) lines.push(`Published but not deliverable in this demo (other interaction protocol or incomplete passage bundle): ${other}`);
  if (mode === 'PUBLISHED' && !report.topicPractice.available) {
    lines.push('Nothing is published yet, so students see an empty catalog. Synthetic items are never substituted.',
      'For a labelled synthetic run of show use: npm run demo:uni:rehearsal');
  }
  lines.push('',
    `Student practice:  ${demo.urls.student}`,
    `Numeric practice:  ${demo.urls.numeric}`,
    `Full simulation:   ${demo.urls.simulation}`,
    `Staff workspace:   ${demo.urls.staff}`,
    '',
    'Use a fresh private browser window. Local demo accounts need no password.',
    `Keep this terminal running. Ctrl+C stops the server and database and deletes the demo copy${mode === 'PUBLISHED' ? '; the private Bank gets no schema or data change' : ''}.`,
    'Guide: docs/guides/TRACK_B_SUPERVISOR_RUN_OF_SHOW.md',
    '');
  return lines.join('\n');
}

export async function startUniDemoFromEnvironment({ env = process.env, rehearsal = false } = {}) {
  const port = parsePort(env.DEMO_UNI_PORT);
  if (!rehearsal) {
    return startUniDemo({ mode: 'PUBLISHED', port, sourceCredit: env.DEMO_UNI_SOURCE_CREDIT,
      sourceDataDirectory: env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') });
  }
  // The fixture builder lives with the tests; it is loaded only for an explicit rehearsal.
  const { buildRehearsalSource, REHEARSAL_DEFAULT_NUMERIC } = await import('./uni-demo-rehearsal-source.mjs');
  const source = await buildRehearsalSource({ numeric: REHEARSAL_DEFAULT_NUMERIC });
  try {
    return await startUniDemo({ mode: 'REHEARSAL', port, sourceArchive: source });
  } finally {
    await source.close();
  }
}

async function runWorker(rehearsal) {
  let demo, stopping = false, stopRequested = process.connected === false;
  const stop = async () => {
    stopRequested = true;
    if (!demo || stopping) return;
    stopping = true;
    try { await demo.close(); process.exitCode = 0; }
    catch (error) { process.stderr.write(`University demo shutdown was incomplete: ${error.message}\n`); process.exitCode = 1; }
    finally { if (process.connected) process.disconnect(); }
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop); process.once('disconnect', stop);
  try {
    process.stdout.write(rehearsal ? 'Building the synthetic rehearsal inventory and the demo database…\n'
      : 'Backing up the private Bank and building the demo database…\n');
    demo = await startUniDemoFromEnvironment({ rehearsal });
    if (stopRequested) { await stop(); return; }
    process.stdout.write(`${JSON.stringify({ event: 'ready', mode: demo.mode, urls: demo.urls,
      published: demo.report.published, fullSimulationsWithoutRepeats: demo.report.fullSimulation.withoutRepeats,
      numericPractice: demo.report.numericPractice.map(({ section, offered, available }) => ({ section, offered, available })) })}\n`);
    process.stdout.write(formatDemoSummary(demo));
  } catch (error) {
    const message = error?.code === 'EADDRINUSE'
      ? 'The demo port is already in use. Stop the process that owns it (lsof -i :PORT) or set DEMO_UNI_PORT.'
      : error instanceof Error ? error.message : 'unknown startup failure';
    process.stderr.write(`University demo did not start: ${message}\n`);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const flags = process.argv.slice(2);
  const unknown = flags.filter((flag) => !['--rehearsal', '--demo-worker'].includes(flag));
  if (unknown.length) {
    process.stderr.write(`Unknown option: ${unknown.join(' ')}\nUsage: npm run demo:uni | npm run demo:uni:rehearsal\n`);
    process.exitCode = 1;
  } else if (flags.includes('--demo-worker')) {
    await runWorker(flags.includes('--rehearsal'));
  } else {
    // Keep the owned postmaster out of the terminal's Ctrl+C process group; the
    // worker receives the forwarded signal and closes HTTP, pools and database in order.
    const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), ...flags, '--demo-worker'], {
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
