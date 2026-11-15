// Portable question exchange format: the one contract an outside author (human or AI) needs in order to produce
// questions that the Bank can import as DRAFTs. It is deliberately independent of the Bank's internal identifiers:
// questions use readable ids, images use library asset ids, and nothing here carries a source, a right or a state
// beyond DRAFT. `toInternalParts` maps a validated question onto the existing question/1, /2 and /3 shapes.
import { z } from "zod";
import { normalizeClozeText } from "./cloze-matching.ts";
import { normalizeDecimal } from "./numeric-response.ts";

export const QUESTION_VERSION = "tsa-question/1" as const;
export const QUESTION_SET_FORMAT = "tsa-question-set/1" as const;

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_GROUP",
  "NUMERIC",
  "CLOZE",
  "MATCHING",
] as const;
export type ExchangeQuestionType = (typeof QUESTION_TYPES)[number];
export const SUBJECTS = ["MATH", "READING", "SCIENCE"] as const;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

const READABLE_ID = /^[A-Z][A-Z0-9]{1,11}(?:-[A-Z0-9]{2,12}){1,4}-[0-9]{3,8}$/;
export const ASSET_ID_PATTERN = /^IMG-[A-Z][A-Z0-9]{1,7}-[0-9]{6}$/;
const CHOICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/;
const STABLE_ID = /^[a-z][a-z0-9_-]{0,39}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const MARKUP = /[<>]/u;
/** Inline formulas inside text blocks: a dollar-delimited span with no space after the opening or before the closing delimiter. */
const INLINE_MATH = /\$(?=\S)([^$]+?)(?<=\S)\$/gu;

const QuestionIdSchema = z.string().regex(READABLE_ID, "Expected an id such as MATH-GEO-000089 (uppercase segments, final segment 3-8 digits)").meta({ id: "QuestionId" });
const PassageIdSchema = z.string().regex(READABLE_ID, "Expected an id such as READ-PASSAGE-000001").meta({ id: "PassageId" });
const AssetIdSchema = z.string().regex(ASSET_ID_PATTERN, "Expected an existing library asset id such as IMG-GEO-000123").meta({ id: "AssetId" });
const ChoiceIdSchema = z.string().regex(CHOICE_ID, "Option and statement ids use letters, digits, '_' or '-' (1-16 characters)").meta({ id: "ChoiceId" });
const StableIdSchema = z.string().regex(STABLE_ID, "Ids use lowercase letters, digits, '_' or '-', starting with a letter (1-40 characters)").meta({ id: "StableId" });
const PlainLabelSchema = z
  .string()
  .min(1)
  .max(2_000)
  .refine((value) => value.trim().length > 0, "Label must not be blank")
  .refine((value) => !CONTROL.test(value) && !MARKUP.test(value), "Label must be plain text: no markup characters '<' or '>' and no control characters").meta({ id: "PlainLabel" });

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string().min(1).max(20_000) }).strict(),
  z
    .object({
      type: z.literal("math"),
      format: z.literal("latex"),
      content: z.string().min(1).max(4_000),
      display: z.boolean().default(false),
      accessible_text: z.string().min(1).max(2_000),
    })
    .strict(),
  z.object({ type: z.literal("image"), asset_id: AssetIdSchema, alt: z.string().min(1).max(1_000), caption: z.string().min(1).max(1_000).optional() }).strict(),
  z
    .object({
      type: z.literal("image_request"),
      request_id: z.string().regex(/^NEW-IMG-[0-9]{3,6}$/, "Expected a request id such as NEW-IMG-001"),
      description: z.string().min(10).max(2_000),
      alt: z.string().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("table"),
      caption: z.string().min(1).max(1_000),
      headers: z.array(z.string().min(1).max(500)).min(1).max(20),
      rows: z.array(z.array(z.string().max(1_000)).min(1).max(20)).min(1).max(100),
    })
    .strict(),
]).meta({ id: "ContentBlock" });
export type ExchangeContentBlock = z.infer<typeof ContentBlockSchema>;
const BlocksSchema = z.array(ContentBlockSchema).min(1).max(100).meta({ id: "ContentBlocks" });

const OptionSchema = z.object({ option_id: ChoiceIdSchema, content_blocks: BlocksSchema }).strict().meta({ id: "Option" });
const TagSchema = z.string().min(1).max(40).regex(/^[a-z0-9][a-z0-9_-]*$/, "Tags are lowercase words joined by '-' or '_'").meta({ id: "Tag" });

const MetadataSchema = z
  .object({
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    status: z.literal("DRAFT"),
    content_version: z.number().int().min(1).max(10_000),
  })
  .strict().meta({ id: "Metadata" });

const ScoringSchema = z.object({ policy: z.literal("BINARY_ALL_OR_NOTHING"), points: z.literal(1) }).strict().meta({ id: "ScoringConfig" });

const common = {
  schema_version: z.literal(QUESTION_VERSION),
  question_id: QuestionIdSchema,
  subject: z.enum(SUBJECTS),
  topic: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/, "Topic is an UPPER_SNAKE_CASE code such as PROBABILITY"),
  subtopic: z.string().min(1).max(120).optional(),
  difficulty: z.enum(DIFFICULTIES),
  tags: z.array(TagSchema).max(10).default([]),
  content_blocks: BlocksSchema,
  passage_ref: PassageIdSchema.optional(),
  asset_refs: z.array(AssetIdSchema).max(50),
  explanation: BlocksSchema,
  scoring_config: ScoringSchema,
  metadata: MetadataSchema,
};

const single = z
  .object({
    ...common,
    question_type: z.literal("SINGLE_CHOICE"),
    options: z.array(OptionSchema).min(2).max(10),
    response_config: z.object({ selection: z.literal("SINGLE") }).strict(),
    answer: z.object({ option_id: ChoiceIdSchema }).strict(),
    answer_validation: z.object({ match: z.literal("EXACT_SELECTION") }).strict(),
  })
  .strict();

const multiple = z
  .object({
    ...common,
    question_type: z.literal("MULTIPLE_CHOICE"),
    options: z.array(OptionSchema).min(2).max(10),
    response_config: z
      .object({ selection: z.literal("MULTIPLE"), min_selections: z.number().int().min(1), max_selections: z.number().int().min(1) })
      .strict(),
    answer: z.object({ option_ids: z.array(ChoiceIdSchema).min(1).max(10) }).strict(),
    answer_validation: z.object({ match: z.literal("EXACT_SELECTION") }).strict(),
  })
  .strict();

const trueFalse = z
  .object({
    ...common,
    question_type: z.literal("TRUE_FALSE_GROUP"),
    response_config: z
      .object({ statements: z.array(z.object({ statement_id: ChoiceIdSchema, content_blocks: BlocksSchema }).strict()).min(1).max(10) })
      .strict(),
    answer: z.object({ values: z.record(ChoiceIdSchema, z.boolean()) }).strict(),
    answer_validation: z.object({ match: z.literal("ALL_STATEMENTS_CORRECT") }).strict(),
  })
  .strict();

const numeric = z
  .object({
    ...common,
    question_type: z.literal("NUMERIC"),
    response_config: z.object({ label: PlainLabelSchema, format: z.literal("DECIMAL") }).strict(),
    answer: z.object({ value: z.string().max(64) }).strict(),
    answer_validation: z.object({ match: z.literal("EXACT_DECIMAL") }).strict(),
  })
  .strict();

const cloze = z
  .object({
    ...common,
    question_type: z.literal("CLOZE"),
    response_config: z
      .object({
        fields: z.array(z.object({ field_id: StableIdSchema, label: PlainLabelSchema }).strict()).min(1).max(20),
        max_length: z.number().int().min(1).max(256),
      })
      .strict(),
    answer: z.object({ accepted_values: z.record(StableIdSchema, z.array(z.string().min(1)).min(1).max(16)) }).strict(),
    answer_validation: z
      .object({ match: z.literal("EXACT_AFTER_NFC_TRIM"), case_sensitive: z.literal(true), diacritics: z.literal("PRESERVE") })
      .strict(),
  })
  .strict();

const matching = z
  .object({
    ...common,
    question_type: z.literal("MATCHING"),
    response_config: z
      .object({
        rows: z.array(z.object({ row_id: StableIdSchema, label: PlainLabelSchema }).strict()).min(1).max(40),
        targets: z
          .array(z.object({ target_id: StableIdSchema, label: PlainLabelSchema, max_uses: z.number().int().min(1).max(40) }).strict())
          .min(1)
          .max(40),
      })
      .strict(),
    answer: z.object({ assignments: z.record(StableIdSchema, StableIdSchema) }).strict(),
    answer_validation: z.object({ match: z.literal("EXACT_ASSIGNMENT") }).strict(),
  })
  .strict();

export const QUESTION_SCHEMAS = {
  SINGLE_CHOICE: single,
  MULTIPLE_CHOICE: multiple,
  TRUE_FALSE_GROUP: trueFalse,
  NUMERIC: numeric,
  CLOZE: cloze,
  MATCHING: matching,
} as const;

export const QuestionSchema = z.discriminatedUnion("question_type", [single, multiple, trueFalse, numeric, cloze, matching]);
export type ExchangeQuestion = z.infer<typeof QuestionSchema>;

export const PassageSchema = z
  .object({
    passage_id: PassageIdSchema,
    title: z.string().min(1).max(300).optional(),
    content_blocks: BlocksSchema,
    asset_refs: z.array(AssetIdSchema).max(50).default([]),
  })
  .strict();
export type ExchangePassage = z.infer<typeof PassageSchema>;

export const QuestionSetSchema = z
  .object({
    format: z.literal(QUESTION_SET_FORMAT),
    batch_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/, "Batch ids are 3-64 characters of letters, digits, '.', '_' or '-'"),
    passages: z.array(PassageSchema).max(50).default([]),
    questions: z.array(QuestionSchema).min(1).max(200),
  })
  .strict();
export type ExchangeQuestionSet = z.infer<typeof QuestionSetSchema>;

/** One reportable problem. `path` is a JSON-pointer-like location such as questions[2].answer.option_id. */
export interface ExchangeIssue {
  path: string;
  code: string;
  message: string;
}

export interface ValidationEnvironment {
  /** Known library asset ids. When omitted, asset existence is not checked (reported as a warning). */
  assets?: ReadonlySet<string> | readonly string[] | undefined;
  /** Rendered-text safety (no markup, no active content). Supplied by the host; defaults to a conservative built-in check. */
  isSafeText?: ((value: string) => boolean) | undefined;
  /** TeX safety against the Bank's command allowlist. When omitted TeX is only length-checked. */
  isSafeTex?: ((value: string) => boolean) | undefined;
}

export interface ValidationReport {
  ok: boolean;
  errors: ExchangeIssue[];
  warnings: ExchangeIssue[];
  summary: { questions: number; byType: Record<string, number>; questionsNeedingAssets: string[]; invalidQuestions: string[] };
  /** Present only when ok. The parsed, defaults-applied set. */
  value?: ExchangeQuestionSet;
}

const pathText = (path: ReadonlyArray<PropertyKey>): string =>
  path.reduce<string>((text, part) => (typeof part === "number" ? `${text}[${part}]` : text === "" ? String(part) : `${text}.${String(part)}`), "");

const defaultSafeText = (value: string): boolean =>
  !CONTROL.test(value) &&
  !/<\/?[A-Za-z!?]/u.test(value) &&
  !/\b(?:javascript|vbscript)\s*:/iu.test(value) &&
  !/\bdata\s*:\s*[a-z]+\/[a-z0-9.+-]+/iu.test(value) &&
  !/!\s*\[/u.test(value);

function blocksOf(question: ExchangeQuestion): Array<{ path: string; block: ExchangeContentBlock }> {
  const found: Array<{ path: string; block: ExchangeContentBlock }> = [];
  const add = (blocks: readonly ExchangeContentBlock[], base: string) => blocks.forEach((block, index) => found.push({ path: `${base}[${index}]`, block }));
  add(question.content_blocks, "content_blocks");
  add(question.explanation, "explanation");
  if (question.question_type === "SINGLE_CHOICE" || question.question_type === "MULTIPLE_CHOICE") {
    question.options.forEach((option, index) => add(option.content_blocks, `options[${index}].content_blocks`));
  }
  if (question.question_type === "TRUE_FALSE_GROUP") {
    question.response_config.statements.forEach((statement, index) => add(statement.content_blocks, `response_config.statements[${index}].content_blocks`));
  }
  return found;
}


const classify = (issue: { code: string; message: string }): { code: string; message: string } => {
  if (issue.code === "unrecognized_keys") return { code: "UNKNOWN_FIELD", message: issue.message };
  if (issue.code === "invalid_key") return { code: "INVALID_KEY", message: issue.message };
  if (issue.code === "invalid_type" && /received undefined/u.test(issue.message)) return { code: "MISSING_FIELD", message: "This required field is missing" };
  return { code: "INVALID_FIELD", message: issue.message };
};

const dupes = (values: readonly string[]): string[] => values.filter((value, index) => values.indexOf(value) !== index);

function semanticIssues(question: ExchangeQuestion, environment: ValidationEnvironment): ExchangeIssue[] {
  const issues: ExchangeIssue[] = [];
  const at = (path: string, code: string, message: string) => issues.push({ path, code, message });

  if (question.metadata.updated_at < question.metadata.created_at) at("metadata.updated_at", "TIMESTAMP_ORDER", "updated_at must not be earlier than created_at");

  const safeText = environment.isSafeText ?? defaultSafeText;
  for (const { path, block } of blocksOf(question)) {
    if (block.type === "text") {
      if (!safeText(block.content)) at(`${path}.content`, "UNSAFE_TEXT", "Text must not contain HTML or other markup, scripts, data: URLs or Markdown images; use math, table and image blocks");
      else if (environment.isSafeTex) {
        for (const match of block.content.matchAll(INLINE_MATH)) {
          if (!environment.isSafeTex(match[1] ?? "")) { at(`${path}.content`, "UNSUPPORTED_TEX", `An inline formula in this text uses a command or environment outside the supported subset: ${match[1]}`); break; }
        }
      }
    }
    if (block.type === "math") {
      if (!safeText(block.content)) at(`${path}.content`, "UNSAFE_TEXT", "Math must not contain markup or active content");
      else if (environment.isSafeTex && !environment.isSafeTex(block.content)) at(`${path}.content`, "UNSUPPORTED_TEX", "This LaTeX uses a command or environment outside the supported subset");
    }
    if (block.type === "table") {
      block.rows.forEach((row, index) => {
        if (row.length !== block.headers.length) at(`${path}.rows[${index}]`, "TABLE_WIDTH", "Every table row must have as many cells as headers");
      });
      for (const cell of [...block.headers, ...block.rows.flat(), block.caption]) {
        if (!safeText(cell)) { at(`${path}`, "UNSAFE_TEXT", "Table text must not contain markup or active content"); break; }
      }
    }
    if ((block.type === "image" || block.type === "image_request") && !safeText(block.alt)) at(`${path}.alt`, "UNSAFE_TEXT", "Alternative text must be plain text");
  }

  // Image references: the declared list must equal the images actually used.
  const used = blocksOf(question).flatMap(({ block }) => (block.type === "image" ? [block.asset_id] : []));
  const declared = new Set(question.asset_refs);
  for (const id of dupes(question.asset_refs)) at("asset_refs", "DUPLICATE_ASSET_REF", `asset_refs lists ${id} more than once`);
  for (const id of new Set(used)) if (!declared.has(id)) at("asset_refs", "ASSET_REF_MISSING", `Image ${id} is used in the content but is not listed in asset_refs`);
  for (const id of declared) if (!used.includes(id)) at("asset_refs", "ASSET_REF_UNUSED", `asset_refs lists ${id} but no image block uses it`);
  const requestIds = blocksOf(question).flatMap(({ block }) => (block.type === "image_request" ? [block.request_id] : []));
  for (const id of dupes(requestIds)) at("content_blocks", "DUPLICATE_IMAGE_REQUEST", `Image request ${id} is used more than once in one question`);

  switch (question.question_type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const ids = question.options.map((option) => option.option_id);
      for (const id of dupes(ids)) at("options", "DUPLICATE_OPTION_ID", `Option id ${id} is used more than once`);
      const texts = question.options.map((option) => JSON.stringify(option.content_blocks));
      if (new Set(texts).size !== texts.length) at("options", "DUPLICATE_OPTION_CONTENT", "Two options have identical content, so the correct answer would be ambiguous");
      if (question.question_type === "SINGLE_CHOICE") {
        if (!ids.includes(question.answer.option_id)) at("answer.option_id", "ANSWER_NOT_AN_OPTION", `Answer ${question.answer.option_id} is not one of the option ids (${ids.join(", ")})`);
      } else {
        const { min_selections: min, max_selections: max } = question.response_config;
        if (min > max) at("response_config.min_selections", "SELECTION_RANGE", "min_selections must not exceed max_selections");
        if (max > ids.length) at("response_config.max_selections", "SELECTION_RANGE", "max_selections must not exceed the number of options");
        for (const id of dupes(question.answer.option_ids)) at("answer.option_ids", "DUPLICATE_ANSWER", `Answer lists ${id} more than once`);
        for (const id of question.answer.option_ids) if (!ids.includes(id)) at("answer.option_ids", "ANSWER_NOT_AN_OPTION", `Answer ${id} is not one of the option ids (${ids.join(", ")})`);
        const count = new Set(question.answer.option_ids).size;
        if (count < min || count > max) at("answer.option_ids", "ANSWER_COUNT", `The answer selects ${count} options but the question allows ${min} to ${max}`);
      }
      break;
    }
    case "TRUE_FALSE_GROUP": {
      const ids = question.response_config.statements.map((statement) => statement.statement_id);
      for (const id of dupes(ids)) at("response_config.statements", "DUPLICATE_STATEMENT_ID", `Statement id ${id} is used more than once`);
      const keyIds = Object.keys(question.answer.values);
      if (keyIds.length !== ids.length || keyIds.some((id) => !ids.includes(id)) || ids.some((id) => !keyIds.includes(id))) {
        at("answer.values", "ANSWER_COVERAGE", `answer.values must give exactly one true/false value for every statement (${ids.join(", ")})`);
      }
      break;
    }
    case "NUMERIC": {
      if (normalizeDecimal(question.answer.value) !== question.answer.value) {
        at("answer.value", "NUMERIC_FORMAT", "The numeric answer must be a canonical decimal string: optional '-', digits, optional '.' and digits, no thousands separators, no trailing zeros, no '+', no exponent (for example \"0.46\" or \"-12\")");
      }
      break;
    }
    case "CLOZE": {
      const ids = question.response_config.fields.map((field) => field.field_id);
      for (const id of dupes(ids)) at("response_config.fields", "DUPLICATE_FIELD_ID", `Field id ${id} is used more than once`);
      const keyIds = Object.keys(question.answer.accepted_values);
      if (keyIds.length !== ids.length || keyIds.some((id) => !ids.includes(id)) || ids.some((id) => !keyIds.includes(id))) {
        at("answer.accepted_values", "ANSWER_COVERAGE", `accepted_values must list answers for exactly these fields: ${ids.join(", ")}`);
      }
      for (const [fieldId, variants] of Object.entries(question.answer.accepted_values)) {
        const normalized = variants.map(normalizeClozeText);
        if (normalized.some((variant) => variant.length === 0)) at(`answer.accepted_values.${fieldId}`, "BLANK_ANSWER", "Accepted answers must not be blank");
        if (new Set(normalized).size !== normalized.length) at(`answer.accepted_values.${fieldId}`, "DUPLICATE_ANSWER", "Accepted answers must be different after trimming");
        if (variants.some((variant) => [...variant].length > question.response_config.max_length)) at(`answer.accepted_values.${fieldId}`, "ANSWER_TOO_LONG", `An accepted answer is longer than max_length (${question.response_config.max_length})`);
        if (variants.some((variant) => !safeText(variant))) at(`answer.accepted_values.${fieldId}`, "UNSAFE_TEXT", "Accepted answers must be plain text");
      }
      break;
    }
    case "MATCHING": {
      const rowIds = question.response_config.rows.map((row) => row.row_id);
      const targets = new Map(question.response_config.targets.map((target) => [target.target_id, target.max_uses]));
      for (const id of dupes(rowIds)) at("response_config.rows", "DUPLICATE_ROW_ID", `Row id ${id} is used more than once`);
      for (const id of dupes(question.response_config.targets.map((target) => target.target_id))) at("response_config.targets", "DUPLICATE_TARGET_ID", `Target id ${id} is used more than once`);
      const keyIds = Object.keys(question.answer.assignments);
      if (keyIds.length !== rowIds.length || keyIds.some((id) => !rowIds.includes(id)) || rowIds.some((id) => !keyIds.includes(id))) {
        at("answer.assignments", "ANSWER_COVERAGE", `assignments must map exactly these rows: ${rowIds.join(", ")}`);
      }
      const uses = new Map<string, number>();
      for (const [row, target] of Object.entries(question.answer.assignments)) {
        if (!targets.has(target)) at(`answer.assignments.${row}`, "ANSWER_NOT_A_TARGET", `Target ${target} does not exist`);
        else uses.set(target, (uses.get(target) ?? 0) + 1);
      }
      for (const [target, count] of uses) if (count > (targets.get(target) ?? 0)) at("answer.assignments", "TARGET_OVERUSED", `Target ${target} is used ${count} times but max_uses is ${targets.get(target)}`);
      if ([...targets.values()].reduce((sum, value) => sum + value, 0) < rowIds.length) at("response_config.targets", "TARGET_CAPACITY", "The targets' max_uses must allow every row to be assigned");
      for (const text of [...question.response_config.rows.map((row) => row.label), ...question.response_config.targets.map((target) => target.label)]) {
        if (!safeText(text)) { at("response_config", "UNSAFE_TEXT", "Row and target labels must be plain text"); break; }
      }
      break;
    }
  }
  return issues;
}

/**
 * Validate a whole question set. Never throws on bad input: every problem is returned with its location so the
 * author can repair it. Nothing is imported or published by validation.
 */
export function validateQuestionSet(input: unknown, environment: ValidationEnvironment = {}): ValidationReport {
  const errors: ExchangeIssue[] = [];
  const warnings: ExchangeIssue[] = [];
  const byType: Record<string, number> = {};
  const invalid = new Set<string>();
  const needingAssets: string[] = [];
  const empty = (): ValidationReport => ({ ok: false, errors, warnings, summary: { questions: 0, byType, questionsNeedingAssets: [], invalidQuestions: [] } });

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    errors.push({ path: "", code: "NOT_AN_OBJECT", message: "The document must be one JSON object with format, batch_id, passages and questions" });
    return empty();
  }
  const document = input as Record<string, unknown>;
  const rawQuestions = Array.isArray(document.questions) ? document.questions : null;

  // The envelope is checked with opaque questions, which are then validated one by one for clearer messages.
  const envelopeProbe = z
    .object({ format: z.literal(QUESTION_SET_FORMAT), batch_id: QuestionSetSchema.shape.batch_id, passages: z.array(z.unknown()).max(50).default([]), questions: z.array(z.unknown()).min(1).max(200) })
    .strict()
    .safeParse(document);
  if (!envelopeProbe.success) {
    for (const issue of envelopeProbe.error.issues) {
      const path = pathText(issue.path);
      const isFormat = path === "format";
      errors.push({
        path,
        code: isFormat ? "UNSUPPORTED_FORMAT" : issue.code === "unrecognized_keys" ? "UNKNOWN_FIELD" : "INVALID_ENVELOPE",
        message: isFormat ? `format must be "${QUESTION_SET_FORMAT}"` : issue.message,
      });
    }
    if (rawQuestions === null) return empty();
  }

  const questions: ExchangeQuestion[] = [];
  const passageIds = new Set<string>();
  const parsedPassages: ExchangePassage[] = [];
  if (Array.isArray(document.passages)) {
    document.passages.forEach((raw, index) => {
      const result = PassageSchema.safeParse(raw);
      if (!result.success) {
        for (const issue of result.error.issues) errors.push({ path: `passages[${index}]${issue.path.length ? "." + pathText(issue.path) : ""}`, ...classify(issue) });
        return;
      }
      if (passageIds.has(result.data.passage_id)) errors.push({ path: `passages[${index}].passage_id`, code: "DUPLICATE_PASSAGE_ID", message: `Passage id ${result.data.passage_id} is used more than once` });
      passageIds.add(result.data.passage_id);
      parsedPassages.push(result.data);
    });
  }

  const seenIds = new Set<string>();
  const seenStems = new Map<string, string>();
  const knownAssets = environment.assets === undefined ? null : new Set(environment.assets);
  (rawQuestions ?? []).forEach((raw, index) => {
    const base = `questions[${index}]`;
    const type = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).question_type : undefined;
    const label = typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>).question_id === "string" ? String((raw as Record<string, unknown>).question_id) : base;
    if (typeof type !== "string" || !(QUESTION_TYPES as readonly string[]).includes(type)) {
      errors.push({ path: `${base}.question_type`, code: "UNSUPPORTED_QUESTION_TYPE", message: `question_type must be one of ${QUESTION_TYPES.join(", ")}` });
      invalid.add(label);
      return;
    }
    const schema = QUESTION_SCHEMAS[type as ExchangeQuestionType];
    const result = schema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ path: `${base}${issue.path.length ? "." + pathText(issue.path) : ""}`, ...classify(issue) });
      }
      invalid.add(label);
      return;
    }
    const question = result.data as ExchangeQuestion;
    byType[question.question_type] = (byType[question.question_type] ?? 0) + 1;
    const problems = semanticIssues(question, environment).map((issue) => ({ ...issue, path: `${base}.${issue.path}` }));
    if (seenIds.has(question.question_id)) problems.push({ path: `${base}.question_id`, code: "DUPLICATE_QUESTION_ID", message: `question_id ${question.question_id} is used more than once in this set` });
    seenIds.add(question.question_id);
    if (question.passage_ref !== undefined && !passageIds.has(question.passage_ref)) problems.push({ path: `${base}.passage_ref`, code: "PASSAGE_NOT_FOUND", message: `passage_ref ${question.passage_ref} does not match any passage in this set` });
    const stem = JSON.stringify(question.content_blocks) + JSON.stringify(question.question_type === "NUMERIC" ? question.response_config.label : "");
    const twin = seenStems.get(stem);
    if (twin !== undefined) problems.push({ path: `${base}.content_blocks`, code: "DUPLICATE_QUESTION_CONTENT", message: `The prompt is identical to ${twin}; remove one of them` });
    else seenStems.set(stem, question.question_id);
    if (knownAssets !== null) {
      for (const id of question.asset_refs) if (!knownAssets.has(id)) problems.push({ path: `${base}.asset_refs`, code: "ASSET_NOT_FOUND", message: `Image asset ${id} does not exist in the library. Do not invent asset ids: use an id you were given, or use an image_request block` });
    }
    if (blocksOf(question).some(({ block }) => block.type === "image_request")) needingAssets.push(question.question_id);
    if (problems.length > 0) invalid.add(question.question_id);
    errors.push(...problems);
    questions.push(question);
  });
  if (knownAssets === null) warnings.push({ path: "", code: "ASSETS_NOT_CHECKED", message: "No asset catalog was supplied, so image asset ids were checked for format only" });
  for (const id of needingAssets) warnings.push({ path: id, code: "NEEDS_NEW_IMAGE_ASSET", message: `${id} contains image_request blocks. It cannot be imported until the image is registered and the block is replaced by an image block` });
  for (const passage of parsedPassages) {
    const unknown = passage.asset_refs.filter((id) => knownAssets !== null && !knownAssets.has(id));
    for (const id of unknown) errors.push({ path: `passages.${passage.passage_id}.asset_refs`, code: "ASSET_NOT_FOUND", message: `Image asset ${id} does not exist in the library` });
  }

  const ok = errors.length === 0;
  const report: ValidationReport = { ok, errors, warnings, summary: { questions: (rawQuestions ?? []).length, byType, questionsNeedingAssets: needingAssets, invalidQuestions: [...invalid] } };
  if (ok) report.value = { format: QUESTION_SET_FORMAT, batch_id: String(document.batch_id), passages: parsedPassages, questions };
  return report;
}

/** JSON Schema (2020-12) of one question set, derived from the same Zod definitions. */
export function questionSetJsonSchema(): unknown {
  return z.toJSONSchema(QuestionSetSchema, { target: "draft-2020-12", io: "input", reused: "ref" });
}

// ---------------------------------------------------------------------------------------------------------------------
// Mapping onto the Bank's internal question shapes
// ---------------------------------------------------------------------------------------------------------------------

export interface InternalParts {
  schemaVersion: "question/1" | "question/2" | "question/3";
  section: "MATH" | "READING" | "SCIENCE";
  targetDifficulty: "EASY" | "MEDIUM" | "HARD";
  content: unknown[];
  interaction: unknown;
  answerKey: unknown;
  explanation: unknown[];
}

export type AssetPurpose = "QUESTION" | "EXPLANATION";
/** Resolve a library asset id to the asset version to embed. The purpose matters: explanation images are separate asset versions. */
export type ResolveAsset = (assetId: string, purpose: AssetPurpose) => string;

/** The internal contract version each exchange type is stored as (and which student route serves it). */
export const INTERNAL_SCHEMA_BY_TYPE = {
  SINGLE_CHOICE: "question/1",
  MULTIPLE_CHOICE: "question/1",
  TRUE_FALSE_GROUP: "question/1",
  NUMERIC: "question/2",
  CLOZE: "question/3",
  MATCHING: "question/3",
} as const satisfies Record<ExchangeQuestionType, InternalParts["schemaVersion"]>;

function internalBlock(block: ExchangeContentBlock, resolveAsset: ResolveAsset, purpose: AssetPurpose): unknown {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.content };
    case "math":
      return { type: "math", tex: block.content, display: block.display, accessibleText: block.accessible_text };
    case "table":
      return { type: "table", caption: block.caption, headers: block.headers, rows: block.rows };
    case "image":
      return { type: "image", assetVersionId: resolveAsset(block.asset_id, purpose), alt: block.alt, ...(block.caption ? { caption: block.caption } : {}) };
    case "image_request":
      throw new TypeError(`Image request ${block.request_id} has no registered asset yet`);
  }
}

/** Map a validated question onto the existing interaction/answer-key contracts. Image ids resolve through `resolveAsset`. */
export function toInternalParts(question: ExchangeQuestion, resolveAsset: ResolveAsset): InternalParts {
  const blocks = (list: readonly ExchangeContentBlock[], purpose: AssetPurpose = "QUESTION") => list.map((block) => internalBlock(block, resolveAsset, purpose));
  const base = { section: question.subject, targetDifficulty: question.difficulty, content: blocks(question.content_blocks), explanation: blocks(question.explanation, "EXPLANATION") };
  switch (question.question_type) {
    case "SINGLE_CHOICE":
      return { ...base, schemaVersion: "question/1", interaction: { type: "SINGLE_CHOICE", options: question.options.map((o) => ({ id: o.option_id, content: blocks(o.content_blocks) })) }, answerKey: { type: "SINGLE_CHOICE", optionId: question.answer.option_id } };
    case "MULTIPLE_CHOICE":
      return { ...base, schemaVersion: "question/1", interaction: { type: "MULTIPLE_CHOICE", options: question.options.map((o) => ({ id: o.option_id, content: blocks(o.content_blocks) })), minSelections: question.response_config.min_selections, maxSelections: question.response_config.max_selections }, answerKey: { type: "MULTIPLE_CHOICE", optionIds: question.answer.option_ids } };
    case "TRUE_FALSE_GROUP":
      return { ...base, schemaVersion: "question/1", interaction: { type: "TRUE_FALSE_GROUP", statements: question.response_config.statements.map((s) => ({ id: s.statement_id, content: blocks(s.content_blocks) })) }, answerKey: { type: "TRUE_FALSE_GROUP", values: question.answer.values } };
    case "NUMERIC":
      return { ...base, schemaVersion: "question/2", interaction: { type: "NUMERIC_RESPONSE", label: question.response_config.label, format: "DECIMAL" }, answerKey: { type: "NUMERIC_RESPONSE", value: question.answer.value } };
    case "CLOZE":
      return { ...base, schemaVersion: "question/3", interaction: { type: "CLOZE", fields: question.response_config.fields.map((f) => ({ id: f.field_id, label: f.label })), maxLength: question.response_config.max_length, normalization: { unicode: "NFC", trim: "OUTER", caseSensitive: true, diacritics: "PRESERVE" } }, answerKey: { type: "CLOZE", acceptedValues: question.answer.accepted_values } };
    case "MATCHING":
      return { ...base, schemaVersion: "question/3", interaction: { type: "MATCHING", rows: question.response_config.rows.map((r) => ({ id: r.row_id, label: r.label })), targets: question.response_config.targets.map((t) => ({ id: t.target_id, label: t.label, maxUses: t.max_uses })) }, answerKey: { type: "MATCHING", answers: question.answer.assignments } };
  }
}
