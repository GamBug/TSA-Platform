import {
  BlockSchema,
  QuestionVersionSchema,
  QuestionVersionV3Schema,
  canonicalize,
} from '../../../packages/contracts/dist/internal.js';
import { QuestionVersionV2Schema } from '../../../packages/contracts/dist/question-v2.js';
import {
  HASH_PATTERN,
  MAX_REFERENCE_BYTES,
  MAX_REFERENCE_NODES,
  REFERENCE_KINDS,
  compareReference,
  reject,
  referenceKey,
  strictRecord,
} from './common.mjs';

const QUESTION_BYTES_LIMIT = 256 * 1024;
const MAX_REFERENCE_DEPTH = 64;
const MAX_JSON_VALUES = 100_000;
const HASH_PLACEHOLDER = `sha256:${'0'.repeat(64)}`;
const SAFE_TEX_COMMANDS = new Set([
  // Escaped punctuation and common TeX spacing.
  '!', '#', '$', '%', '&', ',', ':', ';', '_', '{', '}', '|', '\\', ' ',
  // Fractions, roots, text and simple typographic operators.
  'frac', 'dfrac', 'tfrac', 'sqrt', 'text', 'mathrm', 'mathbf', 'mathit', 'mathbb', 'mathcal',
  'operatorname', 'overline', 'underline', 'hat', 'widehat', 'bar', 'vec', 'dot', 'ddot',
  'left', 'right', 'big', 'Big', 'bigl', 'bigr', 'Bigl', 'Bigr', 'bigg', 'Bigg',
  'quad', 'qquad', 'enspace', 'thinspace',
  // Arithmetic, relations and standard functions.
  'cdot', 'times', 'div', 'pm', 'mp', 'le', 'leq', 'ge', 'geq', 'neq', 'ne', 'approx',
  'equiv', 'sim', 'simeq', 'cong', 'propto', 'll', 'gg', 'mid', 'nmid', 'parallel', 'perp',
  'in', 'notin', 'ni', 'subset', 'supset', 'subseteq', 'supseteq', 'cup', 'cap', 'setminus',
  'emptyset', 'varnothing', 'infty', 'forall', 'exists', 'nexists', 'therefore', 'because',
  'sum', 'prod', 'coprod', 'int', 'iint', 'lim', 'max', 'min', 'sup', 'inf', 'log', 'ln',
  'exp', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
  'gcd', 'det', 'dim', 'rank', 'mod', 'bmod', 'pmod', 'partial', 'nabla', 'ell', 'hbar',
  'Re', 'Im', 'angle', 'triangle', 'degree', 'circ', 'prime', 'ldots', 'cdots', 'vdots',
  'ddots', 'to', 'rightarrow', 'leftarrow', 'leftrightarrow', 'mapsto', 'Rightarrow',
  'Leftarrow', 'Leftrightarrow', 'iff', 'implies', 'gets', 'xrightarrow', 'xleftarrow',
  // Common Greek names, including variant forms.
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
  'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'varpi',
  'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi',
  'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi',
  'Psi', 'Omega',
  // The only supported environments. begin/end are paired below.
  'begin', 'end',
]);
const SAFE_TEX_ENVIRONMENTS = new Set([
  'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix',
  'cases', 'aligned', 'array',
]);

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const HTML_MARKUP = /(?:<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?\s*\/?>|<!|<\?)/u;
const ACTIVE_HTML_PREFIX = /<\/?(?:script|iframe|object|embed|svg|style|link|meta|img)\b/i;
const EVENT_ATTRIBUTE = /<[^>]*\bon[a-z][a-z0-9_-]*\s*=/i;
const ACTIVE_SCHEME = /\b(?:javascript|vbscript)\s*:/i;
const DATA_RESOURCE_SCHEME = /\bdata\s*:\s*[a-z][a-z0-9.+-]*\/[a-z0-9.+-]+/i;
const EXTERNAL_LOADER = /(?:\burl\s*\(|@import\b|\bfetch\s*\(|\bimport\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\b(?:eval|Function)\s*\()/i;
const MARKDOWN_IMAGE = /!\s*\[/u;

function invalidContent() {
  reject(422, 'VALIDATION_ERROR');
}

function invalidGraph() {
  reject(422, 'INVALID_REFERENCE_GRAPH');
}

function asJsonBytes(value, limitError = invalidContent) {
  try {
    return canonicalize(value).byteLength;
  } catch {
    limitError();
  }
}

function assertCanonicalQuestion(input, parsed, fail = invalidContent) {
  try {
    if (!Buffer.from(canonicalize(input)).equals(Buffer.from(canonicalize(parsed)))) fail();
  } catch {
    fail();
  }
}

function assertPlainRecord(value) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) invalidContent();
  } catch {
    invalidContent();
  }
}

function assertJsonTree(root, fail = invalidContent) {
  const pending = [{ value: root, depth: 0, exit: false }];
  const active = new WeakSet();
  const complete = new WeakSet();
  let count = 0;
  try {
    while (pending.length > 0) {
      const { value, depth, exit } = pending.pop();
      if (exit) {
        active.delete(value);
        complete.add(value);
        continue;
      }
      count += 1;
      if (count > MAX_JSON_VALUES || depth > MAX_REFERENCE_DEPTH) fail();
      if (value === null || typeof value === 'boolean') continue;
      if (typeof value === 'string') {
        if (!value.isWellFormed()) fail();
        continue;
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail();
        continue;
      }
      if (typeof value !== 'object' || active.has(value) || Object.getOwnPropertySymbols(value).length > 0) fail();
      if (complete.has(value)) continue;
      active.add(value);
      pending.push({ value, depth, exit: true });
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_JSON_VALUES
            || Object.getOwnPropertyNames(value).length !== value.length + 1) fail();
        for (let index = value.length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
          pending.push({ value: descriptor.value, depth: depth + 1 });
        }
      } else {
        if (Object.getPrototypeOf(value) !== Object.prototype) fail();
        const keys = Object.getOwnPropertyNames(value);
        if (keys.length > MAX_JSON_VALUES) fail();
        for (const key of keys) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
          pending.push({ value: descriptor.value, depth: depth + 1 });
        }
      }
    }
  } catch {
    fail();
  }
}

function hasMarkdownImage(value, allowInertBracketText = false) {
  if (!allowInertBracketText) return MARKDOWN_IMAGE.test(value);
  return /!\[|!\s+\[[^\]]*\]\s*(?:\(|\[)/u.test(value);
}

function assertRenderedString(value, options = {}) {
  if (typeof value !== 'string' || !value.isWellFormed?.() || CONTROL_CHARACTERS.test(value)
      || ACTIVE_HTML_PREFIX.test(value) || HTML_MARKUP.test(value) || EVENT_ATTRIBUTE.test(value)
      || ACTIVE_SCHEME.test(value) || DATA_RESOURCE_SCHEME.test(value) || EXTERNAL_LOADER.test(value)
      || hasMarkdownImage(value, options.allowInertBracketText === true)) invalidContent();
}

function validateTex(tex) {
  assertRenderedString(tex);
  if (tex.length > 4_000 || tex.endsWith('\\')) invalidContent();

  let braceDepth = 0;
  const environments = [];
  for (let index = 0; index < tex.length; index += 1) {
    const character = tex[index];
    if (character === '\\') {
      const next = tex[index + 1];
      if (next === undefined) invalidContent();
      let command;
      let end = index + 1;
      if (/[A-Za-z]/u.test(next)) {
        while (end < tex.length && /[A-Za-z]/u.test(tex[end])) end += 1;
        command = tex.slice(index + 1, end);
      } else {
        command = next;
        end = index + 2;
      }
      if (!SAFE_TEX_COMMANDS.has(command)) invalidContent();
      if (command === 'begin' || command === 'end') {
        const environment = /^\{([A-Za-z*]+)\}/u.exec(tex.slice(end));
        if (!environment || !SAFE_TEX_ENVIRONMENTS.has(environment[1])) invalidContent();
        if (command === 'begin') {
          environments.push(environment[1]);
          if (environments.length > 32) invalidContent();
        } else if (environments.pop() !== environment[1]) {
          invalidContent();
        }
      }
      index = end - 1;
      continue;
    }
    if (character === '%') invalidContent();
    if (character === '{') {
      braceDepth += 1;
      if (braceDepth > 64) invalidContent();
    } else if (character === '}') {
      braceDepth -= 1;
      if (braceDepth < 0) invalidContent();
    }
  }
  if (braceDepth !== 0 || environments.length !== 0) invalidContent();
}

function scanBlock(block, assets, options = {}) {
  const parsed = BlockSchema.safeParse(block);
  if (!parsed.success) invalidContent();
  switch (block.type) {
    case 'text':
      assertRenderedString(block.text, options);
      break;
    case 'math':
      validateTex(block.tex);
      assertRenderedString(block.accessibleText, options);
      break;
    case 'table':
      assertRenderedString(block.caption, options);
      for (const value of block.headers) assertRenderedString(value, options);
      for (const row of block.rows) for (const value of row) assertRenderedString(value, options);
      break;
    case 'image':
      assertRenderedString(block.alt, options);
      if (!block.alt.trim() || block.alt.length > 2_000) invalidContent();
      if (block.caption !== undefined) assertRenderedString(block.caption, options);
      assets.add(block.assetVersionId);
      break;
    default:
      invalidContent();
  }
}

function scanBlocks(blocks, assets, options = {}) {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 100) invalidContent();
  for (const block of blocks) scanBlock(block, assets, options);
}

function scanInteraction(interaction, assets, options = {}) {
  if (!interaction || typeof interaction !== 'object') invalidContent();
  if (interaction.type === 'CLOZE') {
    for (const field of interaction.fields) {
      assertRenderedString(field.label, options);
      if (!field.label.trim()) invalidContent();
    }
    return;
  }
  if (interaction.type === 'MATCHING') {
    for (const row of interaction.rows) {
      assertRenderedString(row.label, options);
      if (!row.label.trim()) invalidContent();
    }
    for (const target of interaction.targets) {
      assertRenderedString(target.label, options);
      if (!target.label.trim()) invalidContent();
    }
    return;
  }
  if (interaction.type === 'NUMERIC_RESPONSE') {
      assertRenderedString(interaction.label, options);
    if (!interaction.label.trim() || interaction.label.length > 200) invalidContent();
    return;
  }
  if (interaction.type === 'TRUE_FALSE_GROUP') {
    for (const statement of interaction.statements) scanBlocks(statement.content, assets, options);
  } else {
    for (const option of interaction.options) scanBlocks(option.content, assets, options);
  }
}

function questionSchemaForVersion(schemaVersion, { numericQuestions = false, clozeMatching = false } = {}) {
  if (schemaVersion === 'question/1') return QuestionVersionSchema;
  if (schemaVersion === 'question/2' && (numericQuestions || clozeMatching)) return QuestionVersionV2Schema;
  if (schemaVersion === 'question/3' && clozeMatching) return QuestionVersionV3Schema;
  return null;
}

function scanQuestion(question, assets, options = {}) {
  const schema = questionSchemaForVersion(question.schemaVersion, options);
  if (!schema) invalidContent();
  const parsed = schema.safeParse(question);
  if (!parsed.success) invalidContent();
  assertCanonicalQuestion(question, parsed.data);
  const renderedOptions = { ...options,
    allowInertBracketText: question.schemaVersion === 'question/3' && options.clozeMatching === true };
  scanBlocks(question.content, assets, renderedOptions);
  scanInteraction(question.interaction, assets, renderedOptions);
  scanBlocks(question.private.explanation, assets, renderedOptions);
}

function requiredQuestionRoots(question, options = {}) {
  const roots = [{ kind: 'taxonomy', id: question.taxonomyVersionId }];
  if (question.parentVersionId !== null) roots.push({ kind: 'question', id: question.parentVersionId });
  if (question.stimulusVersionId !== null) roots.push({ kind: 'stimulus', id: question.stimulusVersionId });
  for (const id of question.provenanceIds) roots.push({ kind: 'provenance', id });
  for (const id of question.private.evidenceRefs) roots.push({ kind: 'evidence', id });
  const assets = new Set();
  const renderedOptions = { ...options,
    allowInertBracketText: question.schemaVersion === 'question/3' && options.clozeMatching === true };
  scanBlocks(question.content, assets, renderedOptions);
  scanInteraction(question.interaction, assets, renderedOptions);
  scanBlocks(question.private.explanation, assets, renderedOptions);
  for (const id of assets) roots.push({ kind: 'asset', id });
  return roots;
}

function parseReferenceNodes(references) {
  if (!Array.isArray(references) || references.length > MAX_REFERENCE_NODES) invalidGraph();
  assertJsonTree(references, invalidGraph);
  const nodes = new Map();
  for (const node of references) {
    try {
      strictRecord(node, ['kind', 'id', 'payload', 'references', 'contentHash'], 'reference');
    } catch {
      invalidGraph();
    }
    if (!REFERENCE_KINDS.has(node.kind) || typeof node.id !== 'string' || !node.id.trim()
        || node.id.length > 2_048 || CONTROL_CHARACTERS.test(node.id) || !HASH_PATTERN.test(node.contentHash)
        || !Array.isArray(node.references) || node.references.length > MAX_REFERENCE_NODES) invalidGraph();
    const key = referenceKey(node.kind, node.id);
    if (nodes.has(key)) invalidGraph();
    const seenEdges = new Set();
    for (const edge of node.references) {
      try {
        strictRecord(edge, ['kind', 'id'], 'reference edge');
      } catch {
        invalidGraph();
      }
      if (!REFERENCE_KINDS.has(edge.kind) || typeof edge.id !== 'string' || !edge.id.trim()
          || edge.id.length > 2_048 || CONTROL_CHARACTERS.test(edge.id)) invalidGraph();
      const edgeKey = referenceKey(edge.kind, edge.id);
      if (seenEdges.has(edgeKey)) invalidGraph();
      seenEdges.add(edgeKey);
    }
    nodes.set(key, node);
  }

  let bytes = 0;
  for (const node of nodes.values()) {
    try {
      const edges = node.references.map((edge) => {
        const child = nodes.get(referenceKey(edge.kind, edge.id));
        if (!child) invalidGraph();
        return { ...edge, contentHash: child.contentHash };
      }).sort(compareReference);
      const referenceBytes = canonicalize({
        version: 'reference/1',
        kind: node.kind,
        id: node.id,
        payload: node.payload,
        references: edges,
      }).byteLength;
      bytes += referenceBytes;
    } catch {
      invalidGraph();
    }
    if (bytes > MAX_REFERENCE_BYTES) invalidGraph();
  }
  return nodes;
}

function assertExactEdges(node, requiredRoots) {
  const expected = new Set(requiredRoots.map(({ kind, id }) => referenceKey(kind, id)));
  const actual = new Set(node.references.map(({ kind, id }) => referenceKey(kind, id)));
  if (actual.size !== expected.size || [...expected].some((key) => !actual.has(key))) invalidGraph();
}

function validateStimulus(node, assets, options = {}) {
  try {
    strictRecord(node.payload, ['content', 'provenanceIds'], 'stimulus');
  } catch {
    invalidGraph();
  }
  if (!Array.isArray(node.payload.provenanceIds) || node.payload.provenanceIds.length > MAX_REFERENCE_NODES
      || node.payload.provenanceIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 2_048)
      || new Set(node.payload.provenanceIds).size !== node.payload.provenanceIds.length) invalidGraph();
  const stimulusAssets = new Set();
  scanBlocks(node.payload.content, stimulusAssets, options);
  for (const id of stimulusAssets) assets.add(id);
  const roots = node.payload.provenanceIds.map((id) => ({ kind: 'provenance', id }));
  for (const id of stimulusAssets) roots.push({ kind: 'asset', id });
  assertExactEdges(node, roots);
}

function validateQuestionReference(node, assets, options = {}) {
  assertPlainRecord(node.payload);
  if (Object.hasOwn(node.payload, 'contentHash')) invalidGraph();
  let question;
  try {
    const input = { ...node.payload, contentHash: HASH_PLACEHOLDER };
    const schema = questionSchemaForVersion(node.payload.schemaVersion, options);
    if (!schema) invalidGraph();
    question = schema.parse(input);
    assertCanonicalQuestion(input, question, invalidGraph);
  } catch {
    invalidGraph();
  }
  if (question.id !== node.id) invalidGraph();
  scanQuestion(question, assets, options);
  assertExactEdges(node, requiredQuestionRoots(question, options));
}

function validateReferenceClosure(question, nodes, rootAssets, options = {}) {
  const roots = requiredQuestionRoots(question, options);
  const reachable = new Set();
  const active = new Set();
  const visit = (ref, depth) => {
    if (depth > MAX_REFERENCE_DEPTH) invalidGraph();
    const key = referenceKey(ref.kind, ref.id);
    const node = nodes.get(key);
    if (!node) invalidGraph();
    if (active.has(key)) invalidGraph();
    if (reachable.has(key)) return;
    active.add(key);
    if (node.kind === 'question') validateQuestionReference(node, rootAssets, options);
    if (node.kind === 'stimulus') validateStimulus(node, rootAssets, options);
    for (const edge of node.references) visit(edge, depth + 1);
    active.delete(key);
    reachable.add(key);
  };
  for (const root of roots) visit(root, 0);
  if (reachable.size !== nodes.size) invalidGraph();
  return roots;
}

/**
 * Fail closed unless the canonical question and every rendered parent/stimulus
 * block use a supported profile. Numeric interactions, cloze/matching, and
 * inspected images need their explicit opt-ins; authored data is never rewritten.
 */
/** The supported LaTeX subset, exposed so authoring instructions can be checked against the real allowlist. */
export const SUPPORTED_TEX_COMMANDS = Object.freeze([...SAFE_TEX_COMMANDS]);
export const SUPPORTED_TEX_ENVIRONMENTS = Object.freeze([...SAFE_TEX_ENVIRONMENTS]);

/** Boolean forms of the rendered-text and TeX checks, so authors can be told about a problem before any import. */
export function isSafeRenderedString(value) {
  try { assertRenderedString(value); return true; } catch { return false; }
}
export function isSafeTex(tex) {
  try { validateTex(tex); return true; } catch { return false; }
}

export function assertSafeQuestionContent(question, references,
  { inspectedImages = false, numericQuestions = false, clozeMatching = false } = {}) {
  if (typeof inspectedImages !== 'boolean' || typeof numericQuestions !== 'boolean'
      || typeof clozeMatching !== 'boolean') invalidContent();
  assertPlainRecord(question);
  assertJsonTree(question);
  const options = { numericQuestions, clozeMatching,
    allowInertBracketText: question.schemaVersion === 'question/3' && clozeMatching };
  const schema = questionSchemaForVersion(question.schemaVersion, options);
  if (!schema) invalidContent();
  const parsed = schema.safeParse(question);
  if (!parsed.success) invalidContent();
  if (!HASH_PATTERN.test(question.contentHash) || asJsonBytes(question) > QUESTION_BYTES_LIMIT) invalidContent();

  const assets = new Set();
  scanQuestion(question, assets, options);
  const nodes = parseReferenceNodes(references);
  const roots = validateReferenceClosure(question, nodes, assets, options);
  for (const id of assets) {
    if (!nodes.has(referenceKey('asset', id))) invalidGraph();
  }
  if (!inspectedImages && (roots.some(({ kind }) => kind === 'asset') || [...nodes.values()].some(({ kind }) => kind === 'asset'))) {
    reject(422, 'ASSET_SANITIZATION_REQUIRED');
  }
  if (inspectedImages) {
    // This branch validates content only. The Bank writer separately verifies
    // every immutable object before recording the inspected-image profile.
    for (const node of nodes.values()) if (node.kind === 'asset') {
      const asset = node.payload;
      if (!asset || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mediaType)
          || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1 || asset.byteLength > 2 * 1024 * 1024
          || !HASH_PATTERN.test(asset.bytesHash) || node.references.length !== 0) invalidGraph();
    }
  }
  return true;
}
