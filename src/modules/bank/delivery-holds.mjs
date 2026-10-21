import { withTransaction } from '../database/pool.mjs';

/** Retryable postcommit fanout. Holds deny access even if this transaction fails. */
export async function drainDeliveryHolds(bankPool, principal) {
  return withTransaction(bankPool, async (client) => {
    await client.query("SELECT set_config('tsa.bank_actor_id',$1,true)", [principal.userId]);
    return (await client.query('SELECT tsa.bank_drain_delivery_holds() AS processed')).rows[0].processed;
  }, { role: 'tsa_bank' });
}
