import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReadingExperimentCandidate, parsePersonalPracticeConfig, parseSectionTestConfig, sectionTestId }
  from '../../src/modules/assembly/practice-profiles.mjs';

const TAXONOMY = '10000000-0000-4000-8000-0000000000a1';
function config(section, count, durationSeconds, overrides = {}) {
  return { schemaVersion: 'blueprint/1', name: `Phần thi ${section}`, taxonomyVersionId: TAXONOMY,
    profileKind: 'INDEPENDENT_PRACTICE', sections: [{ id: sectionTestId(section), section, count, durationSeconds }],
    quotas: [], maxPerSource: null, excludedQuestionIds: [], allowedTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'],
    evidenceIds: ['unit-test/1'], bundlePolicy: 'ALL_OR_NONE', scoringPolicy: 'practice-binary-v1', releasePolicy: 'after-grade-v1',
    ...overrides };
}

test('a section test has exactly the real section length, time and id', () => {
  for (const [section, count, duration] of [['MATH', 40, 3600], ['READING', 20, 1800], ['SCIENCE', 40, 3600]]) {
    const value = config(section, count, duration);
    assert.equal(parseSectionTestConfig(value)?.sections[0].count, count, section);
    assert.equal(parsePersonalPracticeConfig(value)?.sections[0].count, count, section);
  }
  assert.equal(parseSectionTestConfig(config('MATH', 39, 3600)), null);
  assert.equal(parseSectionTestConfig(config('MATH', 40, 3599)), null);
  assert.equal(parseSectionTestConfig(config('READING', 40, 3600)), null);
  assert.equal(parseSectionTestConfig(config('MATH', 40, 3600, { sections: [{ id: 'math-practice', section: 'MATH', count: 40, durationSeconds: 3600 }] })), null);
  assert.equal(parseSectionTestConfig(config('MATH', 40, 3600, { profileKind: 'FULL_SIMULATION' })), null);
});

test('a Reading section test is not a Reading experiment request, and other twenty-question Reading requests still are', () => {
  assert.equal(isReadingExperimentCandidate(config('READING', 20, 1800)), false);
  assert.equal(isReadingExperimentCandidate(config('READING', 20, 1800, { sections: [{ id: 'reading-practice', section: 'READING', count: 20, durationSeconds: 1800 }] })), true);
  const quota = { dimension: 'COGNITIVE_LEVEL', sectionId: 'reading-section-test', value: 'M1', min: 8, max: 8 };
  assert.equal(isReadingExperimentCandidate(config('READING', 20, 1800, { quotas: [quota] })), true);
});
