import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateStaffContractsOpenApi } from "../scripts/staff-openapi.ts";
import { generateStudentContractsOpenApi } from "../scripts/openapi.ts";
import {
  StaffFixedRehearsalBlueprintListSchema,
  StaffFixedRehearsalDiagnosticSchema,
  StaffFixedRehearsalListSchema,
  StaffFixedRehearsalReceiptSchema,
  StaffFixedRehearsalRequestSchema,
  type StaffFixedRehearsalBlueprintList,
  type StaffFixedRehearsalDiagnostic,
  type StaffFixedRehearsalList,
  type StaffFixedRehearsalReceipt,
  type StaffFixedRehearsalRequest,
} from "../src/staff.ts";
import { StaffOperationPaths } from "../src/generated/staff-operations.ts";
import {
  StaffFixedRehearsalDiagnosticPathParamsSchema,
  staffRouteRegistry,
} from "../src/staff-routes.ts";

const BLUEPRINT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BLUEPRINT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REHEARSAL_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REHEARSAL_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const OBSERVED_AT = "2026-10-25T14:00:00.123456Z";

function blueprintItem(overrides: Record<string, unknown> = {}) {
  return {
    blueprintVersionId: BLUEPRINT_A,
    contentHash: HASH_A,
    name: "Synthetic one-domain blueprint",
    section: "MATH",
    questionCount: 4,
    durationSeconds: 3_600,
    ...overrides,
  };
}

function makeBlueprintList(): StaffFixedRehearsalBlueprintList {
  return StaffFixedRehearsalBlueprintListSchema.parse({
    schemaVersion: "staff-fixed-rehearsal-blueprints/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "EXAM_MANAGER",
    observedAt: OBSERVED_AT,
    limit: 20,
    truncated: false,
    items: [
      blueprintItem(),
      blueprintItem({ blueprintVersionId: BLUEPRINT_B, section: "READING", questionCount: 2, durationSeconds: 1_800 }),
    ],
  });
}

function makeRequest(overrides: Record<string, unknown> = {}): StaffFixedRehearsalRequest {
  return {
    blueprintVersionId: BLUEPRINT_A,
    blueprintHash: HASH_A,
    windowMinutes: 60,
    seed: 42,
    ...overrides,
  };
}

function makeReceipt(overrides: Record<string, unknown> = {}): StaffFixedRehearsalReceipt {
  return {
    rehearsalId: REHEARSAL_A,
    blueprintVersionId: BLUEPRINT_A,
    blueprintHash: HASH_A,
    windowMinutes: 60,
    capturedAt: "2026-10-25T12:00:00.123456Z",
    availableUntil: "2026-10-25T13:00:00.123456Z",
    requiredThrough: "2026-10-25T13:10:01.123456Z",
    outcome: "SUCCESS",
    failureCode: null,
    sectionDeficits: [],
    createsForm: false,
    currentEligibility: "NOT_REVALIDATED",
    ...overrides,
  };
}

function makeRehearsalList(): StaffFixedRehearsalList {
  return {
    schemaVersion: "staff-fixed-rehearsals/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "BANK_MANAGER",
    observedAt: OBSERVED_AT,
    limit: 20,
    truncated: false,
    items: [
      {
        rehearsalId: REHEARSAL_B,
        blueprintVersionId: BLUEPRINT_B,
        outcome: "FAILURE",
        capturedAt: "2026-10-25T13:00:00.123456Z",
        windowMinutes: 60,
      },
      {
        rehearsalId: REHEARSAL_A,
        blueprintVersionId: BLUEPRINT_A,
        outcome: "SUCCESS",
        capturedAt: "2026-10-25T12:00:00.123456Z",
        windowMinutes: 60,
      },
    ],
  };
}

function makeDiagnostic(overrides: Record<string, unknown> = {}): StaffFixedRehearsalDiagnostic {
  return {
    schemaVersion: "staff-fixed-rehearsal-diagnostic/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "BANK_MANAGER",
    observedAt: OBSERVED_AT,
    captureOrigin: "BANK_ELIGIBLE_AT_CAPTURE",
    currentEligibility: "NOT_REVALIDATED",
    qualification: "NOT_ATTESTED_BY_PLATFORM",
    publicationEligibility: "NOT_EVALUATED",
    rehearsal: makeReceipt(),
    replayVerified: true,
    createsForm: false,
    capturedUnitCount: 4,
    capturedCandidateCount: 4,
    selectedCount: 4,
    visitedNodes: 10,
    nodeLimit: 50_000,
    unitLimit: 2_000,
    section: { section: "MATH", requiredCount: 4, selectedCount: 4 },
    ...overrides,
  };
}

describe("private fixed eligible-stock rehearsal contracts", () => {
  it("accepts the bounded EXAM blueprint summary and rejects unsupported or private fields", () => {
    const parsed: StaffFixedRehearsalBlueprintList = StaffFixedRehearsalBlueprintListSchema.parse(makeBlueprintList());
    assert.equal(parsed.accessBasis, "EXAM_MANAGER");
    assert.equal(parsed.items[1]?.section, "READING");
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      items: [blueprintItem({ section: "READING", questionCount: 4 })],
    }).success, false);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      items: [blueprintItem({ name: "  " })],
    }).success, false);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      items: [blueprintItem({ name: "x".repeat(4_097) })],
    }).success, false);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      items: [blueprintItem({ durationSeconds: 21_601 })],
    }).success, false);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      items: [blueprintItem(), blueprintItem()],
    }).success, false);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      truncated: true,
    }).success, false);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      candidateIds: [REHEARSAL_A],
    }).success, false);
    const fullList = {
      ...makeBlueprintList(),
      truncated: true,
      items: Array.from({ length: 20 }, (_, index) => blueprintItem({
        blueprintVersionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })),
    };
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse(fullList).success, true);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      ...makeBlueprintList(),
      items: Array.from({ length: 21 }, (_, index) => blueprintItem({
        blueprintVersionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })),
    }).success, false);
  });

  it("pins strict command input and validates the historical 201 receipt and exact horizon", () => {
    const request: StaffFixedRehearsalRequest = StaffFixedRehearsalRequestSchema.parse(makeRequest());
    assert.equal(request.seed, 42);
    assert.equal(StaffFixedRehearsalRequestSchema.safeParse(makeRequest({ seed: undefined })).success, true);
    assert.equal(StaffFixedRehearsalRequestSchema.safeParse(makeRequest({ windowMinutes: 1 })).success, true);
    assert.equal(StaffFixedRehearsalRequestSchema.safeParse(makeRequest({ windowMinutes: 1_440 })).success, true);
    for (const invalid of [
      makeRequest({ blueprintHash: "bad" }),
      makeRequest({ windowMinutes: 0 }),
      makeRequest({ windowMinutes: 1_441 }),
      makeRequest({ seed: -1 }),
      makeRequest({ seed: 4_294_967_296 }),
      makeRequest({ seed: 1.5 }),
      makeRequest({ candidateIds: [] }),
    ]) assert.equal(StaffFixedRehearsalRequestSchema.safeParse(invalid).success, false);

    const receipt: StaffFixedRehearsalReceipt = StaffFixedRehearsalReceiptSchema.parse(makeReceipt());
    assert.equal(receipt.createsForm, false);
    assert.equal(receipt.currentEligibility, "NOT_REVALIDATED");
    for (const failureCode of ["CONSTRAINT_CONFLICT", "SEARCH_EXHAUSTED"] as const) {
      assert.equal(StaffFixedRehearsalReceiptSchema.safeParse(makeReceipt({ outcome: "FAILURE", failureCode })).success, true);
    }
    assert.equal(StaffFixedRehearsalReceiptSchema.safeParse(makeReceipt({
      outcome: "FAILURE",
      failureCode: "INSUFFICIENT_ELIGIBLE_INVENTORY",
      sectionDeficits: [{ section: "MATH", missingCount: 2 }],
    })).success, true);
    assert.equal(StaffFixedRehearsalReceiptSchema.safeParse(makeReceipt({
      outcome: "FAILURE",
      failureCode: "INSUFFICIENT_ELIGIBLE_INVENTORY",
    })).success, true);
    for (const invalid of [
      makeReceipt({ availableUntil: "2026-10-25T13:00:00.123457Z" }),
      makeReceipt({ requiredThrough: "2026-10-25T13:10:00.123456Z" }),
      makeReceipt({ capturedAt: "2026-10-25T12:00:00Z" }),
      makeReceipt({ capturedAt: "2026-10-25T12:00:00.123456+00:00" }),
      makeReceipt({ outcome: "SUCCESS", failureCode: "SEARCH_EXHAUSTED" }),
      makeReceipt({ outcome: "SUCCESS", sectionDeficits: [{ section: "MATH", missingCount: 1 }] }),
      makeReceipt({ outcome: "FAILURE", failureCode: null }),
      makeReceipt({ outcome: "FAILURE", failureCode: "CONSTRAINT_CONFLICT", sectionDeficits: [{ section: "MATH", missingCount: 1 }] }),
      makeReceipt({ outcome: "FAILURE", failureCode: "UNKNOWN" }),
      makeReceipt({ outcome: "FAILURE", failureCode: "INSUFFICIENT_ELIGIBLE_INVENTORY", sectionDeficits: [
        { section: "MATH", missingCount: 1 }, { section: "READING", missingCount: 1 },
      ] }),
      makeReceipt({ outcome: "FAILURE", failureCode: "INSUFFICIENT_ELIGIBLE_INVENTORY", sectionDeficits: [{ section: "READING", missingCount: 5 }] }),
      makeReceipt({ actorId: REHEARSAL_A }),
      makeReceipt({ seed: 42 }),
      makeReceipt({ eligibleCandidateCount: 100 }),
    ]) assert.equal(StaffFixedRehearsalReceiptSchema.safeParse(invalid).success, false);
  });

  it("checks private BANK history ordering and replayed diagnostic aggregates", () => {
    const parsed: StaffFixedRehearsalList = StaffFixedRehearsalListSchema.parse(makeRehearsalList());
    assert.deepEqual(parsed.items.map(({ rehearsalId }) => rehearsalId), [REHEARSAL_B, REHEARSAL_A]);
    assert.equal(StaffFixedRehearsalListSchema.safeParse({
      ...makeRehearsalList(),
      items: [...makeRehearsalList().items].reverse(),
    }).success, false);
    assert.equal(StaffFixedRehearsalListSchema.safeParse({
      ...makeRehearsalList(),
      items: [makeRehearsalList().items[0], makeRehearsalList().items[0]],
    }).success, false);
    assert.equal(StaffFixedRehearsalListSchema.safeParse({
      ...makeRehearsalList(),
      truncated: true,
    }).success, false);
    const diagnostic: StaffFixedRehearsalDiagnostic = StaffFixedRehearsalDiagnosticSchema.parse(makeDiagnostic());
    assert.equal(diagnostic.captureOrigin, "BANK_ELIGIBLE_AT_CAPTURE");
    assert.equal(diagnostic.replayVerified, true);
    assert.equal(StaffFixedRehearsalDiagnosticSchema.safeParse(makeDiagnostic({
      rehearsal: makeReceipt({ outcome: "FAILURE", failureCode: "CONSTRAINT_CONFLICT" }),
      selectedCount: 0,
      section: { section: "READING", requiredCount: 2, selectedCount: 0 },
    })).success, true);
    assert.equal(StaffFixedRehearsalDiagnosticSchema.safeParse(makeDiagnostic({
      rehearsal: makeReceipt({
        outcome: "FAILURE",
        failureCode: "INSUFFICIENT_ELIGIBLE_INVENTORY",
        sectionDeficits: [{ section: "MATH", missingCount: 1 }],
      }),
      selectedCount: 0,
      section: { section: "MATH", requiredCount: 4, selectedCount: 0 },
    })).success, true);
    for (const invalid of [
      makeDiagnostic({ selectedCount: 3 }),
      makeDiagnostic({ section: { section: "MATH", requiredCount: 4, selectedCount: 3 } }),
      makeDiagnostic({ section: { section: "READING", requiredCount: 4, selectedCount: 4 } }),
      makeDiagnostic({ capturedUnitCount: 10_001 }),
      makeDiagnostic({ capturedCandidateCount: 2_000_001 }),
      makeDiagnostic({ selectedCount: 5 }),
      makeDiagnostic({ visitedNodes: 50_001 }),
      makeDiagnostic({ nodeLimit: 50_001 }),
      makeDiagnostic({ unitLimit: 2_001 }),
      makeDiagnostic({ visitedNodes: 11, nodeLimit: 10 }),
      makeDiagnostic({ replayVerified: false }),
      makeDiagnostic({ currentEligibility: "ELIGIBLE" }),
      makeDiagnostic({ candidateIds: [REHEARSAL_A] }),
      makeDiagnostic({ sourceIds: [REHEARSAL_A] }),
      makeDiagnostic({ historyIds: [REHEARSAL_A] }),
      makeDiagnostic({ rawManifest: {} }),
    ]) assert.equal(StaffFixedRehearsalDiagnosticSchema.safeParse(invalid).success, false);
  });

  it("registers the exact four private operations and excludes them from the student artifact", () => {
    assert.deepEqual(StaffFixedRehearsalDiagnosticPathParamsSchema.parse({ rehearsalId: REHEARSAL_A }), { rehearsalId: REHEARSAL_A });
    assert.equal(StaffFixedRehearsalDiagnosticPathParamsSchema.safeParse({ rehearsalId: "invalid" }).success, false);
    assert.deepEqual(StaffOperationPaths.staffFixedRehearsalBlueprints, {
      method: "GET", path: "/api/v1/fixed-rehearsal-blueprints",
    });
    assert.deepEqual(StaffOperationPaths.staffCreateFixedRehearsal, {
      method: "POST", path: "/api/v1/fixed-rehearsals",
    });
    assert.deepEqual(StaffOperationPaths.staffFixedRehearsals, {
      method: "GET", path: "/api/v1/fixed-rehearsals",
    });
    assert.deepEqual(StaffOperationPaths.staffFixedRehearsalDiagnostic, {
      method: "GET", path: "/api/v1/fixed-rehearsals/{rehearsalId}",
    });
    for (const name of ["staffFixedRehearsalBlueprints", "staffFixedRehearsals", "staffFixedRehearsalDiagnostic"] as const) {
      assert.equal(staffRouteRegistry[name].method, "GET");
      assert.equal("body" in staffRouteRegistry[name], false);
      assert.equal("headers" in staffRouteRegistry[name], false);
      assert.deepEqual(Object.keys(staffRouteRegistry[name].responses), ["200", "401", "403", "404", "422", "503"]);
    }
    const create = staffRouteRegistry.staffCreateFixedRehearsal;
    assert.equal(create.method, "POST");
    assert.deepEqual(create.headers.parse({ "x-csrf-token": "A".repeat(43), "idempotency-key": "b8-fixed-stock-1" }), {
      "x-csrf-token": "A".repeat(43),
      "idempotency-key": "b8-fixed-stock-1",
    });
    assert.equal(create.body.safeParse(makeRequest()).success, true);
    assert.deepEqual(Object.keys(create.responses), ["201", "400", "401", "403", "404", "409", "413", "422", "503"]);

    const staff = generateStaffContractsOpenApi() as {
      paths: Record<string, Record<string, { operationId?: string; requestBody?: { required?: boolean }; parameters?: Array<{ in?: string; name?: string; required?: boolean }>; responses?: Record<string, unknown> }>>;
      components: { schemas: Record<string, unknown> };
    };
    assert.equal(staff.paths["/api/v1/fixed-rehearsal-blueprints"]?.get?.operationId, "staffFixedRehearsalBlueprints");
    const createPath = staff.paths["/api/v1/fixed-rehearsals"]!;
    assert.equal(createPath.post?.operationId, "staffCreateFixedRehearsal");
    assert.equal(createPath.post?.requestBody?.required, true);
    assert.equal(createPath.get?.operationId, "staffFixedRehearsals");
    assert.equal(staff.paths["/api/v1/fixed-rehearsals/{rehearsalId}"]?.get?.operationId, "staffFixedRehearsalDiagnostic");
    assert.ok(staff.components.schemas.StaffFixedRehearsalBlueprintList);
    assert.ok(staff.components.schemas.StaffFixedRehearsalRequest);
    assert.ok(staff.components.schemas.StaffFixedRehearsalReceipt);
    assert.ok(staff.components.schemas.StaffFixedRehearsalList);
    assert.ok(staff.components.schemas.StaffFixedRehearsalDiagnostic);

    const student = generateStudentContractsOpenApi() as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
    for (const path of [
      "/api/v1/fixed-rehearsal-blueprints",
      "/api/v1/fixed-rehearsals",
      "/api/v1/fixed-rehearsals/{rehearsalId}",
    ]) assert.equal(student.paths[path], undefined);
    for (const name of [
      "StaffFixedRehearsalBlueprintList",
      "StaffFixedRehearsalRequest",
      "StaffFixedRehearsalReceipt",
      "StaffFixedRehearsalList",
      "StaffFixedRehearsalDiagnostic",
    ]) assert.equal(student.components.schemas[name], undefined);
  });
});
