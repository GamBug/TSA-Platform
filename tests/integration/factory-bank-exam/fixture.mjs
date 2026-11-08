import { createHash, randomUUID } from 'node:crypto';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { createFactoryImportService } from '../../../src/modules/bank/factory-import.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { generateDryRun, makeFixtureInput } from '../../../tools/question-factory/reading.mjs';
import { bankRequest, createBankHarness, loginActor } from '../bank/harness.mjs';

const COGNITIVE_LEVELS = ['M1', 'M2', 'M3'];
const LEVEL_COUNTS = Object.freeze({ M1: 8, M2: 6, M3: 6 });
const RUBRIC = Object.freeze(Object.fromEntries(
  ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true]),
));

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

async function principalFor(harness, actorKey) {
  const browser = await loginActor(harness, actorKey);
  const principal = await harness.identity.authenticate(new Request(harness.origin, {
    headers: { cookie: browser.cookies.join('; ') },
  }));
  if (!principal) throw new Error(`Synthetic ${actorKey} identity did not authenticate`);
  return { browser, principal };
}

async function createReadingTaxonomy(pool) {
  const taxonomyVersionId = randomUUID();
  const domainId = randomUUID();
  const skillId = randomUUID();
  const taxonomy = {
    schemaVersion: 'taxonomy/1',
    taxonomyVersionId,
    name: `Synthetic reading experiment taxonomy ${taxonomyVersionId}`,
    versionNo: 1,
    definitionHash: '',
    nodes: [
      { id: domainId, code: 'READING', kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: skillId, code: 'READING_REASONING', kind: 'SKILL', parentId: domainId, metadata: {} },
    ],
  };
  taxonomy.definitionHash = digest(taxonomy);
  await withTransaction(pool, async (client) => {
    await client.query(
      'INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)',
      [taxonomyVersionId, taxonomy.name, taxonomy.definitionHash],
    );
    await client.query(
      `INSERT INTO tsa.taxonomy_nodes(id,taxonomy_version_id,code,kind,parent_id,metadata)
       VALUES($1,$3,'READING','DOMAIN',NULL,'{}'::jsonb),
             ($2,$3,'READING_REASONING','SKILL',$1,'{}'::jsonb)`,
      [domainId, skillId, taxonomyVersionId],
    );
  });
  return taxonomy;
}

async function registerExperimentBlueprint(fixture) {
  const id = randomUUID();
  const versionId = randomUUID();
  const sectionId = 'reading-experiment';
  const config = {
    schemaVersion: 'blueprint/1',
    name: 'Bài thử nghiệm Đọc hiểu · 20 câu · 2 đoạn đọc (dữ liệu mẫu)',
    taxonomyVersionId: fixture.taxonomy.taxonomyVersionId,
    profileKind: 'INDEPENDENT_PRACTICE',
    evidenceIds: ['project-choice/reading20-two-passages'],
    sections: [{ id: sectionId, section: 'READING', count: 20, durationSeconds: 1800 }],
    allowedTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'],
    quotas: COGNITIVE_LEVELS.map((value) => ({
      sectionId,
      dimension: 'COGNITIVE_LEVEL',
      value,
      min: LEVEL_COUNTS[value],
      max: LEVEL_COUNTS[value],
    })),
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE',
    scoringPolicy: 'practice-binary-v1',
    releasePolicy: 'after-grade-v1',
  };
  const contentHash = digest(config);
  await withTransaction(fixture.pool, async (client) => {
    await client.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
    await client.query(
      `INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
       VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
      [versionId, id, fixture.taxonomy.taxonomyVersionId, JSON.stringify(config), contentHash],
    );
    await client.query(
      `INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
       VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`,
      [versionId],
    );
    await client.query(
      'INSERT INTO tsa_private.reading_experiment_profiles(blueprint_version_id,blueprint_hash) VALUES($1,$2)',
      [versionId, contentHash],
    );
  });
  return { id, versionId, contentHash, config };
}

async function materializeBundles(fixture) {
  const candidatesByStimulus = new Map();
  for (const candidate of fixture.package.candidates) {
    const group = candidatesByStimulus.get(candidate.question.stimulusVersionId) ?? [];
    group.push(candidate);
    candidatesByStimulus.set(candidate.question.stimulusVersionId, group);
  }
  if (candidatesByStimulus.size !== 2) throw new Error('Reading experiment fixture must have exactly two passage groups');
  const localStimuli = await fixture.pool.query(
    `SELECT external_id AS "externalId",local_id AS "localId"
       FROM tsa_private.factory_external_mappings
      WHERE producer_namespace=$1 AND external_kind='stimulus' ORDER BY external_id`,
    [fixture.package.producerNamespace],
  );
  const stimulusIds = new Map(localStimuli.rows.map((row) => [row.externalId, row.localId]));
  const bundles = [];
  for (const [externalStimulusId, unsorted] of candidatesByStimulus) {
    const candidates = [...unsorted].sort((left, right) => left.candidateOrdinal - right.candidateOrdinal);
    if (candidates.length !== 10 || candidates.some((candidate, index) => candidate.candidateOrdinal !== index)) {
      throw new Error('Each reading passage must have one ordered ten-question bundle');
    }
    const quota = Object.fromEntries(COGNITIVE_LEVELS.map((level) => [level,
      candidates.filter((candidate) => candidate.question.cognitiveLevel === level).length,
    ]));
    if (quota.M1 !== 4 || quota.M2 !== 3 || quota.M3 !== 3) {
      throw new Error('Each reading passage must satisfy the project-selected 4:3:3 cognitive quota');
    }
    const stimulusVersionId = stimulusIds.get(externalStimulusId);
    if (!stimulusVersionId) throw new Error('Factory import did not map the passage stimulus');
    const bundle = {
      id: randomUUID(),
      externalStimulusId,
      stimulusVersionId,
      questionVersionIds: candidates.map((candidate) => candidate.question.id),
      cognitiveQuota: quota,
    };
    await withTransaction(fixture.pool, async (client) => {
      await client.query('INSERT INTO tsa.bundles(id,stimulus_version_id,content_hash) VALUES($1,$2,$3)',
        [bundle.id, stimulusVersionId, digest(bundle.questionVersionIds)]);
      for (const [ordinal, questionVersionId] of bundle.questionVersionIds.entries()) {
        await client.query('INSERT INTO tsa.bundle_members(bundle_id,question_version_id,ordinal) VALUES($1,$2,$3)',
          [bundle.id, questionVersionId, ordinal]);
      }
    });
    bundles.push(bundle);
  }
  return bundles.sort((left, right) => left.externalStimulusId.localeCompare(right.externalStimulusId));
}

async function addManagerRights(fixture) {
  const sourceIds = fixture.input.sources.map((source) => source.sourceVersionId);
  const mappings = await fixture.pool.query(
    `SELECT external_id AS "externalId",local_id AS "localId"
       FROM tsa_private.factory_external_mappings
      WHERE producer_namespace=$1 AND external_kind='source'`,
    [fixture.package.producerNamespace],
  );
  const localBySource = new Map(mappings.rows.map((row) => [row.externalId, row.localId]));
  for (const sourceVersionId of sourceIds) {
    const localSourceVersionId = localBySource.get(sourceVersionId);
    if (!localSourceVersionId) throw new Error('Factory import did not map an input source version');
    const response = await bankRequest(fixture.harness, fixture.browsers.bankManager,
      `/api/v1/source-versions/${localSourceVersionId}/rights`, {
        method: 'POST',
        key: `reading-fixture-rights-${sourceVersionId}`,
        body: {
          status: 'OWNED',
          allowedUses: ['DISPLAY', 'ADAPT', 'GENERATE'],
          territory: ['VN'],
          validFrom: '2000-01-01T00:00:00Z',
          validTo: null,
          evidence: 'Synthetic test-only rights fixture; not a real rights attestation.',
          expectedRevision: 0,
        },
      });
    if (response.status !== 201) throw new Error(`Synthetic manager rights fixture failed (${response.status})`);
  }
  return true;
}

export async function createReadingFactoryFixture({ batchKey = `reading-fixture-${randomUUID()}`,
  generate = generateDryRun } = {}) {
  if (typeof generate !== 'function') throw new TypeError('A Reading package generator is required');
  const harness = await createBankHarness({ enableReviewContext: true, enableReviewEvidence: true });
  let examPool;
  let workerPool;
  let runtime;
  try {
    const pool = harness.database.pool;
    const actors = {};
    const principals = {};
    for (const actor of ['author', 'reviewer', 'bankManager', 'studentA', 'studentB', 'examManager']) {
      const session = await principalFor(harness, actor);
      actors[actor] = session.browser;
      principals[actor] = session.principal;
    }
    const suffix = randomUUID().replaceAll('-', '');
    const examRole = `reading_exam_${suffix}`;
    const workerRole = `reading_worker_${suffix}`;
    await pool.query(`CREATE ROLE ${examRole} LOGIN`);
    await pool.query(`GRANT tsa_exam TO ${examRole}`);
    await pool.query(`CREATE ROLE ${workerRole} LOGIN`);
    await pool.query(`GRANT tsa_exam_worker TO ${workerRole}`);
    examPool = createDatabasePool({ ...harness.database.connectionConfig, user: examRole }, {
      applicationName: 'tsa-reading-factory-exam-test', max: 6,
    });
    workerPool = createDatabasePool({ ...harness.database.connectionConfig, user: workerRole }, {
      applicationName: 'tsa-reading-factory-worker-test', max: 4,
    });

    const fixtureScopeId = randomUUID();
    await pool.query(`INSERT INTO tsa_private.bank_workflow_fixture_scope(scope_id,database_oid,postmaster_started_at)
      SELECT $1,oid,pg_postmaster_start_time() FROM pg_database WHERE datname=current_database()`, [fixtureScopeId]);
    const taxonomy = await createReadingTaxonomy(pool);
    const input = makeFixtureInput({ taxonomy, operatorId: principals.author.userId, batchKey });
    const dryRun = await generate(input);
    const internalCapability = Object.freeze({ purpose: 'disposable reading factory integration fixture' });
    const importer = await createFactoryImportService({
      bankPool: harness.bankPool,
      identityService: harness.identity,
      internalCapability,
    });
    const imported = await importer.importFactoryPackageV2(principals.author, dryRun.package, internalCapability);
    const replay = await importer.importFactoryPackageV2(principals.author, structuredClone(dryRun.package), internalCapability);
    if (!replay.replayed || JSON.stringify(replay.receipts) !== JSON.stringify(imported.receipts)) {
      throw new Error('Exact Factory package retry did not return its durable original receipts');
    }
    const blueprint = await registerExperimentBlueprint({ pool, taxonomy });

    const fixture = {
      harness,
      pool,
      bankPool: harness.bankPool,
      examPool,
      workerPool,
      identityService: harness.identity,
      principals,
      browsers: actors,
      fixtureScopeId,
      taxonomy,
      input,
      package: dryRun.package,
      report: dryRun.report,
      importReceipts: imported.receipts,
      replayedReceipts: replay.receipts,
      importer,
      blueprint,
      workflow: await createPublicationService({
        bankPool: harness.bankPool,
        identityService: harness.identity,
        fixtureScopeId,
      }),
      allocation: null,
      bundles: [],
      rightsService: null,
      runtime: null,
      async prepareDrafts() {
        if (this.preparedDrafts) return this.preparedDrafts;
        const sourceRightsBefore = await this.pool.query(
          `SELECT count(*)::int AS count FROM tsa.source_rights sr
             JOIN tsa_private.factory_external_mappings mapping ON mapping.local_id=sr.source_version_id
            WHERE mapping.producer_namespace=$1 AND mapping.external_kind='source'`,
          [this.package.producerNamespace],
        );
        if (sourceRightsBefore.rows[0].count !== 0) throw new Error('Factory import must not promote package rights claims');
        this.rightsService = await addManagerRights(this);
        const listResponse = await bankRequest(this.harness, this.browsers.author, '/api/v1/questions', {
          query: 'state=DRAFT&limit=100',
        });
        if (listResponse.status !== 200) throw new Error(`Draft queue request failed (${listResponse.status})`);
        const list = await listResponse.json();
        if (list.items.length !== 20) throw new Error(`Expected 20 imported drafts, received ${list.items.length}`);
        const contexts = [];
        for (const candidate of this.package.candidates) {
          const response = await bankRequest(this.harness, this.browsers.bankManager,
            `/api/v1/question-versions/${candidate.question.id}/review-context`);
          if (response.status !== 200) throw new Error(`Draft review context failed (${response.status}): ${JSON.stringify(await response.json())}; expected ${candidate.question.id}; listed ${list.items.map((item) => item.versionId).join(',')}`);
          const context = await response.json();
          if (context.version.versionId !== candidate.question.id
              || context.version.contentHash !== candidate.contentHash
              || context.workflow.state !== 'DRAFT') throw new Error('Review context did not pin the exact imported draft hash');
          contexts.push(context);
        }
        this.preparedDrafts = { listed: list.items, contexts, sourceRightsBeforeImport: sourceRightsBefore.rows[0].count };
        return this.preparedDrafts;
      },
      async materializeProfileAndBundles() {
        if (!this.bundles.length) this.bundles = await materializeBundles(this);
        this.allocation = createAllocationService({
          examPool: this.examPool, identityService: this.identityService, enableReadingExperiment: true,
        });
        return this.bundles;
      },
      async proveDraftsUnselectable() {
        await this.materializeProfileAndBundles();
        try {
          await this.allocation.create(this.principals.studentA, randomUUID(), {
            blueprintVersionId: this.blueprint.versionId,
          });
          throw new Error('Assembly selected unapproved Factory drafts');
        } catch (error) {
          if (error.message === 'Assembly selected unapproved Factory drafts') throw error;
          if (error.code !== 'INSUFFICIENT_ELIGIBLE_INVENTORY') throw error;
        }
        const writes = await this.pool.query(`SELECT
          (SELECT count(*)::int FROM tsa.forms) AS forms,
          (SELECT count(*)::int FROM tsa.attempts) AS attempts,
          (SELECT count(*)::int FROM tsa.student_question_history) AS history`);
        if (writes.rows[0].forms || writes.rows[0].attempts || writes.rows[0].history) {
          throw new Error('Draft inventory shortage wrote exam or history rows');
        }
        return { error: 'INSUFFICIENT_ELIGIBLE_INVENTORY', ...writes.rows[0] };
      },
      async submitReviewAndFixturePublish() {
        if (this.publishedQuestions) return this.publishedQuestions;
        await this.prepareDrafts();
        await this.materializeProfileAndBundles();
        const submitted = [];
        for (const candidate of this.package.candidates) {
          const response = await bankRequest(this.harness, this.browsers.author,
            `/api/v1/question-versions/${candidate.question.id}/submit-review`, {
              method: 'POST',
              key: `reading-submit-${candidate.question.id}`,
              body: { expectedRevision: 1 },
            });
          if (response.status !== 200) throw new Error(`Existing author review handoff failed (${response.status})`);
          submitted.push(await response.json());
        }
        const queueResponse = await bankRequest(this.harness, this.browsers.reviewer, '/api/v1/questions', {
          query: 'state=IN_REVIEW&limit=100',
        });
        if (queueResponse.status !== 200) throw new Error(`Existing reviewer queue failed (${queueResponse.status})`);
        const queue = await queueResponse.json();
        if (queue.items.length !== 20) throw new Error(`Expected 20 questions in review, received ${queue.items.length}`);
        const evidenceResponse = await bankRequest(this.harness, this.browsers.reviewer,
          `/api/v1/question-versions/${this.package.candidates[0].question.id}/review-evidence`);
        if (evidenceResponse.status !== 200 || (await evidenceResponse.json()).accessBasis !== 'REVIEW_QUEUE') {
          throw new Error('Existing reviewer evidence boundary was not available for the queued candidate');
        }
        const first = this.package.candidates[0];
        const normalApproval = await bankRequest(this.harness, this.browsers.reviewer,
          `/api/v1/question-versions/${first.question.id}/reviews`, {
            method: 'POST',
            key: `reading-normal-approval-block-${first.question.id}`,
            body: {
              expectedRevision: 2,
              contentHash: first.contentHash,
              decision: 'APPROVE',
              rubric: { ...RUBRIC },
              reason: 'This normal-runtime approval is intentionally required to stay disabled.',
            },
          });
        const normalApprovalBody = await normalApproval.json();
        if (normalApproval.status !== 403 || !['FORBIDDEN', 'PUBLICATION_DISABLED'].includes(normalApprovalBody.error.code)) {
          throw new Error(`The ordinary Bank HTTP route returned ${normalApproval.status}: ${JSON.stringify(normalApprovalBody)}`);
        }

        const approvals = [];
        for (const candidate of this.package.candidates) {
          await this.workflow.confirmSingleton(this.principals.reviewer, candidate.question.id,
            `reading-singleton-${candidate.question.id}`, {
              expectedRevision: 2,
              contentHash: candidate.contentHash,
              reason: 'Disposable engineering singleton evidence; not a qualified human equivalence review.',
            });
          approvals.push(await this.workflow.review(this.principals.reviewer, candidate.question.id,
            `reading-fixture-publication-${candidate.question.id}`, {
              expectedRevision: 2,
              contentHash: candidate.contentHash,
              decision: 'APPROVE',
              rubric: { ...RUBRIC },
              reason: 'Synthetic test-only fixture gate; not a human content approval.',
            }));
        }
        const states = await this.pool.query(`SELECT qw.state::text AS state, count(*)::int AS count
          FROM tsa.question_workflow qw JOIN tsa_private.factory_import_receipts receipt
            ON receipt.question_version_id=qw.question_version_id
          WHERE receipt.producer_namespace=$1 AND receipt.batch_key=$2 GROUP BY qw.state`,
        [this.package.producerNamespace, this.package.batchKey]);
        if (states.rowCount !== 1 || states.rows[0].state !== 'APPROVED' || states.rows[0].count !== 20) {
          throw new Error('Synthetic fixture publication did not approve the exact 20 imported versions');
        }
        this.publishedQuestions = approvals;
        this.reviewHandoffReceipts = submitted;
        return approvals;
      },
      async startStudentRuntime() {
        if (this.runtime) return this.runtime;
        if (!this.publishedQuestions) await this.submitReviewAndFixturePublish();
        this.runtime = await createStudentRuntime({
          identityPool: this.harness.authPool,
          examPool: this.examPool,
          workerPool: this.workerPool,
          env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' },
          port: 0,
          pollMilliseconds: 20,
          sweepBatchSize: 10,
          executorId: `reading-factory-demo-${randomUUID()}`,
          leaseSeconds: 30,
          retrySeconds: 1,
          enableReadingExperiment: true,
          createRate: { capacity: 100, refillPerSecond: 10 },
          saveRate: {
            user: { capacity: 100, refillPerSecond: 10 },
            attempt: { capacity: 100, refillPerSecond: 10 },
          },
        });
        return this.runtime;
      },
      session() {
        const jar = new Map();
        const requests = [];
        const fetchImpl = async (pathname, options = {}) => {
          const headers = new Headers(options.headers);
          headers.set('origin', this.runtime.origin);
          if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
          const parsed = new URL(pathname, this.runtime.origin);
          requests.push({ pathname: parsed.pathname, method: (options.method ?? 'GET').toUpperCase(),
            idempotencyKey: headers.get('idempotency-key') });
          const response = await fetch(new URL(pathname, this.runtime.origin), { ...options, headers });
          for (const line of response.headers.getSetCookie()) {
            const pair = line.split(';', 1)[0];
            const index = pair.indexOf('=');
            if (pair.slice(index + 1)) jar.set(pair.slice(0, index), pair.slice(index + 1));
            else jar.delete(pair.slice(0, index));
          }
          return response;
        };
        return { fetchImpl, requests, csrfToken: () => jar.get('tsa_local_csrf'),
          api: () => createPersistentApi({ fetchImpl, readCookie: (key) => jar.get(key) }) };
      },
      async close() {
        const errors = [];
        for (const stop of [() => this.runtime?.close(), () => this.workerPool?.end(),
          () => this.examPool?.end(), () => this.harness.close()]) {
          try { await stop(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Reading Factory demo cleanup failed');
      },
    };
    fixture.allocation = createAllocationService({ examPool, identityService: harness.identity });
    const changedInput = structuredClone(input);
    changedInput.sources[0].title += ' changed under the same identity';
    const changedPackage = (await generateDryRun(changedInput)).package;
    let importConflict;
    try {
      await importer.importFactoryPackageV2(principals.author, changedPackage, internalCapability);
    } catch (error) {
      importConflict = error;
    }
    if (importConflict?.code !== 'IMPORT_CONFLICT') throw new Error('Changed same-key import was not rejected as a conflict');
    fixture.sameKeyConflict = importConflict.code;
    fixture.taxonomyReference = taxonomy;
    return fixture;
  } catch (error) {
    if (runtime) await runtime.close().catch(() => {});
    if (workerPool) await workerPool.end().catch(() => {});
    if (examPool) await examPool.end().catch(() => {});
    await harness.close().catch(() => {});
    throw error;
  }
}

export function expectedAnswer(candidate) {
  const key = candidate.question.private.answerKey;
  if (key.type === 'TRUE_FALSE_GROUP') {
    return { type: key.type, values: { ...key.values } };
  }
  if (key.type === 'MULTIPLE_CHOICE') {
    return { type: key.type, optionIds: [...key.optionIds] };
  }
  return { type: key.type, optionId: key.optionId };
}

export function publicFieldNamesForbidden() {
  return new Set([
    'answerKey', 'correctAnswer', 'explanation', 'provenance', 'generationRunId',
    'evidence', 'evidenceRefs', 'contentHash', 'privateHash', 'keySnapshot',
    'sourceVersionId', 'provenanceIds', 'reviewerId', 'manifest',
  ]);
}
