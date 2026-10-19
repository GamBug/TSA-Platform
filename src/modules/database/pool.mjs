import pg from 'pg';

const { Pool } = pg;
const APPLICATION_ROLES = new Set(['tsa_web', 'tsa_bank', 'tsa_factory', 'tsa_exam']);

/** Create a node-postgres pool without logging or retaining a second DSN copy. */
export function createDatabasePool(connectionConfig, options = {}) {
  if (typeof connectionConfig !== 'string' && (connectionConfig === null || typeof connectionConfig !== 'object')) {
    throw new TypeError('A PostgreSQL connection string or configuration object is required');
  }
  return new Pool({
    ...(typeof connectionConfig === 'string' ? { connectionString: connectionConfig } : connectionConfig),
    max: options.max ?? 4,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 5_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    application_name: options.applicationName ?? 'tsa-database',
  });
}

/** Execute a parameterized query. Callers must provide values separately. */
export function query(poolOrClient, text, values = []) {
  if (typeof text !== 'string' || text.length === 0) throw new TypeError('SQL text is required');
  if (!Array.isArray(values)) throw new TypeError('Query values must be an array');
  return poolOrClient.query(text, values);
}

/** Run work on one checked-out connection and commit or roll back atomically. */
export async function withTransaction(pool, work, { role } = {}) {
  if (typeof work !== 'function') throw new TypeError('Transaction callback is required');
  if (role !== undefined && !APPLICATION_ROLES.has(role)) throw new TypeError('Database role is not allowlisted');

  const client = await pool.connect();
  let transactionOpen = false;
  let released = false;
  const release = (destroy = false) => {
    if (released) return;
    released = true;
    client.release(destroy);
  };
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    if (role !== undefined) await client.query(`SET LOCAL ROLE ${role}`);
    const result = await work(client);
    await client.query('COMMIT');
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the operation error; the connection is released as broken below.
        release(true);
        throw error;
      }
    }
    throw error;
  } finally {
    release();
  }
}

export const allowedApplicationRoles = Object.freeze([...APPLICATION_ROLES]);
