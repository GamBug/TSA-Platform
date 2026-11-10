import { z } from "zod";

const StableIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const MARKUP_DELIMITERS = /[<>]/u;
const MAX_CLOZE_FIELDS = 20;
const MAX_MATCHING_ROWS = 40;
const MAX_MATCHING_TARGETS = 40;
const MAX_ACCEPTED_VARIANTS = 16;

const LabelSchema = z.string().min(1)
  .refine((label) => hasWellFormedUnicode(label) && [...label].length <= 2_000,
    "Label must contain at most 2,000 Unicode scalar values")
  .refine((label) => label.trim().length > 0, "Label must not be blank")
  .refine((label) => !CONTROL_CHARACTERS.test(label) && !MARKUP_DELIMITERS.test(label),
    "Label must be plain text without control characters or markup");

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function scalarLength(value: string): number {
  return [...value].length;
}

function copyPlainJson(value: unknown, depth = 0, active = new Set<object>()): unknown {
  if (depth > 32) throw new TypeError("Contract input exceeds JSON depth limit");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new TypeError("Contract input must be plain JSON data");
  if (active.has(value)) throw new TypeError("Contract input must not be cyclic");
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 1_000) {
        throw new TypeError("Contract input must use bounded plain arrays");
      }
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)))) {
        throw new TypeError("Contract input array has unsupported properties");
      }
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
          throw new TypeError("Contract input arrays must contain data properties");
        }
        result.push(copyPlainJson(descriptor.value, depth + 1, active));
      }
      return result;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Contract input must use plain objects");
    const keys = Reflect.ownKeys(value);
    if (keys.length > 1_000 || keys.some((key) => typeof key !== "string")) {
      throw new TypeError("Contract input object has unsupported keys");
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
        throw new TypeError("Contract input objects must contain data properties");
      }
      result[key] = copyPlainJson(descriptor.value, depth + 1, active);
    }
    return result;
  } finally {
    active.delete(value);
  }
}

/** NFC plus outer trim; internal spaces, case, and Vietnamese accents are preserved. */
export function normalizeClozeText(value: string): string {
  return value.normalize("NFC").trim();
}

export const ClozeNormalizationSchema = z.object({
  unicode: z.literal("NFC"),
  trim: z.literal("OUTER"),
  caseSensitive: z.literal(true),
  diacritics: z.literal("PRESERVE"),
}).strict();

export const ClozeInteractionSchema = z.object({
  type: z.literal("CLOZE"),
  fields: z.array(z.object({ id: StableIdSchema, label: LabelSchema }).strict()).min(1).max(MAX_CLOZE_FIELDS),
  maxLength: z.number().int().min(1).max(256),
  normalization: ClozeNormalizationSchema,
}).strict().superRefine((interaction, context) => {
  const ids = interaction.fields.map((field) => field.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["fields"], message: "Cloze field IDs must be unique" });
  }
});

const MatchingTargetSchema = z.object({
  id: StableIdSchema,
  label: LabelSchema,
  maxUses: z.number().int().min(1).max(MAX_MATCHING_ROWS),
}).strict();

export const MatchingInteractionSchema = z.object({
  type: z.literal("MATCHING"),
  rows: z.array(z.object({ id: StableIdSchema, label: LabelSchema }).strict()).min(1).max(MAX_MATCHING_ROWS),
  targets: z.array(MatchingTargetSchema).min(1).max(MAX_MATCHING_TARGETS),
}).strict().superRefine((interaction, context) => {
  const rowIds = interaction.rows.map((row) => row.id);
  const targetIds = interaction.targets.map((target) => target.id);
  if (new Set(rowIds).size !== rowIds.length) {
    context.addIssue({ code: "custom", path: ["rows"], message: "Matching row IDs must be unique" });
  }
  if (new Set(targetIds).size !== targetIds.length) {
    context.addIssue({ code: "custom", path: ["targets"], message: "Matching target IDs must be unique" });
  }
  if (interaction.targets.reduce((sum, target) => sum + target.maxUses, 0) < interaction.rows.length) {
    context.addIssue({ code: "custom", path: ["targets"], message: "Target reuse limits must allow every row to be assigned" });
  }
});

const ClozeTextSchema = z.string().refine(hasWellFormedUnicode, "Text must be well-formed Unicode");

export const ClozeAnswerKeySchema = z.object({
  type: z.literal("CLOZE"),
  acceptedValues: z.record(StableIdSchema, z.array(ClozeTextSchema).min(1).max(MAX_ACCEPTED_VARIANTS)),
}).strict();

export const ClozeResponseValueSchema = z.object({
  type: z.literal("CLOZE"),
  values: z.record(StableIdSchema, ClozeTextSchema.nullable()).refine(
    (values) => Object.keys(values).length <= MAX_CLOZE_FIELDS,
    "Response contains too many cloze fields",
  ),
}).strict();

export const MatchingAnswerKeySchema = z.object({
  type: z.literal("MATCHING"),
  answers: z.record(StableIdSchema, StableIdSchema),
}).strict();

export const MatchingResponseValueSchema = z.object({
  type: z.literal("MATCHING"),
  assignments: z.record(StableIdSchema, StableIdSchema.nullable()).refine(
    (assignments) => Object.keys(assignments).length <= MAX_MATCHING_ROWS,
    "Response contains too many matching rows",
  ),
}).strict();

export type ClozeInteraction = z.infer<typeof ClozeInteractionSchema>;
export type ClozeAnswerKey = z.infer<typeof ClozeAnswerKeySchema>;
export type ClozeResponseValue = z.infer<typeof ClozeResponseValueSchema>;
export type MatchingInteraction = z.infer<typeof MatchingInteractionSchema>;
export type MatchingAnswerKey = z.infer<typeof MatchingAnswerKeySchema>;
export type MatchingResponseValue = z.infer<typeof MatchingResponseValueSchema>;

function requireParsed<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(copyPlainJson(value));
  if (!result.success) throw new TypeError(message);
  return result.data;
}

function validateClozeKey(interactionInput: unknown, keyInput: unknown): {
  interaction: ClozeInteraction;
  key: ClozeAnswerKey;
} {
  const interaction = requireParsed(ClozeInteractionSchema, interactionInput, "Invalid cloze interaction");
  const key = requireParsed(ClozeAnswerKeySchema, keyInput, "Invalid cloze answer key");
  const fieldIds = new Set(interaction.fields.map((field) => field.id));
  const keyIds = Object.keys(key.acceptedValues);
  if (keyIds.length !== fieldIds.size || keyIds.some((id) => !fieldIds.has(id))) {
    throw new TypeError("Cloze answer key must cover exactly the interaction fields");
  }
  for (const fieldId of fieldIds) {
    const variants = key.acceptedValues[fieldId]!;
    const normalized = new Set<string>();
    for (const variant of variants) {
      if (!hasWellFormedUnicode(variant) || scalarLength(variant) > interaction.maxLength) {
        throw new TypeError("Cloze answer variant exceeds the configured input limit");
      }
      const value = normalizeClozeText(variant);
      if (value.length === 0 || normalized.has(value)) throw new TypeError("Cloze answer variants must be nonblank and unique after normalization");
      normalized.add(value);
    }
  }
  return { interaction, key };
}

export function parseClozeResponse(interactionInput: unknown, responseInput: unknown): ClozeResponseValue {
  const interaction = requireParsed(ClozeInteractionSchema, interactionInput, "Invalid cloze interaction");
  const response = requireParsed(ClozeResponseValueSchema, responseInput, "Invalid cloze response");
  const fieldIds = new Set(interaction.fields.map((field) => field.id));
  for (const [fieldId, value] of Object.entries(response.values)) {
    if (!fieldIds.has(fieldId)) throw new TypeError("Cloze response contains an unknown field ID");
    if (value !== null && scalarLength(value) > interaction.maxLength) {
      throw new TypeError("Cloze response exceeds the configured input limit");
    }
  }
  return response;
}

function validateMatchingKey(interactionInput: unknown, keyInput: unknown): {
  interaction: MatchingInteraction;
  key: MatchingAnswerKey;
} {
  const interaction = requireParsed(MatchingInteractionSchema, interactionInput, "Invalid matching interaction");
  const key = requireParsed(MatchingAnswerKeySchema, keyInput, "Invalid matching answer key");
  const rowIds = new Set(interaction.rows.map((row) => row.id));
  const targetLimits = new Map(interaction.targets.map((target) => [target.id, target.maxUses]));
  const uses = new Map<string, number>();
  const keyIds = Object.keys(key.answers);
  if (keyIds.length !== rowIds.size || keyIds.some((id) => !rowIds.has(id))) {
    throw new TypeError("Matching answer key must cover exactly the interaction rows");
  }
  for (const [rowId, targetId] of Object.entries(key.answers)) {
    if (!rowIds.has(rowId) || !targetLimits.has(targetId)) throw new TypeError("Matching answer key contains an unknown row or target ID");
    const count = (uses.get(targetId) ?? 0) + 1;
    if (count > targetLimits.get(targetId)!) throw new TypeError("Matching answer key exceeds a target reuse limit");
    uses.set(targetId, count);
  }
  return { interaction, key };
}

export function parseMatchingResponse(interactionInput: unknown, responseInput: unknown): MatchingResponseValue {
  const interaction = requireParsed(MatchingInteractionSchema, interactionInput, "Invalid matching interaction");
  const response = requireParsed(MatchingResponseValueSchema, responseInput, "Invalid matching response");
  const rowIds = new Set(interaction.rows.map((row) => row.id));
  const targetLimits = new Map(interaction.targets.map((target) => [target.id, target.maxUses]));
  const uses = new Map<string, number>();
  for (const [rowId, targetId] of Object.entries(response.assignments)) {
    if (!rowIds.has(rowId)) throw new TypeError("Matching response contains an unknown row ID");
    if (targetId === null) continue;
    if (!targetLimits.has(targetId)) throw new TypeError("Matching response contains an unknown target ID");
    const count = (uses.get(targetId) ?? 0) + 1;
    if (count > targetLimits.get(targetId)!) throw new TypeError("Matching response exceeds a target reuse limit");
    uses.set(targetId, count);
  }
  return response;
}

export function validateClozeMatchingAnswerKey(interaction: unknown, key: unknown): void {
  const parsedInteraction = requireParsed(z.discriminatedUnion("type", [ClozeInteractionSchema, MatchingInteractionSchema]), interaction,
    "Invalid cloze or matching interaction");
  if (parsedInteraction.type === "CLOZE") validateClozeKey(parsedInteraction, key);
  else validateMatchingKey(parsedInteraction, key);
}

export function clozeMatchingEarned(interactionInput: unknown, keyInput: unknown, responseInput: unknown): 0 | 1 {
  const interaction = requireParsed(z.discriminatedUnion("type", [ClozeInteractionSchema, MatchingInteractionSchema]), interactionInput,
    "Invalid cloze or matching interaction");
  if (interaction.type === "CLOZE") {
    const { key } = validateClozeKey(interaction, keyInput);
    if (responseInput === null) return 0;
    const response = parseClozeResponse(interaction, responseInput);
    if (interaction.fields.some(({ id }) => {
      if (!Object.hasOwn(response.values, id)) return true;
      const value = response.values[id];
      return value === undefined || value === null || normalizeClozeText(value).length === 0;
    })) return 0;
    return interaction.fields.every(({ id }) => {
      if (!Object.hasOwn(response.values, id)) return false;
      const value = normalizeClozeText(response.values[id]!);
      return key.acceptedValues[id]!.some((variant) => normalizeClozeText(variant) === value);
    }) ? 1 : 0;
  }

  const { key } = validateMatchingKey(interaction, keyInput);
  if (responseInput === null) return 0;
  const response = parseMatchingResponse(interaction, responseInput);
  if (interaction.rows.some(({ id }) => !Object.hasOwn(response.assignments, id) || response.assignments[id] === null)) return 0;
  return interaction.rows.every(({ id }) => response.assignments[id] === key.answers[id]) ? 1 : 0;
}
