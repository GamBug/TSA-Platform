import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ManualCorpusMathResponseSchema } from '../../packages/contracts/dist/manual-factory-schemas.js';
import { AnswerKeySchema, buildManualFactoryPackageV3 } from '../../packages/contracts/dist/internal.js';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { CORPUS_PERMISSION, createPrivateOutputDirectory } from './reading-package.mjs';

const HASH = /^sha256:[0-9a-f]{64}$/;
const TextBlock = z.object({ type: z.literal('text'), text: z.string().min(1).max(20_000) }).strict();
const Choice = z.object({ id: z.string().min(1), content: z.array(TextBlock).min(1).max(20) }).strict();
const Prompt = z.string().min(1).max(20_000);
const MathPublic = z.union([
  z.object({ prompt: Prompt, options: z.array(Choice).min(2).max(10) }).strict(),
  z.object({ prompt: Prompt, statements: z.array(Choice).min(1).max(10) }).strict(),
]);
const MathItem = z.object({
  id: z.string().min(1).max(20_000),
  sourcePath: z.string().min(1).max(2_000).refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..')),
  sourceHash: z.string().regex(HASH),
  public: MathPublic,
  private: z.object({ answerKey: AnswerKeySchema,
    explanation: z.union([z.null(), z.array(TextBlock).min(1).max(20)]),
    extractedKeyText: z.string().min(1).optional() }).strict(),
  proposedTaxonomy: z.object({ section: z.literal('MATH'), topic: z.string().min(1).max(200), status: z.literal('REQUIRES_VERIFICATION') }).strict(),
}).strict().superRefine((item, context) => {
  if (item.id !== item.sourcePath) context.addIssue({ code: 'custom', path: ['id'], message: 'Item ID must equal its source-relative path' });
  const isTf = 'statements' in item.public;
  if ((isTf && item.private.answerKey.type !== 'TRUE_FALSE_GROUP')
      || (!isTf && item.private.answerKey.type === 'TRUE_FALSE_GROUP')) {
    context.addIssue({ code: 'custom', path: ['private', 'answerKey'], message: 'Answer key type does not match public interaction' });
  }
});

const explanationAbsent = 'No explanation retained in the source capture. Owner review required.';

function publicInteraction(item) {
  if ('statements' in item.public) return { type: 'TRUE_FALSE_GROUP', statements: item.public.statements };
  if (item.private.answerKey.type === 'SINGLE_CHOICE') return { type: 'SINGLE_CHOICE', options: item.public.options };
  if (item.private.answerKey.type === 'MULTIPLE_CHOICE') return {
    type: 'MULTIPLE_CHOICE', options: item.public.options,
    minSelections: 1,
    maxSelections: item.public.options.length,
  };
  throw new TypeError('MATH_INTERACTION_UNSUPPORTED');
}

function publicText(item) {
  const entries = 'statements' in item.public ? item.public.statements : item.public.options ?? [];
  return [item.public.prompt, ...entries.flatMap((entry) => entry.content.map((block) => block.text))];
}

export async function buildCorpusMathPackage({ items, taxonomy, authorId, directory, batchKey }) {
  const parsedItems = z.array(MathItem).min(1).max(20).parse(items);
  if (new Set(parsedItems.map((item) => item.sourcePath)).size !== parsedItems.length) {
    throw new TypeError('MATH_CAPTURE_PATHS_MUST_BE_UNIQUE');
  }
  if (taxonomy.nodes.length !== 2 || taxonomy.nodes.filter((node) => node.kind === 'DOMAIN').length !== 1
      || taxonomy.nodes.filter((node) => node.kind === 'SKILL').length !== 1) {
    throw new TypeError('MATH_TAXONOMY_DOMAIN_AND_ONE_SKILL_REQUIRED');
  }
  const domain = taxonomy.nodes.find((node) => node.kind === 'DOMAIN');
  const skillNode = taxonomy.nodes.find((node) => node.kind === 'SKILL');
  if (domain.code !== 'MATH' || domain.parentId !== null || skillNode.parentId !== domain.id) {
    throw new TypeError('MATH_TAXONOMY_REQUIRED');
  }
  const skill = skillNode.code;
  const author = z.string().uuid().parse(authorId);
  const producerNamespace = 'tsa.corpus.math.v1';
  const sourceVersionId = randomUUID();
  const stimulusVersionIds = parsedItems.map(() => null);
  const at = new Date().toISOString();
  const lines = parsedItems.map((item) => JSON.stringify({ sourcePath: item.sourcePath, public: item.public }));
  const sourceText = lines.join('\n');
  if (sourceText.length > 20_000) throw new TypeError('MATH_TRANSCRIPTION_SOURCE_TOO_LARGE');
  for (const item of parsedItems) {
    const marker = item.private.extractedKeyText;
    if (marker && marker.length >= 4 && publicText(item).some((value) => value.includes(marker))) {
      throw new TypeError('MATH_PUBLIC_ANSWER_TEXT_LEAK');
    }
  }
  const source = { sourceVersionId, title: `Corpus Math ${batchKey}`, text: sourceText,
    sourceUri: `corpus://${parsedItems[0].sourcePath}`, attribution: CORPUS_PERMISSION, skillId: skill,
    rights: { state: 'INTERNAL_EXPERIMENT_AUTHORIZED', allowedUses: ['DISPLAY', 'GENERATE'],
      territories: ['VN'], validFrom: at, validUntil: null,
      evidence: CORPUS_PERMISSION,
      copyrightVerification: 'UNVERIFIED', publicationPermission: false } };
  const input = { schemaVersion: 'corpus-math-input/1', producerNamespace, batchKey, operatorId: author,
    taxonomy, sources: [source] };
  const evidenceSpans = [];
  let cursor = 0;
  const questions = parsedItems.map((item, index) => {
    const line = lines[index];
    const start = cursor;
    const end = start + line.length;
    cursor = end + (index < lines.length - 1 ? 1 : 0);
    evidenceSpans.push({ start, end, quote: line });
    return { id: item.id, content: [{ type: 'text', text: item.public.prompt }],
      interaction: publicInteraction(item), answerKey: item.private.answerKey,
      explanation: item.private.explanation ?? [{ type: 'text', text: explanationAbsent }], skillId: skill,
      cognitiveLevel: 'M1', evidence: { start, end, quote: line,
        rationale: 'Public prompt and options or statements transcribed from this source image; cognitive classification remains provisional.' },
      distractorReasons: [] };
  });
  const response = ManualCorpusMathResponseSchema.parse({ questions });
  const prompt = { version: 'corpus-math-transcription/1',
    instructions: ['Bind each answer-free transcription to its source-relative image path and hash.',
      'Keep source answer keys private. Do not create a shared stimulus for independent Math items.',
      'Subscription-native vision transcription; this descriptor is not a provider API request.'],
    schemaVersion: 'corpus-math-draft-output/1', skillId: skill, sourceVersionId,
    sourceData: source.text, taxonomyVersionId: taxonomy.taxonomyVersionId,
    outputJsonSchema: JSON.parse(JSON.stringify(z.toJSONSchema(ManualCorpusMathResponseSchema))),
    evidenceSpans, extraInstructions: [] };
  const declaration = { schemaVersion: 'manual-llm-declaration/1', operatorId: author,
    model: 'SUBSCRIPTION_NATIVE_VISION_TRANSCRIPTION', exactModelRevision: null,
    generatedAt: at, interface: 'Codex subscription UI, native vision transcription',
    promptHash: jsonDigest(prompt), usage: null, usageVerification: 'UNVERIFIED',
    evidenceNote: 'Subscription-native vision transcription of corpus images; no provider API adapter call.' };
  const sourceDeclaration = { kind: 'CORPUS_IMPORTED', model: 'UNKNOWN_ORIGINAL_AUTHORSHIP',
    exactModelRevision: null, authoringInterface: 'Read-only corpus images; subscription-native vision transcription',
    recordedAt: at, authorizationEvidence: CORPUS_PERMISSION,
    operatorIdentityScope: 'Registered source-import author, not owner approver',
    sourceCaptures: parsedItems.map((item) => ({ path: item.sourcePath, hash: item.sourceHash })),
    prompt: { schemaVersion: 'corpus-math-transcription-evidence/1',
      classification: 'PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION',
      proposedTaxonomy: parsedItems.map((item) => ({ id: item.id, ...item.proposedTaxonomy })),
      explanation: 'NOT_RETAINED' } };
  const mapping = { schemaVersion: 'manual-import-mapping/1', profile: 'corpus-math-draft/1',
    producerNamespace, batchKey, declaredOperatorId: author, registeredAuthorId: author, sourceVersionId,
    taxonomy: { stagingVersionId: taxonomy.taxonomyVersionId, registeredVersionId: taxonomy.taxonomyVersionId,
      registeredDefinitionHash: taxonomy.definitionHash, nodes: [domain, skillNode].map((node) => ({
        stagingCode: node.code, stagingKind: node.kind, registeredNodeId: node.id,
        registeredCode: node.code, registeredKind: node.kind,
        parentCode: node.kind === 'DOMAIN' ? null : 'MATH', section: 'MATH' })) },
    candidates: response.questions.map((question, candidateOrdinal) => ({ rawQuestionId: question.id, candidateOrdinal,
      questionId: randomUUID(), questionVersionId: randomUUID(), stimulusVersionId: stimulusVersionIds[candidateOrdinal] })) };
  const artifacts = {}, artifactPaths = {};
  for (const [name, value] of Object.entries({ input, prompt, response, declaration, sourceDeclaration })) {
    artifacts[name] = Buffer.from(JSON.stringify(value));
  }
  await createPrivateOutputDirectory(directory);
  for (const [name, bytes] of Object.entries(artifacts)) {
    artifactPaths[name] = join(directory, `${name}.json`);
    await writeFile(artifactPaths[name], bytes, { flag: 'wx', mode: 0o600 });
  }
  const args = { mapping, taxonomy, artifacts, manualRunId: randomUUID(), permissionId: randomUUID(),
    authoringId: randomUUID(), transformation: 'Corpus Math subscription-native vision transcription; source keys private; explanation absent; taxonomy provisional.' };
  const built = buildManualFactoryPackageV3(args);
  return { ...args, artifactPaths, directory, package: built };
}
