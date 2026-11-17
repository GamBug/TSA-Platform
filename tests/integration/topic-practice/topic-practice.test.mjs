import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createStudentDirectoryService } from '../../../src/modules/attempts/directory.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createTopicPracticeService } from '../../../src/modules/topic-practice/service.mjs';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDomainStudentFixture } from '../student-runtime/domain-fixture.mjs';

const rate = Object.freeze({ capacity: 100, refillPerSecond: 10 });

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test('topic catalog and selected practice stay owner scoped and use the existing attempt lifecycle', { timeout: 60_000 }, async (t) => {
  const fixture = await createDomainStudentFixture();
  let workerPool;
  let runtime;
  t.after(async () => {
    const failures = [];
    for (const close of [() => runtime?.close(), () => workerPool?.end(), () => fixture.close()]) {
      try { await close(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Topic practice fixture cleanup failed');
  });

  const topicPractice = createTopicPracticeService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: rate,
  });
  const attempts = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: rate,
    saveRate: { user: rate, attempt: rate },
    enableTopicPractice: true,
  });
  const directory = createStudentDirectoryService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
  });
  const studentA = fixture.principals.studentA;
  const studentB = fixture.principals.studentB;

  await expectCode(topicPractice.catalog(null), 'UNAUTHENTICATED');

  const catalogA = await topicPractice.catalog(studentA, { durationSeconds: 360 });
  const math = catalogA.groups.find((group) => group.code === 'MATH');
  const reading = catalogA.groups.find((group) => group.code === 'READING');
  const science = catalogA.groups.find((group) => group.code === 'SCIENCE');
  assert.ok(math && reading && science, 'the catalog includes each real fixture taxonomy');
  assert.deepEqual([math.eligibleCount, reading.eligibleCount, science.eligibleCount], [4, 2, 4]);
  assert.deepEqual([math.attemptedCount, reading.attemptedCount, science.attemptedCount], [0, 0, 0]);
  assert.ok(math.children.some((child) => child.kind === 'SKILL' && child.eligibleCount === 4));

  const mathSkill = math.children.find((child) => child.kind === 'SKILL');
  const topicRequest = {
    taxonomyVersionId: math.taxonomyVersionId,
    // Selecting the parent and its child must deduplicate the same eligible questions.
    topicIds: [math.id, mathSkill.id],
    questionCount: 4,
    durationSeconds: 360,
  };
  const key = randomUUID();
  const created = await topicPractice.create(studentA, key, topicRequest);
  assert.equal(created.status, 201);
  assert.equal(created.body.state, 'CREATED');
  assert.equal(created.body.practiceProfile.taxonomyVersionId, topicRequest.taxonomyVersionId);
  assert.deepEqual(created.body.practiceProfile.topicIds, [...topicRequest.topicIds].sort());
  assert.equal(created.body.practiceProfile.questionCount, 4);
  assert.equal(created.body.practiceProfile.durationSeconds, 360);
  assert.equal(created.body.practiceProfile.topicPractice, true);

  const replay = await topicPractice.create(studentA, key, topicRequest);
  assert.deepEqual(replay.body, created.body, 'the same key and body reuse the persisted attempt/profile');
  await expectCode(topicPractice.create(studentA, key, {
    ...topicRequest,
    questionCount: 3,
  }), 'IDEMPOTENCY_CONFLICT');

  await expectCode(topicPractice.create(studentA, randomUUID(), {
    ...topicRequest,
    topicIds: [],
  }), 'VALIDATION_ERROR');
  await expectCode(topicPractice.create(studentA, randomUUID(), {
    ...topicRequest,
    questionCount: 0,
  }), 'VALIDATION_ERROR');
  await expectCode(topicPractice.create(studentA, randomUUID(), {
    ...topicRequest,
    topicIds: [randomUUID()],
  }), 'VALIDATION_ERROR');
  await expectCode(topicPractice.create(studentA, randomUUID(), {
    ...topicRequest,
    topicIds: [reading.id],
  }), 'VALIDATION_ERROR');

  const ownHistory = await fixture.pool.query(
    'SELECT count(*)::integer AS count FROM tsa.student_question_history WHERE user_id=$1',
    [studentA.userId],
  );
  assert.equal(ownHistory.rows[0].count, 4, 'NEW_ONLY assignment records all selected questions in history');

  const topicCatalogA = await topicPractice.catalog(studentA, { durationSeconds: 360 });
  assert.equal(topicCatalogA.groups.find((group) => group.id === math.id).attemptedCount, 0,
    'assignment history alone does not expose graded progress');
  const ordinaryCatalog = await directory.catalog(studentA);
  assert.ok(!ordinaryCatalog.items.some((item) => item.blueprintVersionId === created.body.practiceProfile.blueprintVersionId),
    'the private topic profile is absent from the ordinary blueprint catalog');

  assert.equal(await attempts.read(studentB, created.body.attemptId), null,
    'another student cannot read the created attempt by its identifier');
  await expectCode(attempts.create(studentB, randomUUID(), {
    blueprintVersionId: created.body.practiceProfile.blueprintVersionId,
  }), 'FORBIDDEN');

  const catalogB = await topicPractice.catalog(studentB, { durationSeconds: 360 });
  const mathForB = catalogB.groups.find((group) => group.id === math.id);
  assert.equal(mathForB.eligibleCount, 4);
  assert.equal(mathForB.attemptedCount, 0, 'catalog progress is isolated to the requesting student');
  const createdForB = await topicPractice.create(studentB, randomUUID(), {
    ...topicRequest,
    topicIds: [mathSkill.id],
  });
  assert.equal(createdForB.body.state, 'CREATED', 'another student has independent NEW_ONLY inventory');
  assert.notEqual(createdForB.body.practiceProfile.blueprintVersionId, created.body.practiceProfile.blueprintVersionId,
    'each owner receives a distinct private profile');

  await fixture.pool.query('CREATE ROLE topic_practice_worker LOGIN');
  await fixture.pool.query('GRANT tsa_exam_worker TO topic_practice_worker');
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: 'topic_practice_worker' }, {
    applicationName: 'tsa-topic-practice-test',
    max: 3,
  });
  runtime = await createStudentRuntime({
    identityPool: fixture.harness.authPool,
    examPool: fixture.examPool,
    workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' },
    port: 0,
    pollMilliseconds: 20,
    sweepBatchSize: 10,
    executorId: 'topic-practice-integration-test',
    leaseSeconds: 30,
    retrySeconds: 1,
    createRate: rate,
    saveRate: { user: rate, attempt: rate },
  });

  await attempts.start(studentA, created.body.attemptId, randomUUID(), {});
  const started = await attempts.read(studentA, created.body.attemptId);
  assert.equal(started.state, 'IN_PROGRESS');
  assert.equal(started.slots.length, 4);
  assert.equal(Date.parse(started.deadlineAt) - Date.parse(started.startedAt), 360_000,
    'the attempt lifecycle uses the server-validated topic duration');
  for (const slot of started.slots) {
    const value = slot.interaction.type === 'MULTIPLE_CHOICE'
      ? { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'c'] }
      : slot.interaction.type === 'TRUE_FALSE_GROUP'
        ? { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } }
        : { type: 'SINGLE_CHOICE', optionId: 'b' };
    await attempts.save(studentA, created.body.attemptId, slot.slotId, randomUUID(), {
      expectedRevision: 0,
      value,
    });
  }
  await attempts.submit(studentA, created.body.attemptId, randomUUID(), {});

  const deadline = Date.now() + 8_000;
  let graded;
  do {
    graded = await attempts.read(studentA, created.body.attemptId);
    if (graded.state === 'GRADED') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  assert.equal(graded.state, 'GRADED');

  await assert.rejects(topicPractice.create(studentA, randomUUID(), topicRequest), (error) => {
    assert.equal(error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
    assert.equal(error.details.availableQuestionCount, 0);
    assert.equal(error.details.requestedCount, 4);
    return true;
  });

  const releasedCatalog = await topicPractice.catalog(studentA, { durationSeconds: 360 });
  const releasedMath = releasedCatalog.groups.find((group) => group.id === math.id);
  assert.equal(releasedMath.attemptedCount, 4);
  assert.equal(releasedMath.accuracy, 100);
  const studentBCatalog = await topicPractice.catalog(studentB, { durationSeconds: 360 });
  assert.equal(studentBCatalog.groups.find((group) => group.id === math.id).attemptedCount, 0,
    'released graded progress is not visible to another student');
});
