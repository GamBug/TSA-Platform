import { z } from "zod";

const DECIMAL_PATTERN = /^([+-]?)([0-9]{1,40})(?:([.,])([0-9]{1,20}))?$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const MARKUP_DELIMITERS = /[<>]/u;

/** Parses a bounded decimal string and returns its exact comparison form. */
export function normalizeDecimal(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;

  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, sign, integerDigits, , fractionDigits] = match;
  const integer = integerDigits!.replace(/^0+(?=[0-9])/u, "");
  const fraction = fractionDigits?.replace(/0+$/u, "") ?? "";
  const isZero = integer === "0" && fraction.length === 0;
  if (isZero) return "0";

  const normalizedSign = sign === "-" ? "-" : "";
  return fraction.length > 0
    ? `${normalizedSign}${integer}.${fraction}`
    : `${normalizedSign}${integer}`;
}

const NumericLabelSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((label) => label.trim().length > 0, "Label must not be blank")
  .refine(
    (label) => !CONTROL_CHARACTERS.test(label) && !MARKUP_DELIMITERS.test(label),
    "Label must be plain text without control characters or markup",
  );

export const NumericInteractionSchema = z
  .object({
    type: z.literal("NUMERIC_RESPONSE"),
    label: NumericLabelSchema,
    format: z.literal("DECIMAL"),
  })
  .strict();

export const NumericAnswerKeySchema = z
  .object({
    type: z.literal("NUMERIC_RESPONSE"),
    value: z.string().refine((value) => normalizeDecimal(value) === value, "Answer key must be a canonical decimal"),
  })
  .strict();

export const NumericResponseValueSchema = z
  .object({
    type: z.literal("NUMERIC_RESPONSE"),
    value: z.string().refine((value) => normalizeDecimal(value) !== null, "Response must be a bounded decimal").nullable(),
  })
  .strict();

/** Scores exact decimal equality. Missing and cleared answers earn zero. */
export function numericEarned(key: unknown, response: unknown): 0 | 1 {
  const keyData = NumericAnswerKeySchema.safeParse(readPlainDataObject(key, ["type", "value"]));
  if (!keyData.success) throw new TypeError("Invalid numeric answer key");

  if (response === null) return 0;

  const responseData = NumericResponseValueSchema.safeParse(readPlainDataObject(response, ["type", "value"]));
  if (!responseData.success) throw new TypeError("Invalid numeric response");

  const responseValue = responseData.data.value;
  if (responseValue === null) return 0;

  return normalizeDecimal(responseValue) === keyData.data.value ? 1 : 0;
}

/** Copies only own data properties so scoring never invokes input getters. */
function readPlainDataObject(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a plain data object");
  }

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Expected a plain data object");
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actualKeys = Reflect.ownKeys(descriptors);
    const expected = new Set(expectedKeys);
    if (actualKeys.length !== expectedKeys.length || actualKeys.some((key) => typeof key !== "string" || !expected.has(key))) {
      throw new TypeError("Expected a plain data object");
    }

    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        throw new TypeError("Expected a plain data object");
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    throw new TypeError("Expected a plain data object");
  }
}
