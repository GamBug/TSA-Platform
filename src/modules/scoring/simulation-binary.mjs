import { scoreAttempt, percentage } from './binary.mjs';
import { FULL_SIMULATION_SECTIONS } from '../../../packages/contracts/src/simulation.ts';

/** Reuse binary scoring for each sealed section, then validate the complete simulation. */
export function scoreSimulationAttempt(input) {
  if (input?.policyVersion !== 'practice-binary-v1' || !Array.isArray(input.slots) || input.slots.length !== 100
      || new Set(input.slots.map(s => s.slotId)).size !== 100 || new Set(input.slots.map(s => s.ordinal)).size !== 100) {
    throw new TypeError('Invalid simulation grading input');
  }
  const results = FULL_SIMULATION_SECTIONS.map(section => {
    const slots = input.slots.filter(s => s.sectionId === section.id && s.section === section.section);
    if (slots.length !== section.count) throw new TypeError('Invalid simulation section');
    return scoreAttempt({ ...input, slots });
  });
  const correctCount = results.reduce((n, r) => n + r.correctCount, 0);
  return { correctCount, totalCount: 100, percentage: percentage(correctCount, 100),
    sections: results.flatMap(r => r.sections), items: results.flatMap(r => r.items) };
}
