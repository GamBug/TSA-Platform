import { createHash } from "node:crypto";
import { types } from "node:util";
import { canonicalize } from "./identity.ts";

export const MANUAL_MAX_ARTIFACT_BYTES = 128 * 1024;
export const MANUAL_MAX_PACKAGE_BYTES = 1024 * 1024;
export const MANUAL_MAX_GRAPH_NODES = 100;
export const MANUAL_MAX_GRAPH_DEPTH = 32;
export const MANUAL_MAX_SUMMARY_BYTES = 16 * 1024;

export function manualFail(message: string): never {
  throw new TypeError(message);
}

function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function isProxy(value: object): boolean {
  return types.isProxy(value);
}

/** Validate JSON-shaped values before any schema or canonicalizer can inspect them. */
export function assertManualJson(value: unknown, maxDepth = 64, maxValues = 100_000): void {
  const active = new WeakSet<object>();
  const complete = new WeakSet<object>();
  const pending: Array<{ value: unknown; depth: number; exit: boolean }> = [{ value, depth: 0, exit: false }];
  let count = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    const item = current.value;
    if (current.exit) {
      active.delete(item as object);
      complete.add(item as object);
      continue;
    }
    count += 1;
    if (count > maxValues || current.depth > maxDepth) manualFail("JSON value exceeds manual transport limits");
    if (item === null || typeof item === "boolean") continue;
    if (typeof item === "string") {
      if (!wellFormed(item)) manualFail("JSON string contains invalid UTF-16");
      continue;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) manualFail("JSON numbers must be finite");
      continue;
    }
    if (typeof item !== "object" || isProxy(item)) manualFail("Only plain JSON values are supported");
    if (active.has(item)) manualFail("Cyclic JSON values are not supported");
    if (complete.has(item)) continue;
    active.add(item);
    pending.push({ value: item, depth: current.depth, exit: true });

    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || item.length > maxValues
          || Object.getOwnPropertyNames(item).length !== item.length + 1
          || Object.getOwnPropertySymbols(item).length !== 0) {
        manualFail("Only dense plain arrays are supported");
      }
      for (let index = item.length - 1; index >= 0; index -= 1) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
          manualFail("Array accessors and holes are not supported");
        }
        pending.push({ value: descriptor.value, depth: current.depth + 1, exit: false });
      }
      continue;
    }

    if (Object.getPrototypeOf(item) !== Object.prototype || Object.getOwnPropertySymbols(item).length !== 0) {
      manualFail("Only plain JSON objects are supported");
    }
    const keys = Object.getOwnPropertyNames(item);
    if (keys.length > maxValues) manualFail("JSON object is too large");
    for (const key of keys) {
      if (!wellFormed(key)) manualFail("JSON key contains invalid UTF-16");
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
        manualFail("Object accessors and non-enumerable properties are not supported");
      }
      pending.push({ value: descriptor.value, depth: current.depth + 1, exit: false });
    }
  }
}

function decodeJsonString(text: string, state: { index: number }): string {
  if (text[state.index++] !== '"') manualFail("Invalid JSON string");
  let result = "";
  while (state.index < text.length) {
    const character = text[state.index++]!;
    if (character === '"') return result;
    if (character.charCodeAt(0) < 0x20) manualFail("Invalid JSON string control character");
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = text[state.index++];
    switch (escaped) {
      case '"': result += '"'; break;
      case "\\": result += "\\"; break;
      case "/": result += "/"; break;
      case "b": result += "\b"; break;
      case "f": result += "\f"; break;
      case "n": result += "\n"; break;
      case "r": result += "\r"; break;
      case "t": result += "\t"; break;
      case "u": {
        const digits = text.slice(state.index, state.index + 4);
        if (!/^[0-9a-f]{4}$/iu.test(digits)) manualFail("Invalid JSON unicode escape");
        result += String.fromCharCode(Number.parseInt(digits, 16));
        state.index += 4;
        break;
      }
      default: manualFail("Invalid JSON escape");
    }
  }
  manualFail("Unterminated JSON string");
}

/** Scan the grammar before JSON.parse so duplicate escaped keys and deep input fail closed. */
function scanJson(text: string, maxDepth: number): void {
  const state = { index: 0 };
  let values = 0;
  const whitespace = (): void => {
    while (state.index < text.length && /[\u0020\u0009\u000a\u000d]/u.test(text[state.index]!)) state.index += 1;
  };
  const value = (depth: number): void => {
    whitespace();
    values += 1;
    if (values > 100_000 || depth > maxDepth) manualFail("JSON value exceeds manual transport limits");
    const current = text[state.index];
    if (current === '"') {
      decodeJsonString(text, state);
      return;
    }
    if (current === "{") {
      state.index += 1;
      whitespace();
      const keys = new Set<string>();
      if (text[state.index] === "}") { state.index += 1; return; }
      while (true) {
        whitespace();
        const key = decodeJsonString(text, state);
        if (keys.has(key)) manualFail("Duplicate JSON object key");
        keys.add(key);
        whitespace();
        if (text[state.index++] !== ":") manualFail("Invalid JSON object");
        value(depth + 1);
        whitespace();
        if (text[state.index] === "}") { state.index += 1; return; }
        if (text[state.index++] !== ",") manualFail("Invalid JSON object");
      }
    }
    if (current === "[") {
      state.index += 1;
      whitespace();
      if (text[state.index] === "]") { state.index += 1; return; }
      while (true) {
        value(depth + 1);
        whitespace();
        if (text[state.index] === "]") { state.index += 1; return; }
        if (text[state.index++] !== ",") manualFail("Invalid JSON array");
      }
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(text.slice(state.index));
    if (!literal) manualFail("Invalid JSON value");
    state.index += literal[0].length;
  };

  value(0);
  whitespace();
  if (state.index !== text.length) manualFail("Trailing JSON data is not allowed");
}

export function copyManualBytes(value: unknown, limit = MANUAL_MAX_ARTIFACT_BYTES): Uint8Array {
  if (value !== null && typeof value === "object" && isProxy(value)) manualFail("Proxy byte views are not supported");
  if (!(value instanceof Uint8Array) || value.byteLength > limit) manualFail("Manual artifact exceeds its byte limit");
  return Uint8Array.from(value);
}

export function parseManualJsonBytes(bytes: Uint8Array, label: string, maxBytes = MANUAL_MAX_ARTIFACT_BYTES): unknown {
  const copy = copyManualBytes(bytes, maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(copy);
  } catch {
    manualFail(label + " is not valid UTF-8");
  }
  if (text.charCodeAt(0) === 0xfeff) manualFail(label + " must not contain a UTF-8 BOM");
  scanJson(text, 64);
  try {
    const parsed: unknown = JSON.parse(text);
    assertManualJson(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("manual")) throw error;
    manualFail(label + " is not valid JSON");
  }
}

export function parseManualJsonInput(input: unknown, label: string, maxBytes = MANUAL_MAX_PACKAGE_BYTES): unknown {
  if (typeof input === "string") {
    if (!wellFormed(input)) manualFail(label + " contains invalid UTF-16");
    const bytes = new TextEncoder().encode(input);
    return parseManualJsonBytes(bytes, label, maxBytes);
  }
  if (input !== null && typeof input === "object" && isProxy(input)) manualFail("Proxy JSON input is forbidden");
  if (input instanceof Uint8Array) return parseManualJsonBytes(input, label, maxBytes);
  assertManualJson(input);
  const bytes = canonicalize(input);
  if (bytes.byteLength > maxBytes) manualFail(label + " exceeds its byte limit");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export function manualHash(bytes: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

export function digestManualValue(value: unknown): string {
  assertManualJson(value);
  return manualHash(canonicalize(value));
}

export function sameManualValue(left: unknown, right: unknown): boolean {
  assertManualJson(left);
  assertManualJson(right);
  return Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
}
