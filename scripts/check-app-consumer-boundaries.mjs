import { fileURLToPath } from 'node:url';
import { scanConsumerTree } from '../packages/contracts/scripts/check-consumer-boundaries.ts';

const publicRoot = fileURLToPath(new URL('../apps/practice-prototype/public/', import.meta.url));
const violations = scanConsumerTree(publicRoot);
if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Practice app public import boundary passed.\n');
}
