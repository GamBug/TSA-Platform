import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planDemoOfferings, takeExactUnits } from '../../../src/local/uni-demo-seed.mjs';

const T1 = '10000000-0000-4000-8000-0000000000a1';
const T2 = '10000000-0000-4000-8000-0000000000a2';
let serial = 0;
function versions(section, count, overrides = {}) {
  return Array.from({ length: count }, () => ({ id: `version-${++serial}`, taxonomyVersionId: T1, section,
    schemaVersion: 'question/1', interactionType: 'SINGLE_CHOICE', stimulusVersionId: null, bundleId: null, ...overrides }));
}

test('exact unit selection keeps passage bundles whole', () => {
  assert.deepEqual(takeExactUnits([10, 10, 3], 20).sort(), [0, 1]);
  assert.equal(takeExactUnits([10, 10, 3], 7), null);
  assert.equal(takeExactUnits([], 4), null);
  assert.deepEqual(takeExactUnits([5, 3, 2], 10).sort(), [0, 1, 2]);
  assert.throws(() => takeExactUnits([1], 0), RangeError);
  assert.throws(() => takeExactUnits([0], 1), RangeError);
});

test('no published stock offers nothing and reports the whole shortage', () => {
  const plan = planDemoOfferings({ versions: [] });
  assert.deepEqual(plan.published, { MATH: 0, READING: 0, SCIENCE: 0 });
  assert.deepEqual(plan.fullSimulation, { offered: false, withoutRepeats: 0, taxonomyVersionId: null,
    required: { MATH: 40, READING: 20, SCIENCE: 40 }, splitAcrossTaxonomies: false, shortages: [
      { section: 'MATH', required: 40, available: 0 }, { section: 'READING', required: 20, available: 0 },
      { section: 'SCIENCE', required: 40, available: 0 }] });
  assert.equal(plan.sectionPractice.some((profile) => profile.offered), false);
  assert.equal(plan.topicPractice.available, false);
});

test('two complete non-overlapping simulations are counted from standalone stock', () => {
  const plan = planDemoOfferings({ versions: [...versions('MATH', 85), ...versions('READING', 40), ...versions('SCIENCE', 80)] });
  assert.equal(plan.fullSimulation.offered, true);
  assert.equal(plan.fullSimulation.withoutRepeats, 2);
  assert.equal(plan.fullSimulation.taxonomyVersionId, T1);
  assert.deepEqual(plan.fullSimulation.shortages, []);
  assert.deepEqual(plan.sectionPractice.map((profile) => [profile.section, profile.offered, profile.available]),
    [['MATH', true, 85], ['READING', true, 40], ['SCIENCE', true, 80]]);
});

test('a partial section keeps the simulation closed while section and topic practice stay open', () => {
  const plan = planDemoOfferings({ versions: [...versions('MATH', 40), ...versions('READING', 19), ...versions('SCIENCE', 40)] });
  assert.equal(plan.fullSimulation.offered, false);
  assert.deepEqual(plan.fullSimulation.shortages, [{ section: 'READING', required: 20, available: 19 }]);
  assert.equal(plan.sectionPractice.every((profile) => profile.offered), true);
  assert.equal(plan.topicPractice.available, true);
});

test('reading bundles are used whole and an incompletely published bundle is excluded', () => {
  const bundles = new Map([['b1', 10], ['b2', 10], ['b3', 10]]);
  const reading = [
    ...versions('READING', 10, { stimulusVersionId: 's1', bundleId: 'b1' }),
    ...versions('READING', 10, { stimulusVersionId: 's2', bundleId: 'b2' }),
    ...versions('READING', 9, { stimulusVersionId: 's3', bundleId: 'b3' }),
  ];
  const plan = planDemoOfferings({ versions: [...versions('MATH', 40), ...reading, ...versions('SCIENCE', 40)], bundles });
  assert.equal(plan.published.READING, 29);
  assert.equal(plan.deliverable.READING, 20);
  assert.equal(plan.incompleteBundles.READING, 9);
  assert.equal(plan.fullSimulation.withoutRepeats, 1);
  // A ten-question passage cannot fill the two-question reading profile.
  assert.equal(plan.sectionPractice.find((profile) => profile.section === 'READING').offered, false);
});

test('a bundle whose members span taxonomy versions is not delivered', () => {
  const bundles = new Map([['b1', 2]]);
  const plan = planDemoOfferings({ bundles, versions: [
    ...versions('READING', 1, { stimulusVersionId: 's1', bundleId: 'b1' }),
    ...versions('READING', 1, { stimulusVersionId: 's1', bundleId: 'b1', taxonomyVersionId: T2 })] });
  assert.equal(plan.deliverable.READING, 0);
  assert.equal(plan.incompleteBundles.READING, 2);
});

test('stock split across taxonomy versions cannot form one simulation and says so', () => {
  const plan = planDemoOfferings({ versions: [...versions('MATH', 40),
    ...versions('READING', 20, { taxonomyVersionId: T2 }), ...versions('SCIENCE', 40, { taxonomyVersionId: T2 })] });
  assert.equal(plan.fullSimulation.offered, false);
  assert.equal(plan.fullSimulation.splitAcrossTaxonomies, true);
  assert.deepEqual(plan.sectionPractice.map((profile) => [profile.section, profile.taxonomyVersionId]),
    [['MATH', T1], ['READING', T2], ['SCIENCE', T2]]);
});

test('other interaction protocols are published but not deliverable in this demo', () => {
  const plan = planDemoOfferings({ versions: [...versions('MATH', 3),
    ...versions('MATH', 2, { schemaVersion: 'question/2', interactionType: 'NUMERIC' }),
    ...versions('READING', 1, { schemaVersion: 'question/3', interactionType: 'CLOZE' })] });
  assert.deepEqual(plan.published, { MATH: 5, READING: 1, SCIENCE: 0 });
  assert.deepEqual(plan.deliverable, { MATH: 3, READING: 0, SCIENCE: 0 });
  assert.deepEqual(plan.otherProtocols, { MATH: 2, READING: 1, SCIENCE: 0 });
  assert.equal(plan.sectionPractice.find((profile) => profile.section === 'MATH').offered, false);
});

const numeric = (section, count, overrides = {}) => versions(section, count,
  { schemaVersion: 'question/2', interactionType: 'NUMERIC_RESPONSE', ...overrides });

test('published numeric-answer stock offers its own practice and is not reported as undeliverable', () => {
  const plan = planDemoOfferings({ versions: [...versions('MATH', 3), ...numeric('MATH', 4)] });
  assert.deepEqual(plan.published, { MATH: 7, READING: 0, SCIENCE: 0 });
  assert.deepEqual(plan.deliverable, { MATH: 3, READING: 0, SCIENCE: 0 });
  assert.deepEqual(plan.otherProtocols, { MATH: 0, READING: 0, SCIENCE: 0 });
  assert.deepEqual(plan.numericStock, { MATH: 4, READING: 0, SCIENCE: 0 });
  assert.deepEqual(plan.numericPractice.map((profile) => [profile.section, profile.offered, profile.available, profile.required]),
    [['MATH', true, 4, 4], ['SCIENCE', false, 0, 4]]);
  assert.equal(plan.numericPractice[0].taxonomyVersionId, T1);
  // Choice items stay in their own offering: three are not enough for a four-question section practice.
  assert.equal(plan.sectionPractice.find((profile) => profile.section === 'MATH').offered, false);
});

test('numeric practice needs enough items in one taxonomy version and ignores passage-bound numeric items', () => {
  const split = planDemoOfferings({ versions: [...numeric('MATH', 3), ...numeric('MATH', 3, { taxonomyVersionId: T2 })] });
  assert.equal(split.numericPractice[0].offered, false);
  assert.equal(split.numericPractice[0].available, 3);
  const best = planDemoOfferings({ versions: [...numeric('MATH', 4), ...numeric('MATH', 5, { taxonomyVersionId: T2 })] });
  assert.equal(best.numericPractice[0].taxonomyVersionId, T2);
  const bound = planDemoOfferings({ versions: numeric('MATH', 4, { bundleId: 'bundle-1', stimulusVersionId: 'stimulus-1' }) });
  assert.equal(bound.numericPractice[0].offered, false);
  assert.equal(bound.numericStock.MATH, 0);
  const science = planDemoOfferings({ versions: numeric('SCIENCE', 4) });
  assert.deepEqual(science.numericPractice.map((profile) => [profile.section, profile.offered]), [['MATH', false], ['SCIENCE', true]]);
});
