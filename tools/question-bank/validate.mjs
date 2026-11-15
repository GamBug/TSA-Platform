// Validate a question set in the portable exchange format. Offline: no database, no network, nothing is imported.
//   node tools/question-bank/validate.mjs <questions.json> [--assets <asset-ids.json>] [--json]
// The asset list is a JSON array of library asset ids (or an object with an "assets" array). Without it, image ids are
// only checked for format. Exit code: 0 valid, 1 invalid, 2 usage or unreadable input.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateQuestionSet } from '../../packages/contracts/dist/question-exchange.js';
import { isSafeRenderedString, isSafeTex } from '../../src/modules/bank/content-safety.mjs';

export function validateExchange(document, { assets } = {}) {
  return validateQuestionSet(document, { assets, isSafeText: isSafeRenderedString, isSafeTex });
}

export function formatReport(report) {
  const lines = [];
  for (const issue of report.errors) lines.push(`ERROR   ${issue.path || '(document)'}  [${issue.code}]  ${issue.message}`);
  for (const issue of report.warnings) lines.push(`WARNING ${issue.path || '(document)'}  [${issue.code}]  ${issue.message}`);
  const types = Object.entries(report.summary.byType).map(([type, count]) => `${type} ${count}`).join(', ') || 'none';
  lines.push(report.ok
    ? `VALID: ${report.summary.questions} question(s) (${types}).${report.summary.questionsNeedingAssets.length ? ` ${report.summary.questionsNeedingAssets.length} need a new image asset before import.` : ''}`
    : `INVALID: ${report.errors.length} error(s) in ${report.summary.invalidQuestions.length} question(s) of ${report.summary.questions}.`);
  return lines.join('\n');
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const options = { json: false };
  let file = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--json') options.json = true;
    else if (args[index] === '--assets' && args[index + 1]) options.assets = args[++index];
    else if (!args[index].startsWith('--') && file === null) file = args[index];
    else { process.stderr.write('Usage: node tools/question-bank/validate.mjs <questions.json> [--assets <asset-ids.json>] [--json]\n'); process.exit(2); }
  }
  if (file === null) { process.stderr.write('A question set file is required.\n'); process.exit(2); }
  try {
    const document = await readJson(file);
    let assets;
    if (options.assets) {
      const listed = await readJson(options.assets);
      assets = Array.isArray(listed) ? listed : listed.assets;
      if (!Array.isArray(assets)) throw new Error('The asset file must be a JSON array of ids or an object with an "assets" array');
    }
    const report = validateExchange(document, { assets });
    process.stdout.write(`${options.json ? JSON.stringify({ ok: report.ok, errors: report.errors, warnings: report.warnings, summary: report.summary }, null, 2) : formatReport(report)}\n`);
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`Cannot validate ${file}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
