import { createHash } from "node:crypto";
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { RouteDefinitionValue } from "../src/routes.ts";

extendZodWithOpenApi(z);

const [contracts, routes] = await Promise.all([
  import("../src/staff.ts"),
  import("../src/staff-routes.ts"),
]);

type RouteTable = Readonly<Record<string, RouteDefinitionValue>>;

function buildStaffDocument(table: RouteTable): Record<string, unknown> {
  const registry = new OpenAPIRegistry();
  const components: Readonly<Record<string, z.ZodType>> = {
    StaffReviewContext: contracts.StaffReviewContextSchema,
    StaffReviewEvidence: contracts.StaffReviewEvidenceSchema,
    StaffReviewContextPathParams: routes.StaffReviewContextPathParamsSchema,
    StaffReviewEvidencePathParams: routes.StaffReviewEvidencePathParamsSchema,
    StaffUnauthenticatedResponse: routes.StaffUnauthenticatedResponseSchema,
    StaffForbiddenResponse: routes.StaffForbiddenResponseSchema,
    StaffNotFoundResponse: routes.StaffNotFoundResponseSchema,
    StaffValidationErrorResponse: routes.StaffValidationErrorResponseSchema,
    StaffTemporarilyUnavailableResponse: routes.StaffTemporarilyUnavailableResponseSchema,
  };
  const refs = new Map<z.ZodType, z.ZodType>();
  for (const [name, schema] of Object.entries(components)) refs.set(schema, registry.register(name, schema));

  for (const [operationId, route] of Object.entries(table)) {
    const request: NonNullable<RouteConfig["request"]> = {};
    if (route.params !== undefined) {
      request.params = refs.get(route.params) as RouteConfig["request"] extends { params?: infer P } ? P : never;
    }

    const responses: RouteConfig["responses"] = {};
    for (const [status, response] of Object.entries(route.responses)) {
      if (!("schema" in response)) throw new TypeError("Staff operation responses must be JSON schemas");
      responses[status] = {
        description: response.description,
        content: { [response.contentType]: { schema: refs.get(response.schema) ?? response.schema } },
        ...(response.headers === undefined ? {} : { headers: response.headers }),
      };
    }

    registry.registerPath({
      operationId,
      method: route.method.toLowerCase() as RouteConfig["method"],
      path: route.path,
      summary: route.summary,
      request,
      responses,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "TSA Platform private staff API contracts",
      version: "staff-review-context/1",
      description: "One private inspection operation for the local synthetic staff runtime. Never include this contract in student bundles; authentication and access checks remain runtime-enforced.",
    },
  }) as unknown as Record<string, unknown>;
}

export function generateStaffContractsOpenApi(): Record<string, unknown> {
  return buildStaffDocument(routes.staffRouteRegistry);
}

export function generateStaffOperationTypes(): string {
  const table = routes.staffRouteRegistry;
  const entries = Object.entries(table)
    .map(([name, route]) => `  ${JSON.stringify(name)}: { method: ${JSON.stringify(route.method)}, path: ${JSON.stringify(route.path)} },`)
    .join("\n");
  const mappedEntries = Object.keys(table)
    .map((name) => `  readonly ${JSON.stringify(name)}: StaffOperationMap[${JSON.stringify(name)}];`)
    .join("\n");
  const digest = createHash("sha256").update(staffStableJson(generateStaffContractsOpenApi()), "utf8").digest("hex");

  return [
    `// Generated from the private staff runtime route registry; OpenAPI SHA-256: ${digest}; do not edit.`,
    `import type { StaffOperationMap } from "../staff-routes.ts";`,
    "",
    "export type StaffOperations = {",
    mappedEntries,
    "};",
    "export const StaffOperationPaths = {",
    entries,
    "} as const;",
    "",
  ].join("\n");
}

/** Stable JSON serialization matches the existing generated contract artifact format. */
export function staffStableJson(value: unknown): string {
  return `${JSON.stringify(sortStaffJson(value), null, 2)}\n`;
}

function sortStaffJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStaffJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, sortStaffJson(child)]),
    );
  }
  return value;
}
