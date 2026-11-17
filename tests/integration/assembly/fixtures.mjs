import { randomUUID, createHash } from 'node:crypto';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { createBankHarness, loginActor, bankRequest } from '../bank/harness.mjs';
import { ensureLocalTaxonomy, createPrivateTemplate, LOCAL_TAXONOMY } from '../../../src/local/seed.mjs';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';

const RUBRIC = Object.freeze(Object.fromEntries(
  ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true]),
));

function key(prefix) { return `${prefix}-${randomUUID()}`; }

async function authenticate(harness, browser) {
  return harness.identity.authenticate(new Request(harness.origin, {
    headers: { cookie: browser.cookies.join('; ') },
  }));
}

async function post(harness, browser, path, body) {
  const response = await bankRequest(harness, browser, path, {
    method: 'POST', key: key('assembly-fixture'), body,
  });
  const payload = await response.json();
  if (response.status !== 201) throw new Error(`Assembly fixture request failed (${response.status}): ${payload.error?.code ?? 'unknown'}`);
  return payload;
}

async function registerSource(fixture, { validTo = null } = {}) {
  const { harness, browsers } = fixture;
  const source = await post(harness, browsers.author, '/api/v1/sources', {
    title: `Synthetic allocation source ${randomUUID()}`,
    canonicalUri: null,
    origin: 'OWNED',
  });
  const sourceVersion = await post(harness, browsers.author, `/api/v1/sources/${source.sourceId}/versions`, {
    contentHash: `sha256:${randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64)}`,
    evidenceUri: 'manual://synthetic-allocation-fixture',
    metadata: { syntheticOnly: 'true' },
  });
  const rights = await post(harness, browsers.bankManager, `/api/v1/source-versions/${sourceVersion.sourceVersionId}/rights`, {
    status: 'OWNED',
    allowedUses: ['DISPLAY', 'ADAPT'],
    territory: ['VN'],
    validFrom: '2000-01-01T00:00:00Z',
    validTo,
    evidence: 'Synthetic local fixture; not a real rights attestation.',
    expectedRevision: 0,
  });
  return {
    sourceId: source.sourceId,
    sourceVersionId: sourceVersion.sourceVersionId,
    decisionId: rights.decisionId,
  };
}

async function createQuestion(fixture, source, label = randomUUID()) {
  const { harness, browsers, principals, workflow } = fixture;
  const template = createPrivateTemplate(source);
  const draft = await post(harness, browsers.author, '/api/v1/questions', {
    schemaVersion: 'question/1',
    language: 'vi-VN',
    section: 'MATH',
    taxonomyVersionId: template.taxonomyVersionId,
    domainId: template.domainId,
    skillIds: template.skillIds,
    subskillIds: [],
    cognitiveLevel: null,
    targetDifficulty: 'EASY',
    content: [{ type: 'text', text: `Synthetic allocation candidate ${label}` }],
    interaction: privateQuestionFixture.interaction,
    answerKey: privateQuestionFixture.private.answerKey,
    explanation: privateQuestionFixture.private.explanation,
    stimulusVersionId: null,
    evidenceRefs: template.evidenceRefs,
    origin: 'MANUAL',
    provenance: template.provenance,
  });
  await workflow.submitReview(principals.author, draft.versionId, key('allocation-submit'), { expectedRevision: 1 });
  await workflow.confirmSingleton(principals.reviewer, draft.versionId, key('allocation-singleton'), {
    expectedRevision: 2,
    contentHash: draft.contentHash,
    reason: 'Synthetic fixture exact-version singleton decision.',
  });
  await workflow.review(principals.reviewer, draft.versionId, key('allocation-approve'), {
    expectedRevision: 2,
    contentHash: draft.contentHash,
    decision: 'APPROVE',
    rubric: { ...RUBRIC },
    reason: 'Synthetic test approval; not human content review.',
  });
  return { ...draft, source };
}

async function createQuestionVersion(fixture, parent, label = randomUUID()) {
  const { harness, browsers, principals, workflow } = fixture;
  const template = createPrivateTemplate(parent.source);
  const draft = await post(harness, browsers.author, `/api/v1/questions/${parent.questionId}/versions`, {
    parentVersionId: parent.versionId,
    draft: {
      schemaVersion: 'question/1',
      language: 'vi-VN',
      section: 'MATH',
      taxonomyVersionId: template.taxonomyVersionId,
      domainId: template.domainId,
      skillIds: template.skillIds,
      subskillIds: [],
      cognitiveLevel: null,
      targetDifficulty: 'EASY',
      content: [{ type: 'text', text: `Synthetic corrected allocation candidate ${label}` }],
      interaction: privateQuestionFixture.interaction,
      answerKey: privateQuestionFixture.private.answerKey,
      explanation: privateQuestionFixture.private.explanation,
      stimulusVersionId: null,
      evidenceRefs: template.evidenceRefs,
      origin: 'MANUAL',
      provenance: template.provenance,
    },
  });
  await workflow.submitReview(principals.author, draft.versionId, key('allocation-correction-submit'), { expectedRevision: 1 });
  await workflow.confirmSingleton(principals.reviewer, draft.versionId, key('allocation-correction-singleton'), {
    expectedRevision: 2,
    contentHash: draft.contentHash,
    reason: 'Synthetic fixture exact-version singleton decision for a correction.',
  });
  await workflow.review(principals.reviewer, draft.versionId, key('allocation-correction-approve'), {
    expectedRevision: 2,
    contentHash: draft.contentHash,
    decision: 'APPROVE',
    rubric: { ...RUBRIC },
    reason: 'Synthetic correction approval; not human content review.',
  });
  return { ...draft, source: parent.source };
}

async function createBlueprint(fixture, {
  count = 1,
  section = 'MATH',
  availableFrom = new Date(Date.now() - 3_600_000),
  availableUntil = new Date(Date.now() + 86_400_000),
  startTtlSeconds = 600,
  minSkillCount = 1,
} = {}) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = {
    schemaVersion: 'blueprint/1',
    name: `Synthetic allocation blueprint ${id}`,
    taxonomyVersionId: LOCAL_TAXONOMY.taxonomyVersionId,
    profileKind: 'INDEPENDENT_PRACTICE',
    evidenceIds: ['synthetic-allocation-fixture'],
    sections: [{ id: 'allocation-section', section, count, durationSeconds: 600 }],
    allowedTypes: ['SINGLE_CHOICE'],
    quotas: [{ sectionId: 'allocation-section', dimension: 'SKILL', value: LOCAL_TAXONOMY.skillId, min: minSkillCount, max: count }],
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE',
    scoringPolicy: 'practice-binary-v1',
    releasePolicy: 'after-grade-v1',
  };
  const contentHash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
  await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
  [versionId, id, LOCAL_TAXONOMY.taxonomyVersionId, JSON.stringify(config), contentHash]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings
    (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,$2,$3,$4)`, [versionId, availableFrom, availableUntil, startTtlSeconds]);
  return { id, versionId, contentHash, config };
}

export async function createAllocationFixture({
  questionCount = 12,
  blueprintCount = 4,
  blueprintOptions = {},
  sourceOptions = {},
  migrationDirectory,
} = {}) {
  const harness = await createBankHarness({ migrationDirectory });
  let examPool;
  try {
    await ensureLocalTaxonomy(harness.database.pool);
    await harness.database.pool.query('CREATE ROLE exam_runtime LOGIN');
    await harness.database.pool.query('GRANT tsa_exam TO exam_runtime');
    examPool = createDatabasePool({ ...harness.database.connectionConfig, user: 'exam_runtime' }, {
      applicationName: 'tsa-allocation-exam-test',
      max: 6,
    });

    const actors = ['author', 'reviewer', 'bankManager', 'studentA', 'studentB', 'examManager'];
    const browsers = {};
    const principals = {};
    for (const actor of actors) browsers[actor] = await loginActor(harness, actor);
    for (const actor of actors) principals[actor] = await authenticate(harness, browsers[actor]);

    const fixtureScopeId = randomUUID();
    await harness.database.pool.query(`INSERT INTO tsa_private.bank_workflow_fixture_scope
      (scope_id,database_oid,postmaster_started_at)
      SELECT $1,oid,pg_postmaster_start_time() FROM pg_database WHERE datname=current_database()`, [fixtureScopeId]);
    const workflow = await createPublicationService({
      bankPool: harness.bankPool,
      identityService: harness.identity,
      fixtureScopeId,
    });
    const fixture = {
      harness,
      pool: harness.database.pool,
      bankPool: harness.bankPool,
      examPool,
      identityService: harness.identity,
      principals,
      browsers,
      workflow,
      fixtureScopeId,
    };

    const source = await registerSource(fixture, sourceOptions);
    const questions = await Promise.all(Array.from({ length: questionCount }, (_, index) =>
      createQuestion(fixture, source, `${index + 1}-${randomUUID()}`)));
    const blueprint = await createBlueprint(fixture, { count: blueprintCount, ...blueprintOptions });
    Object.assign(fixture, { source, questions, blueprint });
    fixture.registerSource = (options) => registerSource(fixture, options);
    fixture.createQuestion = (questionSource = source, label) => createQuestion(fixture, questionSource, label);
    fixture.createQuestionVersion = (parent, label) => createQuestionVersion(fixture, parent, label);
    fixture.createBlueprint = (options) => createBlueprint(fixture, options);
    fixture.close = async () => {
      await examPool.end();
      await harness.close();
    };
    return fixture;
  } catch (error) {
    if (examPool) await examPool.end().catch(() => {});
    await harness.close().catch(() => {});
    throw error;
  }
}
