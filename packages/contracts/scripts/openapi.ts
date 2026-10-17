import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Load schemas only after the ESM Zod instance is extended. This keeps the
// runtime schemas independent from the generator while avoiding mixed-module
// prototype extension behavior in Node.
const contracts = await import("../src/index.ts");

/**
 * Generates only the currently implemented, student-safe runtime DTO subset.
 * Canonical authoring/grading schemas are deliberately not registered here.
 */
export function generateStudentContractsOpenApi(): Record<string, unknown> {
  const registry = new OpenAPIRegistry();
  registry.register("StudentQuestion", contracts.StudentQuestionSchema);
  registry.register("StudentSlot", contracts.StudentSlotSchema);
  registry.register("CreationReceipt", contracts.CreationReceiptSchema);
  registry.register("AttemptView", contracts.AttemptViewSchema);
  registry.register("ResponseValue", contracts.ResponseValueSchema);
  registry.register("ErrorResponse", contracts.ErrorResponseSchema);
  registry.register("StudentShortage", contracts.StudentShortageSchema);
  registry.register("ValidationErrorResponse", contracts.ValidationErrorResponseSchema);
  registry.register("AuthenticationErrorResponse", contracts.AuthenticationErrorResponseSchema);
  registry.register("AuthorizationErrorResponse", contracts.AuthorizationErrorResponseSchema);
  registry.register("ConcurrentAttemptExistsResponse", contracts.ConcurrentAttemptExistsResponseSchema);
  registry.register("SearchExhaustedErrorResponse", contracts.SearchExhaustedErrorResponseSchema);
  registry.register("DocumentedErrorResponse", contracts.DocumentedErrorResponseSchema);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "TSA Platform student-safe runtime contracts",
      version: "question/1",
      description: "Components-only artifact for the implemented runtime contract subset; no HTTP operations are defined here.",
    },
  }) as unknown as Record<string, unknown>;
}

/** Stable JSON serialization prevents key insertion-order changes from causing drift. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}
