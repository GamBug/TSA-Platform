import assert from 'node:assert/strict';
import test from 'node:test';
import { BankCommandError } from '../../../src/modules/bank/common.mjs';
import { assertSafeQuestionContent } from '../../../src/modules/bank/content-safety.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const QUESTION_ID = '10000000-0000-4000-8000-000000000001';
const VERSION_ID = '20000000-0000-4000-8000-000000000001';
const TAXONOMY_ID = '30000000-0000-4000-8000-000000000001';
const STIMULUS_ID = '40000000-0000-4000-8000-000000000001';
const PARENT_ID = '50000000-0000-4000-8000-000000000001';

function makeInteraction(type = 'SINGLE_CHOICE') {
  if (type === 'TRUE_FALSE_GROUP') {
    return {
      type,
      statements: [
        { id: 'statement-1', content: [{ type: 'text', text: 'Mệnh đề thứ nhất.' }] },
        { id: 'statement-2', content: [{ type: 'text', text: 'Mệnh đề thứ hai.' }] },
      ],
    };
  }
  const options = [
    { id: 'option-a', content: [{ type: 'text', text: 'Đáp án A' }] },
    { id: 'option-b', content: [{ type: 'text', text: 'Đáp án B' }] },
  ];
  return type === 'MULTIPLE_CHOICE'
    ? { type, options, minSelections: 1, maxSelections: 2 }
    : { type, options };
}

function makeQuestion({
  id = VERSION_ID,
  questionId = QUESTION_ID,
  versionNo = 1,
  parentVersionId = null,
  stimulusVersionId = null,
  taxonomyVersionId = TAXONOMY_ID,
  provenanceIds = ['provenance-root'],
  content = [{ type: 'text', text: 'Câu hỏi thử nghiệm bằng tiếng Việt.' }],
  interaction = makeInteraction(),
  explanation = [{ type: 'text', text: 'Giải thích dành cho người chấm.' }],
} = {}) {
  const answerKey = interaction.type === 'TRUE_FALSE_GROUP'
    ? { type: interaction.type, values: Object.fromEntries(interaction.statements.map(({ id: statementId }) => [statementId, true])) }
    : interaction.type === 'MULTIPLE_CHOICE'
      ? { type: interaction.type, optionIds: [interaction.options[0].id] }
      : { type: interaction.type, optionId: interaction.options[0].id };
  return {
    schemaVersion: 'question/1',
    id,
    questionId,
    versionNo,
    parentVersionId,
    language: 'vi-VN',
    section: 'MATH',
    taxonomyVersionId,
    domainId: 'synthetic-domain',
    skillIds: [],
    subskillIds: [],
    cognitiveLevel: null,
    difficulty: { target: null, predicted: null, empiricalStudyId: null },
    content,
    stimulusVersionId,
    interaction,
    private: {
      answerKey,
      explanation,
      evidenceRefs: [],
      scoringPolicy: 'practice-binary-v1',
    },
    origin: 'MANUAL',
    provenanceIds,
    generationRunId: null,
    createdBy: 'synthetic-author',
    createdAt: '2026-10-21T00:00:00.000Z',
    contentHash: HASH,
  };
}

function imageIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) imageIds(item, ids);
  } else if (value !== null && typeof value === 'object') {
    if (value.type === 'image' && typeof value.assetVersionId === 'string') ids.add(value.assetVersionId);
    for (const child of Object.values(value)) imageIds(child, ids);
  }
  return ids;
}

function refKey(kind, id) {
  return `${kind}\u0000${id}`;
}

function makeReferences(question, {
  includeAssets = true,
  sourcePayload = null,
  stimulusContent = [{ type: 'text', text: 'Đoạn dẫn thử nghiệm.' }],
  parentQuestion = null,
  extraNodes = [],
} = {}) {
  const nodes = new Map();
  const put = (kind, id, payload, references = []) => {
    nodes.set(refKey(kind, id), { kind, id, payload, references, contentHash: HASH });
  };
  const addAssetNodes = (value) => {
    if (!includeAssets) return;
    for (const id of imageIds(value)) put('asset', id, { mediaType: 'image/png', bytesHash: HASH });
  };
  const addQuestionRoots = (rootQuestion) => {
    put('taxonomy', rootQuestion.taxonomyVersionId, { label: 'Synthetic taxonomy' });
    for (const id of rootQuestion.provenanceIds) {
      const refs = sourcePayload && id === rootQuestion.provenanceIds[0]
        ? [{ kind: 'source', id: 'source-root' }]
        : [];
      put('provenance', id, { note: 'Synthetic provenance' }, refs);
    }
    for (const id of rootQuestion.private.evidenceRefs) put('evidence', id, { note: 'Synthetic evidence' });
    addAssetNodes(rootQuestion.content);
    addAssetNodes(rootQuestion.interaction);
    addAssetNodes(rootQuestion.private.explanation);
    if (sourcePayload && rootQuestion.provenanceIds.length) put('source', 'source-root', sourcePayload);
  };

  addQuestionRoots(question);
  if (question.stimulusVersionId !== null) {
    const stimulusProvenanceId = 'stimulus-provenance';
    const stimulusAssets = imageIds(stimulusContent);
    put('provenance', stimulusProvenanceId, { note: 'Synthetic stimulus provenance' });
    const stimulusEdges = [{ kind: 'provenance', id: stimulusProvenanceId },
      ...[...stimulusAssets].map((id) => ({ kind: 'asset', id }))];
    put('stimulus', question.stimulusVersionId, {
      content: stimulusContent,
      provenanceIds: [stimulusProvenanceId],
    }, stimulusEdges);
    addAssetNodes(stimulusContent);
  }
  if (parentQuestion) {
    const parentRoots = [
      { kind: 'taxonomy', id: parentQuestion.taxonomyVersionId },
      ...parentQuestion.provenanceIds.map((id) => ({ kind: 'provenance', id })),
      ...parentQuestion.private.evidenceRefs.map((id) => ({ kind: 'evidence', id })),
      ...[...imageIds(parentQuestion.content)].map((id) => ({ kind: 'asset', id })),
      ...[...imageIds(parentQuestion.interaction)].map((id) => ({ kind: 'asset', id })),
      ...[...imageIds(parentQuestion.private.explanation)].map((id) => ({ kind: 'asset', id })),
    ];
    const payload = structuredClone(parentQuestion);
    delete payload.contentHash;
    put('question', parentQuestion.id, payload, parentRoots);
    addQuestionRoots(parentQuestion);
  }
  for (const node of extraNodes) put(node.kind, node.id, node.payload, node.references ?? []);
  return [...nodes.values()];
}

function assertBankError(operation, { code = 'VALIDATION_ERROR', status = 422 } = {}) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof BankCommandError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test('accepts supported text, math and table blocks for every question interaction without rewriting', () => {
  const source = {
    type: 'math',
    tex: String.raw`\frac{x+1}{2} \le \sqrt{9} + \begin{bmatrix}1&2\\3&4\end{bmatrix}`,
    display: true,
    accessibleText: 'Phân số, căn bậc hai và ma trận.',
  };
  for (const type of ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP']) {
    const interaction = makeInteraction(type);
    if (type === 'TRUE_FALSE_GROUP') interaction.statements[0].content = [source];
    else interaction.options[0].content = [source];
    const question = makeQuestion({
      interaction,
      content: [
        { type: 'text', text: 'So sánh: 2 < 5 và 8 > 3 — giữ nguyên tiếng Việt.' },
        source,
        { type: 'table', caption: 'Bảng thử nghiệm', headers: ['x', 'Quan hệ'], rows: [['1', 'x < 2'], ['3', 'x > 2']] },
      ],
      explanation: [{ type: 'text', text: 'Dữ liệu không bị chuẩn hóa hoặc viết lại.' }],
    });
    const before = structuredClone(question);
    assert.equal(assertSafeQuestionContent(question, makeReferences(question)), true);
    assert.deepEqual(question, before);
    assert.equal(question.content[0].text, 'So sánh: 2 < 5 và 8 > 3 — giữ nguyên tiếng Việt.');
    assert.equal(question.content[1].tex, source.tex);
  }
});

test('allows a plain source URL as inert text while never scanning raw provenance/source payload text', () => {
  const question = makeQuestion({ content: [{ type: 'text', text: 'Tài liệu tham khảo: https://example.invalid/resource' }] });
  const references = makeReferences(question, {
    sourcePayload: { title: 'Quoted hostile source', content: '<script>this remains unrendered source evidence</script>' },
  });
  assert.equal(assertSafeQuestionContent(question, references), true);
});

test('rejects markup, event attributes, active schemes, external loaders and executable TeX macros', () => {
  const unsafeBlocks = [
    { type: 'text', text: '<script>alert(1)</script>' },
    { type: 'text', text: '<img src="https://example.invalid/a" onerror="alert(1)">' },
    { type: 'text', text: '<svg/onload=alert(1)>' },
    { type: 'text', text: '<div onclick=run()>text</div>' },
    { type: 'text', text: '<link rel="stylesheet" href="https://example.invalid/x.css">' },
    { type: 'text', text: 'javascript:alert(1)' },
    { type: 'text', text: 'data:text/html;base64,PHNjcmlwdD4=' },
    { type: 'text', text: 'Background: url(https://example.invalid/x)' },
    { type: 'text', text: '@import "https://example.invalid/x.css";' },
    { type: 'text', text: '![remote image](https://example.invalid/x.png)' },
    { type: 'table', caption: 'Safe caption', headers: ['Column'], rows: [['<script>alert(1)</script>']] },
    { type: 'math', tex: String.raw`\href{https://example.invalid}{mở}`, display: false, accessibleText: 'link' },
    { type: 'math', tex: String.raw`\input{/etc/passwd}`, display: false, accessibleText: 'file' },
    { type: 'math', tex: String.raw`\write18{touch /tmp/nope}`, display: false, accessibleText: 'write' },
    { type: 'math', tex: String.raw`\newcommand{\bad}{x}`, display: false, accessibleText: 'macro' },
    { type: 'math', tex: String.raw`\begin{document}x\end{document}`, display: false, accessibleText: 'environment' },
  ];
  for (const block of unsafeBlocks) {
    const question = makeQuestion({ content: [block] });
    assertBankError(() => assertSafeQuestionContent(question, makeReferences(question)));
  }
});

test('rejects unsafe text in options, statements, private explanations, parent versions and stimuli', () => {
  const optionQuestion = makeQuestion();
  optionQuestion.interaction.options[1].content = [{ type: 'text', text: '<iframe src=x>' }];
  assertBankError(() => assertSafeQuestionContent(optionQuestion, makeReferences(optionQuestion)));

  const statementQuestion = makeQuestion({ interaction: makeInteraction('TRUE_FALSE_GROUP') });
  statementQuestion.interaction.statements[1].content = [{ type: 'text', text: '<object data=x>' }];
  assertBankError(() => assertSafeQuestionContent(statementQuestion, makeReferences(statementQuestion)));

  const explanationQuestion = makeQuestion({ explanation: [{ type: 'text', text: '<style>body{display:none}</style>' }] });
  assertBankError(() => assertSafeQuestionContent(explanationQuestion, makeReferences(explanationQuestion)));

  const parent = makeQuestion({ id: PARENT_ID, content: [{ type: 'text', text: '<meta http-equiv=x>' }] });
  const child = makeQuestion({ versionNo: 2, parentVersionId: parent.id });
  assertBankError(() => assertSafeQuestionContent(child, makeReferences(child, { parentQuestion: parent })));

  const stimulusQuestion = makeQuestion({ stimulusVersionId: STIMULUS_ID });
  assertBankError(() => assertSafeQuestionContent(stimulusQuestion, makeReferences(stimulusQuestion, {
    stimulusContent: [{ type: 'text', text: '<embed src=x>' }],
  })));
});

test('fails closed for unknown question/block fields, bad graph edges and absent assets', () => {
  const questionWithField = makeQuestion();
  questionWithField.renderHtml = '<p>untrusted</p>';
  assertBankError(() => assertSafeQuestionContent(questionWithField, makeReferences(questionWithField)));

  const questionWithBlockField = makeQuestion({ content: [{ type: 'text', text: 'safe', html: '<b>x</b>' }] });
  assertBankError(() => assertSafeQuestionContent(questionWithBlockField, makeReferences(questionWithBlockField)));

  const question = makeQuestion();
  assertBankError(() => assertSafeQuestionContent(question, []), { code: 'INVALID_REFERENCE_GRAPH' });
  const danglingEdge = makeReferences(question);
  danglingEdge[0].references = [{ kind: 'source', id: 'missing-source' }];
  assertBankError(() => assertSafeQuestionContent(question, danglingEdge), { code: 'INVALID_REFERENCE_GRAPH' });
  const unexpectedNodeField = makeReferences(question);
  unexpectedNodeField[0].internalNote = 'not part of reference/1';
  assertBankError(() => assertSafeQuestionContent(question, unexpectedNodeField), { code: 'INVALID_REFERENCE_GRAPH' });
  const cyclicGraph = makeReferences(question);
  cyclicGraph.find(({ kind, id }) => kind === 'provenance' && id === 'provenance-root').references = [
    { kind: 'provenance', id: 'provenance-root' },
  ];
  assertBankError(() => assertSafeQuestionContent(question, cyclicGraph), { code: 'INVALID_REFERENCE_GRAPH' });

  const missingAssetQuestion = makeQuestion({ content: [{ type: 'image', assetVersionId: '60000000-0000-4000-8000-000000000001', alt: 'Synthetic figure' }] });
  assertBankError(() => assertSafeQuestionContent(missingAssetQuestion, makeReferences(missingAssetQuestion, { includeAssets: false })), {
    code: 'INVALID_REFERENCE_GRAPH',
  });
});

test('rejects every present asset until a sanitizer is available, even when its reference is structurally valid', () => {
  const question = makeQuestion({ content: [{ type: 'image', assetVersionId: '60000000-0000-4000-8000-000000000001', alt: 'Synthetic figure' }] });
  assertBankError(() => assertSafeQuestionContent(question, makeReferences(question)), {
    code: 'ASSET_SANITIZATION_REQUIRED',
  });
});

test('enforces frozen block, question, reference-count and reference-byte limits', () => {
  const maximumText = makeQuestion({ content: [{ type: 'text', text: 'x'.repeat(20_000) }] });
  assert.equal(assertSafeQuestionContent(maximumText, makeReferences(maximumText)), true);
  const excessiveText = makeQuestion({ content: [{ type: 'text', text: 'x'.repeat(20_001) }] });
  assertBankError(() => assertSafeQuestionContent(excessiveText, makeReferences(excessiveText)));
  const maximumTex = makeQuestion({ content: [{ type: 'math', tex: 'x'.repeat(4_000), display: false, accessibleText: 'x' }] });
  assert.equal(assertSafeQuestionContent(maximumTex, makeReferences(maximumTex)), true);
  const excessiveTex = makeQuestion({ content: [{ type: 'math', tex: 'x'.repeat(4_001), display: false, accessibleText: 'x' }] });
  assertBankError(() => assertSafeQuestionContent(excessiveTex, makeReferences(excessiveTex)));

  const excessiveBlocks = makeQuestion({ content: Array.from({ length: 101 }, () => ({ type: 'text', text: 'x' })) });
  assertBankError(() => assertSafeQuestionContent(excessiveBlocks, makeReferences(excessiveBlocks)));

  const excessiveQuestionBytes = makeQuestion({ content: Array.from({ length: 14 }, () => ({ type: 'text', text: 'x'.repeat(20_000) })) });
  assertBankError(() => assertSafeQuestionContent(excessiveQuestionBytes, makeReferences(excessiveQuestionBytes)));

  const question = makeQuestion();
  const tooManyNodes = makeReferences(question);
  while (tooManyNodes.length <= 2_000) {
    const index = tooManyNodes.length;
    tooManyNodes.push({ kind: 'source', id: `unused-${index}`, payload: {}, references: [], contentHash: HASH });
  }
  assertBankError(() => assertSafeQuestionContent(question, tooManyNodes), { code: 'INVALID_REFERENCE_GRAPH' });

  const provenance = makeQuestion();
  const tooManyBytes = makeReferences(provenance, {
    sourcePayload: { quotedText: 'x'.repeat(8 * 1024 * 1024) },
  });
  assertBankError(() => assertSafeQuestionContent(provenance, tooManyBytes), { code: 'INVALID_REFERENCE_GRAPH' });
});

test('rejects control characters and malformed or unsupported TeX while keeping ordinary relations intact', () => {
  const control = makeQuestion({ content: [{ type: 'text', text: 'safe\u0001unsafe' }] });
  assertBankError(() => assertSafeQuestionContent(control, makeReferences(control)));

  for (const tex of [String.raw`\sqrt{x`, String.raw`\begin{matrix}x\end{pmatrix}`, String.raw`x% comment`, String.raw`\htmlClass{unsafe}{x}`]) {
    const question = makeQuestion({ content: [{ type: 'math', tex, display: false, accessibleText: 'equation' }] });
    assertBankError(() => assertSafeQuestionContent(question, makeReferences(question)));
  }
});

test('returns generic errors without echoing unsafe content or private answer material', () => {
  const privateAnswer = 'DO_NOT_LEAK_PRIVATE_ANSWER_6fd5a1';
  const question = makeQuestion({
    content: [{ type: 'text', text: `<img src=x>${privateAnswer}` }],
    explanation: [{ type: 'text', text: privateAnswer }],
  });
  let error;
  try {
    assertSafeQuestionContent(question, makeReferences(question));
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof BankCommandError);
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.equal(error.message, 'VALIDATION_ERROR');
  assert.doesNotMatch(JSON.stringify({ message: error.message, code: error.code }), new RegExp(privateAnswer));
});
