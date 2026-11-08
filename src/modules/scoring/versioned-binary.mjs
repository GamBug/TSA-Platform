import { InteractionV2Schema } from '../../../packages/contracts/dist/question-v2.js';
import { numericEarned } from '../../../packages/contracts/dist/numeric-response.js';
import { scoreAttempt, scoreAttemptWithPolicy, scoreBinaryAnswer } from './binary.mjs';

/** Version dispatch shares the existing binary tally and legacy answer semantics. */
export function scoreVersionedAttempt(input) {
  if (input?.policyVersion === 'practice-binary-v1') return scoreAttempt(input);
  return scoreAttemptWithPolicy(input, {
    policyVersion: 'practice-binary-v2', interactionSchema: InteractionV2Schema,
    scoreResponse: (interaction, key, response) => interaction.type === 'NUMERIC_RESPONSE'
      ? numericEarned(key, response) : scoreBinaryAnswer(interaction, key, response),
  });
}
