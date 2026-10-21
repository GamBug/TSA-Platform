import {
  BlockSchema,
  QuestionVersionSchema,
  canonicalize,
} from '../../../packages/contracts/dist/internal.js';
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

function assertRenderedString(value) {
  if (typeof value !== 'string' || !value.isWellFormed?.() || CONTROL_CHARACTERS.test(value)
      || ACTIVE_HTML_PREFIX.test(value) || HTML_MARKUP.test(value) || EVENT_ATTRIBUTE.test(value)
      || ACTIVE_SCHEME.test(value) || DATA_RESOURCE_SCHEME.test(value) || EXTERNAL_LOADER.test(value)
      || MARKDOWN_IMAGE.test(value)) invalidContent();
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

function scanBlock(block, assets) {
  const parsed = BlockSchema.safeParse(block);
  if (!parsed.success) invalidContent();
  switch (block.type) {
    case 'text':
      assertRenderedString(block.text);
      break;
    case 'math':
      validateTex(block.tex);
      assertRenderedString(block.accessibleText);
      break;
    case 'table':
      assertRenderedString(block.caption);
      for (const value of block.headers) assertRenderedString(value);
      for (const row of block.rows) for (const value of row) assertRenderedString(value);
      break;
    case 'image':
      assertRenderedString(block.alt);
      if (block.caption !== undefined) assertRenderedString(block.caption);
      assets.add(block.assetVersionId);
      break;
    default:
      invalidContent();
  }
}

function scanBlocks(blocks, assets) {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 100) invalidContent();
  for (const block of blocks) scanBlock(block, assets);
}

function scanInteraction(interaction, assets) {
  if (!interaction || typeof interaction !== 'object') invalidContent();
  if (interaction.type === 'TRUE_FALSE_GROUP') {
    for (const statement of interaction.statements) scanBlocks(statement.content, assets);
  } else {
    for (const option of interaction.options) scanBlocks(option.content, assets);
  }
}

function scanQuestion(question, assets) {
  const parsed = QuestionVersionSchema.safeParse(question);
  if (!parsed.success) invalidContent();
  assertCanonicalQuestion(question, parsed.data);
  scanBlocks(question.content, assets);
  scanInteraction(question.interaction, assets);
  scanBlocks(question.private.explanation, assets);
}

function requiredQuestionRoots(question) {
  const roots = [{ kind: 'taxonomy', id: question.taxonomyVersionId }];
  if (question.parentVersionId !== null) roots.push({ kind: 'question', id: question.parentVersionId });
  if (question.stimulusVersionId !== null) roots.push({ kind: 'stimulus', id: question.stimulusVersionId });
  for (const id of question.provenanceIds) roots.push({ kind: 'provenance', id });
  for (const id of question.private.evidenceRefs) roots.push({ kind: 'evidence', id });
  const assets = new Set();
  scanBlocks(question.content, assets);
  scanInteraction(question.interaction, assets);
  scanBlocks(question.private.explanation, assets);
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

function validateStimulus(node, assets) {
  try {
    strictRecord(node.payload, ['content', 'provenanceIds'], 'stimulus');
  } catch {
    invalidGraph();
  }
  if (!Array.isArray(node.payload.provenanceIds) || node.payload.provenanceIds.length > MAX_REFERENCE_NODES
      || node.payload.provenanceIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 2_048)
      || new Set(node.payload.provenanceIds).size !== node.payload.provenanceIds.length) invalidGraph();
  scanBlocks(node.payload.content, assets);
  const roots = node.payload.provenanceIds.map((id) => ({ kind: 'provenance', id }));
  for (const id of assets) roots.push({ kind: 'asset', id });
  assertExactEdges(node, roots);
}

function validateQuestionReference(node, assets) {
  assertPlainRecord(node.payload);
  if (Object.hasOwn(node.payload, 'contentHash')) invalidGraph();
  let question;
  try {
    const input = { ...node.payload, contentHash: HASH_PLACEHOLDER };
    question = QuestionVersionSchema.parse(input);
    assertCanonicalQuestion(input, question, invalidGraph);
  } catch {
    invalidGraph();
  }
  if (question.id !== node.id) invalidGraph();
  scanQuestion(question, assets);
  assertExactEdges(node, requiredQuestionRoots(question));
}

function validateReferenceClosure(question, nodes, rootAssets) {
  const roots = requiredQuestionRoots(question);
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
    if (node.kind === 'question') validateQuestionReference(node, rootAssets);
    if (node.kind === 'stimulus') validateStimulus(node, rootAssets);
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
 * block use the supported text/math/table profile. The function never rewrites
 * authored data and deliberately rejects all asset-bearing graphs.
 */
export function assertSafeQuestionContent(question, references) {
  assertPlainRecord(question);
  assertJsonTree(question);
  const parsed = QuestionVersionSchema.safeParse(question);
  if (!parsed.success) invalidContent();
  if (!HASH_PATTERN.test(question.contentHash) || asJsonBytes(question) > QUESTION_BYTES_LIMIT) invalidContent();

  const assets = new Set();
  scanQuestion(question, assets);
  const nodes = parseReferenceNodes(references);
  const roots = validateReferenceClosure(question, nodes, assets);
  for (const id of assets) {
    if (!nodes.has(referenceKey('asset', id))) invalidGraph();
  }
  if (roots.some(({ kind }) => kind === 'asset') || [...nodes.values()].some(({ kind }) => kind === 'asset')) {
    reject(422, 'ASSET_SANITIZATION_REQUIRED');
  }
  return true;
}
