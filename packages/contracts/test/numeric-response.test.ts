import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeDecimal,
  NumericAnswerKeySchema,
  NumericInteractionSchema,
  NumericResponseValueSchema,
  numericEarned,
} from "../src/numeric-response.ts";

const key = (value: string) => ({ type: "NUMERIC_RESPONSE", value });
const response = (value: string | null) => ({ type: "NUMERIC_RESPONSE", value });

describe("bounded numeric response primitives", () => {
  it("normalizes decimal punctuation, signs, zeros, and outer whitespace exactly", () => {
    assert.equal(normalizeDecimal("  +00012,3400  "), "12.34");
    assert.equal(normalizeDecimal("-000.000"), "0");
    assert.equal(normalizeDecimal("+000"), "0");
    assert.equal(normalizeDecimal("-00012.300"), "-12.3");
    assert.equal(normalizeDecimal("000.00100"), "0.001");
    assert.equal(normalizeDecimal("1,000"), "1");
  });

  it("accepts the exact raw length and digit limits, then rejects one step beyond them", () => {
    const largest = `${"1".repeat(40)}.${"2".repeat(20)}`;
    assert.equal(largest.length, 61);
    assert.equal(normalizeDecimal(` ${largest}  `)?.length, 61); // 64 raw characters
    assert.equal(normalizeDecimal(`  ${largest}  `), null); // 65 raw characters
    assert.equal(normalizeDecimal("1".repeat(40)), "1".repeat(40));
    assert.equal(normalizeDecimal("1".repeat(41)), null);
    assert.equal(normalizeDecimal(`1.${"2".repeat(20)}`), `1.${"2".repeat(20)}`);
    assert.equal(normalizeDecimal(`1.${"2".repeat(21)}`), null);
  });

  it("rejects partial, non-decimal, oversized, and non-ASCII input without coercion", () => {
    for (const value of [
      "",
      ".5",
      "5.",
      "+",
      "1 2",
      "1,2.3",
      "1,000,000",
      "1/2",
      "1e3",
      "NaN",
      "Infinity",
      "0x10",
      "<b>1</b>",
      "1+2",
      "١٢",
      "1\n2",
      "1".repeat(65),
    ]) {
      assert.equal(normalizeDecimal(value), null, JSON.stringify(value));
    }

    let getterCalls = 0;
    const objectWithGetter = Object.defineProperty({}, "toString", {
      get() {
        getterCalls += 1;
        throw new Error("must not run");
      },
    });
    assert.equal(normalizeDecimal(objectWithGetter), null);
    assert.equal(getterCalls, 0);
  });

  it("validates strict interaction, canonical answer key, and raw response shapes", () => {
    assert.equal(NumericInteractionSchema.safeParse({ type: "NUMERIC_RESPONSE", label: "Answer", format: "DECIMAL" }).success, true);
    for (const label of ["", "  ", "<b>Answer</b>", "Answer\nvalue", "x".repeat(201)]) {
      assert.equal(NumericInteractionSchema.safeParse({ type: "NUMERIC_RESPONSE", label, format: "DECIMAL" }).success, false);
    }
    assert.equal(NumericInteractionSchema.safeParse({ type: "NUMERIC_RESPONSE", label: "Answer", format: "INTEGER" }).success, false);
    assert.equal(NumericInteractionSchema.safeParse({ type: "NUMERIC_RESPONSE", label: "Answer", format: "DECIMAL", extra: true }).success, false);

    assert.equal(NumericAnswerKeySchema.safeParse(key("-12.34")).success, true);
    for (const value of ["+1", "01", "1.0", "1,2", "-0", " 1", "1e2", "1.".repeat(1)]) {
      assert.equal(NumericAnswerKeySchema.safeParse(key(value)).success, false, value);
    }
    assert.equal(NumericAnswerKeySchema.safeParse({ ...key("1"), extra: true }).success, false);

    const rawValue = "  +00012,3400 ";
    const parsedResponse = NumericResponseValueSchema.parse(response(rawValue));
    assert.equal(parsedResponse.value, rawValue);
    assert.equal(NumericResponseValueSchema.safeParse(response(null)).success, true);
    for (const value of ["1e2", " 1 2", "1".repeat(65)]) {
      assert.equal(NumericResponseValueSchema.safeParse(response(value)).success, false, value);
    }
    assert.equal(NumericResponseValueSchema.safeParse({ ...response("1"), extra: true }).success, false);
  });

  it("scores exact arbitrary-precision decimal equality and treats null answers as zero", () => {
    const precise = "9007199254740993.00000000000000000001";
    assert.equal(numericEarned(key(precise), response(`+${precise}`)), 1);
    assert.equal(numericEarned(key(precise), response("9007199254740993.00000000000000000002")), 0);
    assert.equal(numericEarned(key("12.34"), response("+00012,3400")), 1);
    assert.equal(numericEarned(key("0"), response("-000.000")), 1);
    assert.equal(numericEarned(key("1"), null), 0);
    assert.equal(numericEarned(key("1"), response(null)), 0);
  });

  it("throws TypeError for malformed keys or responses, including accessors, without invoking getters", () => {
    assert.throws(() => numericEarned(key("01"), null), TypeError);
    assert.throws(() => numericEarned(key("1"), { type: "NUMERIC_RESPONSE", value: "1e2" }), TypeError);
    assert.throws(() => numericEarned(key("1"), { type: "NUMERIC_RESPONSE", value: "1", extra: true }), TypeError);

    let getterCalls = 0;
    const accessorKey = Object.defineProperty({ type: "NUMERIC_RESPONSE" }, "value", {
      get() {
        getterCalls += 1;
        throw new Error("must not run");
      },
    });
    const accessorResponse = Object.defineProperty({ type: "NUMERIC_RESPONSE" }, "value", {
      get() {
        getterCalls += 1;
        throw new Error("must not run");
      },
    });
    assert.throws(() => numericEarned(accessorKey, response("1")), TypeError);
    assert.throws(() => numericEarned(key("1"), accessorResponse), TypeError);
    assert.equal(getterCalls, 0);
  });
});
