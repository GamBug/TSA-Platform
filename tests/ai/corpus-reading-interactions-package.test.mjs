import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readReadingInteractionCorpus } from '../../tools/corpus-ingest/reading-interactions.mjs';
import { buildCorpusReadingInteractionPackage } from '../../tools/corpus-ingest/reading-interactions-package.mjs';
import {
  computeQuestionIdentity,
  createReferenceHash,
  parseManualFactoryPackageV3,
  parseManualFactoryPackageV4,
} from '../../packages/contracts/dist/internal.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const sourceRoot = join(process.cwd(), 'TSA_Example_Questions');

function taxonomy() {
  return {
    schemaVersion: 'taxonomy/1',
    taxonomyVersionId: id(100),
    name: 'Test Reading taxonomy',
    versionNo: 1,
    definitionHash: `sha256:${'a'.repeat(64)}`,
    nodes: [
      { id: id(101), code: 'READING', kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: id(102), code: 'READING_REASONING', kind: 'SKILL', parentId: id(101), metadata: {} },
    ],
  };
}

async function buildGroupPackage() {
  const corpus = await readReadingInteractionCorpus(sourceRoot);
  const group = corpus.selected[0];
  const deferred = corpus.deferred.find((candidate) => candidate.passageId === group.passageId).items;
  const parent = await mkdtemp(join(tmpdir(), 'tsa-interactions-package-'));
  const output = join(parent, 'private-group');
  try {
    const result = await buildCorpusReadingInteractionPackage({
      group, deferred, taxonomy: taxonomy(), authorId: id(103), directory: output,
    });
    return { result, parent, group };
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

function questionRoots(question) {
  return [
    { kind: 'taxonomy', id: question.taxonomyVersionId },
    ...(question.stimulusVersionId ? [{ kind: 'stimulus', id: question.stimulusVersionId }] : []),
    ...question.provenanceIds.map((id) => ({ kind: 'provenance', id })),
    ...question.private.evidenceRefs.map((id) => ({ kind: 'evidence', id })),
  ];
}

function rehashPackage(pkg) {
  const key = (value) => `${value.kind}\0${value.id}`;
  const byKey = new Map(pkg.references.map((node) => [key(node), node]));
  const visiting = new Set();
  const done = new Set();
  const visit = (node) => {
    const nodeKey = key(node);
    if (done.has(nodeKey)) return node.contentHash;
    assert.equal(visiting.has(nodeKey), false, 'test fixture graph must be acyclic');
    visiting.add(nodeKey);
    const references = node.references.map((reference) => {
      const target = byKey.get(key(reference));
      assert.ok(target);
      return { ...reference, contentHash: visit(target) };
    });
    node.contentHash = createReferenceHash({ kind: node.kind, id: node.id, payload: node.payload, references });
    visiting.delete(nodeKey);
    done.add(nodeKey);
    return node.contentHash;
  };
  pkg.references.forEach(visit);
  for (const candidate of pkg.candidates) {
    const reachable = new Set();
    const follow = (reference) => {
      const nodeKey = key(reference);
      if (reachable.has(nodeKey)) return;
      reachable.add(nodeKey);
      const node = byKey.get(nodeKey);
      assert.ok(node);
      node.references.forEach(follow);
    };
    questionRoots(candidate.question).forEach(follow);
    const closure = pkg.references.filter((node) => reachable.has(key(node)));
    const identity = computeQuestionIdentity(candidate.question, closure);
    candidate.contentHash = identity.contentHash;
    candidate.question.contentHash = identity.contentHash;
    for (const validation of candidate.validations) validation.inputHash = identity.contentHash;
  }
}

test('an actual seven or eight item group round-trips through private package/4 artifacts', async (context) => {
  const { result, parent, group } = await buildGroupPackage();
  context.after(() => rm(parent, { recursive: true, force: true }));

  const parsed = parseManualFactoryPackageV4(JSON.stringify(result.package));
  assert.equal(parsed.schemaVersion, 'factory-package/4');
  assert.equal(parsed.profile, 'corpus-reading-interactions-draft/1');
  assert.equal(parsed.candidates.length, group.items.length);
  assert.ok([7, 8].includes(parsed.candidates.length));
  assert.ok(parsed.candidates.every((candidate) => candidate.question.schemaVersion === 'question/3'
    && candidate.question.private.scoringPolicy === 'practice-binary-v3'));
  assert.equal(parsed.manualRun.kind, 'DETERMINISTIC_CORPUS_EXTRACTION');
  assert.equal(parsed.sourceAuthoring[0].kind, 'CORPUS_IMPORTED');
  assert.equal(parsed.sourceAuthoring[0].scientificVerification, 'UNVERIFIED');
  assert.equal(parsed.sourcePermissions[0].copyrightVerification, 'UNVERIFIED');
  assert.equal(parsed.sourcePermissions[0].publicationPermission, false);

  const evidence = parsed.candidates.map((candidate) => parsed.references.find((node) => node.id
    === candidate.question.private.evidenceRefs[1]).payload);
  assert.ok(evidence.every((item) => item.classification === 'PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION'));
  for (const item of group.items) {
    if (item.type === 'MULTIPLE_CHOICE') assert.ok(item.private.adaptationFlags.includes('MULTIPLE_CHOICE_SELECTION_RANGE_NOT_CAPTURED'));
    if (item.type === 'MATCHING') {
      assert.ok(item.private.adaptationFlags.includes('MATCHING_TARGET_POOL_DERIVED_FROM_CAPTURED_CORRECT_TEXTS'));
      assert.ok(item.private.adaptationFlags.includes('MATCHING_TARGET_REUSE_MAXIMUM_SET_TO_ROW_COUNT'));
    }
  }
  assert.equal((await stat(result.directory)).mode & 0o777, 0o700);
  assert.equal((await stat(result.packagePath)).mode & 0o777, 0o600);
  for (const path of [...Object.values(result.artifactPaths), result.packagePath]) {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.ok(!path.split('/').includes('public'));
  }
  assert.equal(JSON.parse(await readFile(result.artifactPaths.response, 'utf8')).questions.length, group.items.length);
});

test('package parsing rejects altered candidates, private keys, adaptation evidence, and raw artifacts', async (context) => {
  const { result, parent } = await buildGroupPackage();
  context.after(() => rm(parent, { recursive: true, force: true }));

  const answerTamper = structuredClone(result.package);
  const first = answerTamper.candidates[0].question;
  first.content[0].text += ' altered';
  rehashPackage(answerTamper);
  assert.throws(() => parseManualFactoryPackageV4(answerTamper), /Raw projection or typed graph mismatch/);

  const keyTamper = structuredClone(result.package);
  const choice = keyTamper.candidates.find((candidate) => candidate.question.interaction.type === 'SINGLE_CHOICE');
  const options = choice.question.interaction.options.map((option) => option.id);
  choice.question.private.answerKey.optionId = options.find((optionId) => optionId !== choice.question.private.answerKey.optionId);
  rehashPackage(keyTamper);
  assert.throws(() => parseManualFactoryPackageV4(keyTamper), /Raw projection or typed graph mismatch/);

  const metadataTamper = structuredClone(result.package);
  const matching = metadataTamper.candidates.find((candidate) => candidate.question.interaction.type === 'MATCHING');
  const evidenceNode = metadataTamper.references.find((node) => node.id === matching.question.private.evidenceRefs[1]);
  evidenceNode.payload.adaptationFlags = [];
  rehashPackage(metadataTamper);
  assert.throws(() => parseManualFactoryPackageV4(metadataTamper), /Raw projection or typed graph mismatch/);

  const rawTamper = structuredClone(result.package);
  const responseRef = rawTamper.manualRun.artifactRefs.response;
  const responseArtifact = rawTamper.references.find((node) => node.id === responseRef.id);
  responseArtifact.payload.bytesBase64 = Buffer.from('{"questions":[]}').toString('base64');
  assert.throws(() => parseManualFactoryPackageV4(rawTamper), /Raw artifact mismatch/);

  assert.throws(() => parseManualFactoryPackageV3(result.package));
});
