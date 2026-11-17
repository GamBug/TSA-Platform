import { randomUUID } from 'node:crypto';
import { reject, UUID_PATTERN } from './common.mjs';

/** Capture aggregate impact before an atomic merge; never return private IDs. */
export async function recordEquivalenceIncidents(client, { canonicalGroupId, retiredGroupId, actorId }) {
  if (![canonicalGroupId, retiredGroupId, actorId].every((id) => typeof id === 'string' && UUID_PATTERN.test(id))
      || canonicalGroupId === retiredGroupId) reject(422, 'VALIDATION_ERROR');
  const groups = await client.query(`SELECT id FROM tsa.duplicate_groups
    WHERE id=ANY($1::uuid[]) AND merged_into_id IS NULL ORDER BY id FOR UPDATE`, [[canonicalGroupId, retiredGroupId]]);
  if (groups.rowCount !== 2) reject(409, 'CONSTRAINT_CONFLICT');
  const impact = await client.query('SELECT * FROM tsa.bank_equivalence_impact($1,$2)', [canonicalGroupId, retiredGroupId]);
  const row = impact.rows[0];
  if (BigInt(row.affected_form_count) === 0n && BigInt(row.cross_group_student_count) === 0n) return { incidentId: null };
  const id = randomUUID();
  await client.query(`INSERT INTO tsa_private.equivalence_merge_incidents
    (id,canonical_group_id,retired_group_id,actor_id,affected_form_count,within_form_collision_count,cross_group_student_count)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id,canonicalGroupId,retiredGroupId,actorId,
    row.affected_form_count,row.within_form_collision_count,row.cross_group_student_count]);
  return { incidentId: id };
}
