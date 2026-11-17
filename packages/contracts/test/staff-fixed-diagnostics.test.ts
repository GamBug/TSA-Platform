import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateStaffContractsOpenApi } from "../scripts/staff-openapi.ts";
import { generateStudentContractsOpenApi } from "../scripts/openapi.ts";
import {
  StaffFixedAssemblyDiagnosticSchema,
  StaffFixedAssemblyRunListSchema,
  type StaffFixedAssemblyDiagnostic,
  type StaffFixedAssemblyRunList,
} from "../src/staff.ts";
import { StaffOperationPaths } from "../src/generated/staff-operations.ts";
import { StaffFixedAssemblyDiagnosticPathParamsSchema, staffRouteRegistry } from "../src/staff-routes.ts";

const RUN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BLUEPRINT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OBSERVED_AT = "2026-10-25T12:34:56.123456Z";

function makeRunList(): StaffFixedAssemblyRunList {
  return {
    schemaVersion: "staff-fixed-assembly-runs/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "BANK_MANAGER",
    observedAt: OBSERVED_AT,
    scope: "CAPTURED_FIXED_REFERENCE_RUNS_ONLY",
    limit: 20,
    truncated: false,
    runs: [
      { assemblyRunId: RUN_C, blueprintVersionId: BLUEPRINT, outcome: "SUCCESS", createdAt: "2026-10-25T12:34:56.123457Z" },
      { assemblyRunId: RUN_B, blueprintVersionId: BLUEPRINT, outcome: "FAILURE", createdAt: "2026-10-25T12:34:56.123456Z" },
      { assemblyRunId: RUN_A, blueprintVersionId: BLUEPRINT, outcome: "SUCCESS", createdAt: "2026-10-25T12:34:56.123456Z" },
    ],
  };
}

function makeDiagnostic(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "staff-fixed-assembly-diagnostic/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "BANK_MANAGER",
    observedAt: OBSERVED_AT,
    scope: "CAPTURED_FIXED_REFERENCE_RUN_ONLY",
    run: {
      assemblyRunId: RUN_C,
      blueprintVersionId: BLUEPRINT,
      outcome: "SUCCESS",
      createdAt: "2026-10-25T12:34:56.123457Z",
    },
    algorithmVersion: "assembly/1",
    replayVerified: true,
    createsForm: false,
    qualification: "NOT_ATTESTED_BY_PLATFORM",
    publicationEligibility: "NOT_EVALUATED",
    outcome: "SUCCESS",
    failureCode: null,
    visitedNodes: 3,
    nodeLimit: 50_000,
    capturedUnitCount: 4,
    unitLimit: 2_000,
    capturedCandidateCount: 50,
    selectedCount: 5,
    sections: [
      { section: "MATH", requiredCount: 3, selectedCount: 3 },
      { section: "READING", requiredCount: 2, selectedCount: 2 },
    ],
    ...overrides,
  };
}

describe("private fixed-reference staff DTOs and operations", () => {
  it("accepts bounded, newest-first unique run metadata and rejects malformed list projections", () => {
    const parsed: StaffFixedAssemblyRunList = StaffFixedAssemblyRunListSchema.parse(makeRunList());
    assert.equal(parsed.scope, "CAPTURED_FIXED_REFERENCE_RUNS_ONLY");
    assert.deepEqual(parsed.runs.map(({ assemblyRunId }) => assemblyRunId), [RUN_C, RUN_B, RUN_A]);
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse({ ...makeRunList(), truncated: true }).success, false);
    const fullList = {
      ...makeRunList(),
      truncated: true,
      runs: Array.from({ length: 20 }, (_, index) => ({
        assemblyRunId: `00000000-0000-4000-8000-${String(20 - index).padStart(12, "0")}`,
        blueprintVersionId: BLUEPRINT,
        outcome: "SUCCESS" as const,
        createdAt: OBSERVED_AT,
      })),
    };
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse(fullList).success, true);
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse({ ...makeRunList(), runs: [makeRunList().runs[1], makeRunList().runs[1]] }).success, false);
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse({
      ...makeRunList(),
      runs: [...makeRunList().runs].reverse(),
    }).success, false);
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse({ ...makeRunList(), runs: [{ ...makeRunList().runs[0], candidateId: RUN_A }] }).success, false);
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse({ ...makeRunList(), observedAt: "2026-10-25T12:34:56Z" }).success, false);
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse({ ...makeRunList(), runs: Array.from({ length: 21 }, (_, index) => ({
      assemblyRunId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      blueprintVersionId: BLUEPRINT,
      outcome: "SUCCESS",
      createdAt: OBSERVED_AT,
    })) }).success, false);
  });

  it("accepts replay-verified aggregate outcomes and enforces count and outcome consistency", () => {
    const parsed: StaffFixedAssemblyDiagnostic = StaffFixedAssemblyDiagnosticSchema.parse(makeDiagnostic());
    assert.equal(parsed.replayVerified, true);
    assert.equal(parsed.createsForm, false);
    assert.equal(parsed.selectedCount, 5);

    const failed = makeDiagnostic({
      run: { ...makeDiagnostic().run, outcome: "FAILURE" },
      outcome: "FAILURE",
      failureCode: "SEARCH_EXHAUSTED",
      visitedNodes: 0,
      nodeLimit: 0,
      selectedCount: 0,
      sections: [{ section: "MATH", requiredCount: 1, selectedCount: 0 }],
    });
    assert.equal(StaffFixedAssemblyDiagnosticSchema.safeParse(failed).success, true);
    for (const invalid of [
      makeDiagnostic({ selectedCount: 4 }),
      makeDiagnostic({ sections: [
        { section: "MATH", requiredCount: 3, selectedCount: 4 },
        { section: "READING", requiredCount: 2, selectedCount: 1 },
      ] }),
      makeDiagnostic({ failureCode: "SEARCH_EXHAUSTED" }),
      makeDiagnostic({ failureCode: "UNKNOWN_FAILURE" }),
      makeDiagnostic({ run: { ...makeDiagnostic().run, outcome: "FAILURE" } }),
      makeDiagnostic({ outcome: "UNKNOWN_OUTCOME" }),
      makeDiagnostic({ visitedNodes: 50_001 }),
      makeDiagnostic({ nodeLimit: 50_001 }),
      makeDiagnostic({ capturedUnitCount: 10_001 }),
      makeDiagnostic({ unitLimit: 2_001 }),
      makeDiagnostic({ capturedCandidateCount: 2_000_001 }),
      makeDiagnostic({ selectedCount: 201 }),
      makeDiagnostic({ sections: [{ section: "MATH", requiredCount: 200, selectedCount: 200 }, { section: "READING", requiredCount: 1, selectedCount: 1 }] }),
      makeDiagnostic({ sections: [{ section: "READING", requiredCount: 1, selectedCount: 1 }, { section: "MATH", requiredCount: 1, selectedCount: 1 }] }),
      makeDiagnostic({ sections: [{ section: "MATH", requiredCount: 1, selectedCount: 1 }, { section: "MATH", requiredCount: 1, selectedCount: 1 }] }),
      makeDiagnostic({ sections: [{ section: "SCIENCE", requiredCount: 1, selectedCount: 0 }, { section: "READING", requiredCount: 1, selectedCount: 0 }] }),
      makeDiagnostic({ sections: [] }),
      makeDiagnostic({ candidateIds: [RUN_A] }),
      makeDiagnostic({ sourceIds: [RUN_A] }),
      makeDiagnostic({ seed: 7 }),
      makeDiagnostic({ manifestHash: `sha256:${"a".repeat(64)}` }),
      makeDiagnostic({ rawManifestHash: `sha256:${"a".repeat(64)}` }),
      makeDiagnostic({ publicationEligibility: "ELIGIBLE" }),
    ]) {
      assert.equal(StaffFixedAssemblyDiagnosticSchema.safeParse(invalid).success, false);
    }
  });

  it("defines exact headerless, bodyless GETs in the private staff artifact only", () => {
    assert.deepEqual(StaffFixedAssemblyDiagnosticPathParamsSchema.parse({ assemblyRunId: RUN_C }), { assemblyRunId: RUN_C });
    assert.equal(StaffFixedAssemblyDiagnosticPathParamsSchema.safeParse({ assemblyRunId: "not-a-uuid" }).success, false);
    assert.deepEqual(StaffOperationPaths.staffFixedAssemblyRuns, { method: "GET", path: "/api/v1/assembly-runs" });
    assert.deepEqual(StaffOperationPaths.staffFixedAssemblyDiagnostic, {
      method: "GET",
      path: "/api/v1/assembly-runs/{assemblyRunId}/diagnostics",
    });
    for (const operation of [staffRouteRegistry.staffFixedAssemblyRuns, staffRouteRegistry.staffFixedAssemblyDiagnostic]) {
      assert.equal(operation.method, "GET");
      assert.equal("body" in operation, false);
      assert.equal("headers" in operation, false);
      assert.equal("query" in operation, false);
      assert.deepEqual(Object.keys(operation.responses), ["200", "401", "403", "404", "422", "503"]);
    }

    const staff = generateStaffContractsOpenApi() as {
      paths: Record<string, Record<string, { operationId?: string; requestBody?: unknown; parameters?: Array<{ in?: string; name?: string }>; responses?: Record<string, unknown> }>>;
      components: { schemas: Record<string, unknown> };
    };
    const list = staff.paths["/api/v1/assembly-runs"]!.get!;
    const detail = staff.paths["/api/v1/assembly-runs/{assemblyRunId}/diagnostics"]!.get!;
    assert.equal(list.operationId, "staffFixedAssemblyRuns");
    assert.equal(detail.operationId, "staffFixedAssemblyDiagnostic");
    assert.equal(list.requestBody, undefined);
    assert.equal(detail.requestBody, undefined);
    assert.deepEqual(list.parameters?.map(({ in: location }) => location) ?? [], []);
    assert.deepEqual(detail.parameters?.map(({ name, in: location }) => ({ name, in: location })), [
      { name: "assemblyRunId", in: "path" },
    ]);
    assert.deepEqual(Object.keys(list.responses ?? {}), ["200", "401", "403", "404", "422", "503"]);
    assert.deepEqual(Object.keys(detail.responses ?? {}), ["200", "401", "403", "404", "422", "503"]);
    assert.ok(staff.components.schemas.StaffFixedAssemblyRunList);
    assert.ok(staff.components.schemas.StaffFixedAssemblyDiagnostic);

    const student = generateStudentContractsOpenApi() as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
    assert.equal(student.paths["/api/v1/assembly-runs"], undefined);
    assert.equal(student.paths["/api/v1/assembly-runs/{assemblyRunId}/diagnostics"], undefined);
    assert.equal(student.components.schemas.StaffFixedAssemblyRunList, undefined);
    assert.equal(student.components.schemas.StaffFixedAssemblyDiagnostic, undefined);
  });
});
