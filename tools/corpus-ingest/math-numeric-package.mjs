// Numeric-answer Math DRAFT package builder (profile corpus-math-numeric-draft/1, question/2).
// Mirrors math-package.mjs: private DRAFTs only, source keys stay private, no approval or rights grant.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ManualCorpusMathNumericResponseSchema, MANUAL_NUMERIC_MATH_OUTPUT_SCHEMA, MANUAL_NUMERIC_MATH_PROFILE }
  from '../../packages/contracts/dist/manual-factory-schemas.js';
import { normalizeDecimal, NumericAnswerKeySchema } from '../../packages/contracts/dist/numeric-response.js';
import { buildManualFactoryPackageV3 } from '../../packages/contracts/dist/internal.js';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { CORPUS_PERMISSION, createPrivateOutputDirectory } from './reading-package.mjs';

export const NUMERIC_PRODUCER_NAMESPACE = 'tsa.corpus.math-numeric.v1';
export const NUMERIC_INTERACTION = Object.freeze({ type: 'NUMERIC_RESPONSE', label: 'Đáp án (số thập phân)', format: 'DECIMAL' });
const HASH = /^sha256:[0-9a-f]{64}$/;
const explanationAbsent = 'No explanation retained in the source capture. Owner review required.';
const TextBlock = z.object({ type: z.literal('text'), text: z.string().min(1).max(20_000) }).strict();

const NumericItem = z.object({
  id: z.string().min(1).max(2_000),
  sourcePath: z.string().min(1).max(2_000).refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..')),
  sourceHash: z.string().regex(HASH),
  public: z.object({ prompt: z.string().min(1).max(20_000) }).strict(),
  private: z.object({ answerKey: NumericAnswerKeySchema,
    explanation: z.union([z.null(), z.array(TextBlock).min(1).max(20)]),
    extractedKeyText: z.string().min(1) }).strict(),
  proposedTaxonomy: z.object({ section: z.literal('MATH'), topic: z.string().min(1).max(200),
    status: z.literal('REQUIRES_VERIFICATION') }).strict(),
}).strict().superRefine((item, context) => {
  if (item.id !== item.sourcePath) context.addIssue({ code: 'custom', path: ['id'], message: 'Item ID must equal its source-relative path' });
});

/** Parse a source-style decimal (comma or period) into the canonical key form, or null. */
export function canonicalNumericKey(raw) {
  return normalizeDecimal(String(raw).trim());
}

export async function buildCorpusMathNumericPackage({ items, taxonomy, authorId, directory, batchKey }) {
  const parsedItems = z.array(NumericItem).min(1).max(20).parse(items);
  if (new Set(parsedItems.map((item) => item.sourcePath)).size !== parsedItems.length) throw new TypeError('MATH_NUMERIC_PATHS_MUST_BE_UNIQUE');
  const domain = taxonomy.nodes.find((node) => node.kind === 'DOMAIN');
  const skillNode = taxonomy.nodes.find((node) => node.kind === 'SKILL');
  if (taxonomy.nodes.length !== 2 || domain?.code !== 'MATH' || domain.parentId !== null || skillNode?.parentId !== domain.id) {
    throw new TypeError('MATH_TAXONOMY_REQUIRED');
  }
  const skill = skillNode.code;
  const author = z.string().uuid().parse(authorId);
  const sourceVersionId = randomUUID();
  const at = new Date().toISOString();
  const lines = parsedItems.map((item) => JSON.stringify({ sourcePath: item.sourcePath, public: item.public }));
  const sourceText = lines.join('\n');
  if (sourceText.length > 20_000) throw new TypeError('MATH_NUMERIC_SOURCE_TOO_LARGE');
  for (const item of parsedItems) {
    if (item.public.prompt.includes(item.private.extractedKeyText)) throw new TypeError('MATH_NUMERIC_PUBLIC_ANSWER_TEXT_LEAK');
  }
  const source = { sourceVersionId, title: `Corpus Math numeric ${batchKey}`, text: sourceText,
    sourceUri: `corpus://${parsedItems[0].sourcePath}`, attribution: CORPUS_PERMISSION, skillId: skill,
    rights: { state: 'INTERNAL_EXPERIMENT_AUTHORIZED', allowedUses: ['DISPLAY', 'GENERATE'], territories: ['VN'],
      validFrom: at, validUntil: null, evidence: CORPUS_PERMISSION, copyrightVerification: 'UNVERIFIED', publicationPermission: false } };
  const input = { schemaVersion: 'corpus-math-input/1', producerNamespace: NUMERIC_PRODUCER_NAMESPACE, batchKey,
    operatorId: author, taxonomy, sources: [source] };
  let cursor = 0;
  const evidenceSpans = [];
  const questions = parsedItems.map((item, index) => {
    const line = lines[index];
    const start = cursor; const end = start + line.length;
    cursor = end + (index < lines.length - 1 ? 1 : 0);
    evidenceSpans.push({ start, end, quote: line });
    return { id: item.id, content: [{ type: 'text', text: item.public.prompt }], interaction: NUMERIC_INTERACTION,
      answerKey: item.private.answerKey, explanation: item.private.explanation ?? [{ type: 'text', text: explanationAbsent }],
      skillId: skill, cognitiveLevel: 'M1',
      evidence: { start, end, quote: line,
        rationale: 'Public prompt transcribed from this source image; the numeric answer key stays private; cognitive classification remains provisional.' },
      distractorReasons: [] };
  });
  const response = ManualCorpusMathNumericResponseSchema.parse({ questions });
  const prompt = { version: 'corpus-math-transcription/1',
    instructions: ['Bind each answer-free transcription to its source-relative image path and hash.',
      'Keep source numeric answer keys private; the response accepts one exact decimal.',
      'Subscription-native vision transcription; this descriptor is not a provider API request.'],
    schemaVersion: MANUAL_NUMERIC_MATH_OUTPUT_SCHEMA, skillId: skill, sourceVersionId, sourceData: source.text,
    taxonomyVersionId: taxonomy.taxonomyVersionId,
    outputJsonSchema: JSON.parse(JSON.stringify(z.toJSONSchema(ManualCorpusMathNumericResponseSchema))),
    evidenceSpans, extraInstructions: [] };
  const declaration = { schemaVersion: 'manual-llm-declaration/1', operatorId: author,
    model: 'SUBSCRIPTION_NATIVE_VISION_TRANSCRIPTION', exactModelRevision: null, generatedAt: at,
    interface: 'Codex subscription UI, native vision transcription', promptHash: jsonDigest(prompt), usage: null,
    usageVerification: 'UNVERIFIED',
    evidenceNote: 'Subscription-native vision transcription of corpus images; no provider API adapter call.' };
  const sourceDeclaration = { kind: 'CORPUS_IMPORTED', model: 'UNKNOWN_ORIGINAL_AUTHORSHIP', exactModelRevision: null,
    authoringInterface: 'Read-only corpus images; subscription-native vision transcription', recordedAt: at,
    authorizationEvidence: CORPUS_PERMISSION, operatorIdentityScope: 'Registered source-import author, not owner approver',
    sourceCaptures: parsedItems.map((item) => ({ path: item.sourcePath, hash: item.sourceHash })),
    prompt: { schemaVersion: 'corpus-math-transcription-evidence/1', classification: 'PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION',
      proposedTaxonomy: parsedItems.map((item) => ({ id: item.id, ...item.proposedTaxonomy })), explanation: 'NOT_RETAINED' } };
  const mapping = { schemaVersion: 'manual-import-mapping/1', profile: MANUAL_NUMERIC_MATH_PROFILE,
    producerNamespace: NUMERIC_PRODUCER_NAMESPACE, batchKey, declaredOperatorId: author, registeredAuthorId: author, sourceVersionId,
    taxonomy: { stagingVersionId: taxonomy.taxonomyVersionId, registeredVersionId: taxonomy.taxonomyVersionId,
      registeredDefinitionHash: taxonomy.definitionHash, nodes: [domain, skillNode].map((node) => ({
        stagingCode: node.code, stagingKind: node.kind, registeredNodeId: node.id, registeredCode: node.code,
        registeredKind: node.kind, parentCode: node.kind === 'DOMAIN' ? null : 'MATH', section: 'MATH' })) },
    candidates: response.questions.map((question, candidateOrdinal) => ({ rawQuestionId: question.id, candidateOrdinal,
      questionId: randomUUID(), questionVersionId: randomUUID(), stimulusVersionId: null })) };
  const artifacts = {}; const artifactPaths = {};
  for (const [name, value] of Object.entries({ input, prompt, response, declaration, sourceDeclaration })) {
    artifacts[name] = Buffer.from(JSON.stringify(value));
  }
  await createPrivateOutputDirectory(directory);
  for (const [name, bytes] of Object.entries(artifacts)) {
    artifactPaths[name] = join(directory, `${name}.json`);
    await writeFile(artifactPaths[name], bytes, { flag: 'wx', mode: 0o600 });
  }
  const args = { mapping, taxonomy, artifacts, manualRunId: randomUUID(), permissionId: randomUUID(), authoringId: randomUUID(),
    transformation: 'Corpus Math numeric-answer subscription-native vision transcription; source keys private; explanation absent; taxonomy provisional.' };
  return { ...args, artifactPaths, directory, package: buildManualFactoryPackageV3(args) };
}
