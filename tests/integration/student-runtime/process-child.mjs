// Test-only child: never starts a database, seeds inventory, or accepts public control commands.
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';

if (process.env.NODE_ENV !== 'test' || process.env.LOCAL_SYNTHETIC_ONLY !== 'true'
    || process.env.STUDENT_PROCESS_TEST !== 'true' || !process.connected) {
  throw new Error('Explicit isolated child-process test and IPC are required');
}
const send = (message) => { if (process.connected) process.send(message); };
let runtime, pools = [], stopping = false;
process.on('disconnect', () => process.exit(0));
process.once('message', async (boot) => {
  try {
    if (boot.type !== 'boot' || !['QUEUED', 'RUNNING', 'COMMITTED', 'NORMAL'].includes(boot.mode)) throw new Error('Invalid test boot');
    const identityPool = createDatabasePool(boot.identity, { applicationName: 'student-process-identity' }),
      examPool = createDatabasePool(boot.exam, { applicationName: 'student-process-exam' }),
      workerPool = createDatabasePool(boot.worker, { applicationName: 'student-process-worker' });
    pools = [identityPool, examPool, workerPool];
    // Delays real SQL only at existing transaction boundaries; never mocks database results.
    const pausedPool = { async connect() {
      const client = await workerPool.connect(); let finishing = false;
      return new Proxy(client, { get(target, key) {
        if (key === 'query') return async (sql, values) => {
          const pause = typeof sql === 'string' && (
            (boot.mode === 'QUEUED' && sql.includes('tsa.exam_worker_claim(')) ||
            (boot.mode === 'RUNNING' && sql.includes('tsa.exam_worker_load(')));
          if (pause) {
            send({ type: 'paused', stage: boot.mode, ...(boot.mode === 'RUNNING' ? { jobId: values[0], executorId: values[1], token: String(values[2]) } : {}) });
            await new Promise(() => {}); // The test deliberately SIGKILLs this owned process.
          }
          const result = await target.query(sql, values);
          if (typeof sql === 'string' && sql.includes('tsa.exam_worker_finish(')) finishing = true;
          if (boot.mode === 'COMMITTED' && finishing && sql === 'COMMIT') {
            // PostgreSQL has committed the grade, but the worker has not received COMMIT's acknowledgement.
            send({ type: 'paused', stage: 'COMMITTED' });
            await new Promise(() => {});
          }
          return result;
        };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
    } };
    const rate = { capacity: 100, refillPerSecond: 10 };
    runtime = await createStudentRuntime({ identityPool, examPool, workerPool: pausedPool,
      env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: boot.port,
      pollMilliseconds: 20, sweepBatchSize: 10, executorId: boot.executorId, leaseSeconds: 10, retrySeconds: 1,
      createRate: rate, saveRate: { user: rate, attempt: rate } });
    send({ type: 'ready', origin: runtime.origin, port: runtime.port, pid: process.pid });
    if (boot.mode === 'NORMAL') process.on('message', async (message) => {
      if (message.type === 'ping' && !stopping) { send({ type: 'pong', pid: process.pid }); return; }
      if (message.type !== 'stop' || stopping) return;
      stopping = true;
      try {
        await runtime.close(); await Promise.all(pools.map((pool) => pool.end()));
        send({ type: 'stopped' }); process.disconnect();
      } catch { send({ type: 'failed' }); process.exit(1); }
    });
  } catch {
    // No connection configurations, secrets, SQL or private question data cross the log boundary.
    send({ type: 'failed' }); process.exit(1);
  }
});
