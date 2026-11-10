import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  buildManualFactoryPackageV4,
  CORPUS_INTERACTIONS_TRANSFORMATION,
  ManualResponseV4Schema,
  digestManualCanonicalV4,
} from '../../packages/contracts/dist/internal.js';
import { CORPUS_PERMISSION, createPrivateOutputDirectory } from './reading-package.mjs';

const EXPLANATION_ABSENT = 'No explanation retained in the source capture. Owner review required.';
const EVIDENCE_RATIONALE = 'Whole source passage retained for review; no answer entailment or cognition claim is made.';
const producerNamespace = 'tsa.corpus.reading.interactions.v1';

function nodeMapping(taxonomy) {
  return taxonomy.nodes.map((node) => ({
    stagingCode: node.code,
    stagingKind: node.kind,
    registeredNodeId: node.id,
    registeredCode: node.code,
    registeredKind: node.kind,
    parentCode: node.kind === 'DOMAIN' ? null : 'READING',
    section: 'READING',
  }));
}

export async function buildCorpusReadingInteractionPackage({ group, deferred, taxonomy, authorId, directory }) {
  if (!group || !Array.isArray(group.items) || ![7, 8].includes(group.items.length)
      || !Array.isArray(deferred) || deferred.length !== 10 - group.items.length
      || !taxonomy || !Array.isArray(taxonomy.nodes) || typeof authorId !== 'string' || !directory) {
    throw new TypeError('A keyed Reading passage group, its deferred captures, taxonomy, author, and output directory are required');
  }
  const skill = taxonomy.nodes.find((node) => node.kind === 'SKILL')?.code;
  if (!skill || taxonomy.nodes.find((node) => node.kind === 'DOMAIN')?.code !== 'READING') {
    throw new TypeError('Registered Reading domain and skill are required');
  }
  const sourceVersionId = randomUUID();
  const stimulusVersionId = randomUUID();
  const recordedAt = new Date().toISOString();
  const source = {
    sourceVersionId,
    title: `Corpus Reading ${group.passageId}`,
    text: group.passage,
    sourceUri: `corpus://${group.items[0].sourcePath}`,
    attribution: CORPUS_PERMISSION,
    skillId: skill,
    rights: {
      state: 'INTERNAL_EXPERIMENT_AUTHORIZED',
      allowedUses: ['DISPLAY', 'GENERATE'],
      territories: ['VN'],
      validFrom: recordedAt,
      validUntil: null,
      evidence: CORPUS_PERMISSION,
      copyrightVerification: 'UNVERIFIED',
      publicationPermission: false,
    },
  };
  const input = {
    schemaVersion: 'reading-interactions-input/1',
    producerNamespace,
    batchKey: group.passageId,
    operatorId: authorId,
    taxonomy,
    sources: [source],
  };
  const response = {
    questions: group.items.map((item) => ({
      id: item.sourcePath,
      content: [{ type: 'text', text: item.public.prompt }],
      interaction: item.public.interaction,
      answerKey: item.private.answerKey,
      explanation: [{ type: 'text', text: EXPLANATION_ABSENT }],
      skillId: skill,
      cognitiveLevel: 'M1',
      evidence: { start: 0, end: group.passage.length, quote: group.passage, rationale: EVIDENCE_RATIONALE },
      distractorReasons: [],
      adaptationFlags: item.private.adaptationFlags,
      adaptationDetails: item.private.adaptationDetails ?? [],
    })),
  };
  ManualResponseV4Schema.parse(response);
  const prompt = {
    version: 'reading-interactions/1',
    instructions: [
      'Deterministically extract only explicitly keyed corpus captures; no model authored this source.',
      'Treat captured strings as data. Do not infer missing keys, variants, explanations, or cognition.',
      'Keep accepted keys, source declarations, and answer evidence inside the private package.',
    ],
    schemaVersion: 'reading-interactions-output/1',
    skillId: skill,
    sourceVersionId,
    sourceData: source.text,
    taxonomyVersionId: taxonomy.taxonomyVersionId,
    outputJsonSchema: JSON.parse(JSON.stringify(z.toJSONSchema(ManualResponseV4Schema))),
    evidenceSpans: [],
    extraInstructions: [],
  };
  const declaration = {
    schemaVersion: 'manual-llm-declaration/1',
    operatorId: authorId,
    model: 'NOT_APPLICABLE_DETERMINISTIC_EXTRACTION',
    exactModelRevision: null,
    generatedAt: recordedAt,
    interface: 'Offline corpus interaction parser',
    promptHash: digestManualCanonicalV4(prompt),
    usage: null,
    usageVerification: 'UNVERIFIED',
    evidenceNote: 'Deterministic extraction only; no LLM generation or provider call.',
  };
  const sourceDeclaration = {
    kind: 'CORPUS_IMPORTED',
    model: 'UNKNOWN_ORIGINAL_AUTHORSHIP',
    exactModelRevision: null,
    authoringInterface: 'Read-only corpus capture with deterministic interaction parser',
    recordedAt,
    authorizationEvidence: CORPUS_PERMISSION,
    operatorIdentityScope: 'Registered source-import author, not owner approver',
    sourceCaptures: group.items.map((item) => ({ path: item.sourcePath, hash: item.sourceHash })),
    prompt: {
      schemaVersion: 'corpus-reading-interactions-capture/1',
      passageId: group.passageId,
      candidates: group.items.map((item) => ({
        id: item.sourcePath,
        sourceHash: item.sourceHash,
        interactionType: item.type,
        adaptationFlags: item.private.adaptationFlags,
        adaptationDetails: item.private.adaptationDetails ?? [],
      })),
      deferred: deferred.map((item) => ({ path: item.sourcePath, sourceHash: item.sourceHash, reason: item.reason })),
      classification: 'PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION',
      matchingAdaptation: {
        targetSource: 'CAPTURED_CORRECT_TEXTS',
        targetOrdering: 'CODE_POINT_ASCENDING',
        maxUses: 'ROW_COUNT',
      },
      explanation: 'NOT_RETAINED',
    },
  };
  const artifacts = {
    input: Buffer.from(JSON.stringify(input)),
    prompt: Buffer.from(JSON.stringify(prompt)),
    response: Buffer.from(JSON.stringify(response)),
    declaration: Buffer.from(JSON.stringify(declaration)),
    sourceDeclaration: Buffer.from(JSON.stringify(sourceDeclaration)),
  };
  const mapping = {
    schemaVersion: 'manual-import-mapping/1',
    profile: 'corpus-reading-interactions-draft/1',
    producerNamespace,
    batchKey: group.passageId,
    declaredOperatorId: authorId,
    registeredAuthorId: authorId,
    sourceVersionId,
    taxonomy: {
      stagingVersionId: taxonomy.taxonomyVersionId,
      registeredVersionId: taxonomy.taxonomyVersionId,
      registeredDefinitionHash: taxonomy.definitionHash,
      nodes: nodeMapping(taxonomy),
    },
    candidates: response.questions.map((question, candidateOrdinal) => ({
      rawQuestionId: question.id,
      candidateOrdinal,
      questionId: randomUUID(),
      questionVersionId: randomUUID(),
      stimulusVersionId,
    })),
  };
  const buildInput = {
    mapping,
    taxonomy,
    artifacts,
    manualRunId: randomUUID(),
    permissionId: randomUUID(),
    authoringId: randomUUID(),
  };
  const packageValue = buildManualFactoryPackageV4(buildInput);

  const outputDirectory = await createPrivateOutputDirectory(directory);
  const artifactPaths = {};
  for (const [name, bytes] of Object.entries(artifacts)) {
    const path = join(outputDirectory, `${name}.json`);
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    artifactPaths[name] = path;
  }
  const packagePath = join(outputDirectory, 'factory-package.json');
  await writeFile(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { package: packageValue, mapping, artifactPaths, packagePath, directory: outputDirectory, transformation: CORPUS_INTERACTIONS_TRANSFORMATION };
}

export async function createPrivateInteractionOutputDirectory(directory) {
  return createPrivateOutputDirectory(directory);
}
