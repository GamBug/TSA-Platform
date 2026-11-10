import { randomUUID } from 'node:crypto';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createQuestionService } from '../../../src/modules/bank/questions.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';

const RUBRIC = Object.freeze(Object.fromEntries(
  ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true]),
));

const text = (value) => [{ type: 'text', text: value }];

/** Disposable original question/3 inventory; fixture review is not human content approval. */
export async function createClozeMatchingFixture({ durationSeconds = 600, includeLegacyGroups = false } = {}) {
  const fixture = await createAllocationFixture({ questionCount: 0, blueprintCount: 1 });
  try {
    const questions = await createQuestionService({ bankPool: fixture.bankPool,
      identityService: fixture.identityService, enableClozeMatching: true });
    const workflow = await createPublicationService({ bankPool: fixture.bankPool,
      identityService: fixture.identityService, fixtureScopeId: fixture.fixtureScopeId, enableClozeMatching: true });
    const template = createPrivateTemplate(fixture.source);
    const definitions = [
      ...(includeLegacyGroups ? [
        {
          type: 'MULTIPLE_CHOICE',
          interaction: { type: 'MULTIPLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: text(id.toUpperCase()) })),
            minSelections: 1, maxSelections: 2 },
          answerKey: { type: 'MULTIPLE_CHOICE', optionIds: ['b'] },
        },
        {
          type: 'TRUE_FALSE_GROUP',
          interaction: { type: 'TRUE_FALSE_GROUP', statements: [
            { id: 'statement-a', content: text('Statement A') }, { id: 'statement-b', content: text('Statement B') },
          ] },
          answerKey: { type: 'TRUE_FALSE_GROUP', values: { 'statement-a': true, 'statement-b': false } },
        },
      ] : []),
      {
        type: 'CLOZE',
        interaction: { type: 'CLOZE', fields: [{ id: 'city', label: 'City' }, { id: 'ratio', label: 'Ratio' }],
          maxLength: 40, normalization: { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' } },
        answerKey: { type: 'CLOZE', acceptedValues: { city: ['Ha Noi'], ratio: ['3:2'] } },
      },
      {
        type: 'MATCHING',
        interaction: { type: 'MATCHING', rows: [
          { id: 'row-a', label: 'Row A' }, { id: 'row-b', label: 'Row B' }, { id: 'row-c', label: 'Row C' },
        ], targets: [
          { id: 'target-red', label: 'Red', maxUses: 1 },
          { id: 'target-blue', label: 'Blue', maxUses: 1 },
          { id: 'target-green', label: 'Green', maxUses: 1 },
        ] },
        answerKey: { type: 'MATCHING', answers: { 'row-a': 'target-red', 'row-b': 'target-blue', 'row-c': 'target-green' } },
      },
      {
        type: 'NUMERIC_RESPONSE',
        interaction: { type: 'NUMERIC_RESPONSE', label: 'Enter a decimal answer', format: 'DECIMAL' },
        answerKey: { type: 'NUMERIC_RESPONSE', value: '1.5' },
      },
      {
        type: 'SINGLE_CHOICE',
        interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: text(id.toUpperCase()) })) },
        answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' },
      },
    ];
    const keyByVersion = new Map();
    for (const [index, definition] of definitions.entries()) {
      const receipt = await questions.createQuestionDraft(fixture.principals.author, randomUUID(), {
        schemaVersion: 'question/3', language: 'vi-VN', section: 'MATH',
        taxonomyVersionId: template.taxonomyVersionId, domainId: template.domainId,
        skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
        content: text(`Original synthetic ${definition.type} fixture ${index + 1}; unofficial technical practice.`),
        interaction: definition.interaction, answerKey: definition.answerKey,
        explanation: text(`CLOZE_MATCHING_PRIVATE_${definition.type}_${index + 1}`),
        stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
      });
      const draft = receipt.body;
      if (receipt.status !== 201 || !draft?.versionId) throw new Error(`Cloze/matching fixture draft failed: ${definition.type}`);
      await workflow.submitReview(fixture.principals.author, draft.versionId, randomUUID(), { expectedRevision: 1 });
      await workflow.confirmSingleton(fixture.principals.reviewer, draft.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: draft.contentHash, reason: 'Original disposable cloze/matching fixture singleton.',
      });
      await workflow.review(fixture.principals.reviewer, draft.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: draft.contentHash, decision: 'APPROVE', rubric: { ...RUBRIC },
        reason: 'Original synthetic technical fixture; not human corpus approval.',
      });
      keyByVersion.set(draft.versionId, structuredClone(definition.answerKey));
    }

    const config = structuredClone(fixture.blueprint.config);
    Object.assign(config, {
      schemaVersion: 'blueprint/4', name: 'Synthetic cloze and matching practice',
      scoringPolicy: 'practice-binary-v3',
      allowedTypes: [...new Set(['SINGLE_CHOICE', 'NUMERIC_RESPONSE', ...(includeLegacyGroups ? ['MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'] : []),
        'CLOZE', 'MATCHING'])],
    });
    config.sections = [{ ...config.sections[0], section: 'MATH', count: definitions.length, durationSeconds }];
    config.quotas = config.quotas.map((quota) => ({ ...quota, max: definitions.length }));
    const id = randomUUID(), versionId = randomUUID(), contentHash = jsonDigest(config);
    await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
    await fixture.pool.query(`INSERT INTO tsa.blueprint_versions
      (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/4',$4,$5)`,
    [versionId, id, config.taxonomyVersionId, config, contentHash]);
    await fixture.pool.query(`INSERT INTO tsa_private.cloze_matching_profiles(blueprint_version_id,blueprint_hash)
      VALUES($1,$2)`, [versionId, contentHash]);
    await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings
      (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
    await fixture.pool.query('UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1 WHERE blueprint_version_id=$1',
      [fixture.blueprint.versionId]);
    Object.assign(fixture, { blueprint: { id, versionId, config, contentHash }, questions: definitions, keyByVersion, workflow });
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
