import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StaffDatasetPreflightRequestSchema,
  StaffDatasetPreflightSchema,
  type StaffDatasetPreflight,
  type StaffDatasetPreflightRequest,
} from "../src/staff.ts";
import {
  StaffDatasetPreflightRequestHeadersSchema,
  staffRouteRegistry,
  type StaffOperationMap,
} from "../src/staff-routes.ts";

const uuid = (serial: number): string => `00000000-0000-4000-8000-${String(serial).padStart(12, "0")}`;
const hash = `sha256:${"a".repeat(64)}`;
const requiredBlockers = [
  "CURRENT_RIGHTS_UNVERIFIED",
  "HUMAN_EQUIVALENCE_REVIEW_REQUIRED",
  "LAWFUL_INVENTORY_UNVERIFIED",
  "NAMED_HUMAN_AUTHOR_REQUIRED",
  "NAMED_INDEPENDENT_REVIEWER_REQUIRED",
] as const;

function version(serial: number) {
  return {
    versionId: uuid(serial),
    contentHash: hash,
    workflowRevision: 1,
    state: "APPROVED" as const,
  };
}

function report(overrides: Partial<StaffDatasetPreflight> = {}): StaffDatasetPreflight {
  return {
    schemaVersion: "staff-dataset-preflight/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "BANK_MANAGER",
    scope: "CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION",
    generatedAt: "2026-10-24T12:34:56.123456Z",
    qualification: "NOT_ATTESTED_BY_PLATFORM",
    publicationEligibility: "NOT_EVALUATED",
    publishing: false,
    eligibilityRevision: "0",
    targets: { MATH: 12, READING: 6, SCIENCE: 12 },
    counts: {
      total: 1,
      bySection: { MATH: 1, READING: 0, SCIENCE: 0 },
      byInteractionType: { SINGLE_CHOICE: 1, MULTIPLE_CHOICE: 0, TRUE_FALSE_GROUP: 0 },
    },
    shortfalls: { MATH: 11, READING: 6, SCIENCE: 12 },
    duplicateFingerprintGroupCount: 0,
    blockerCodes: [...requiredBlockers, "STARTER_TARGET_SHORTFALL"],
    versions: [version(1)],
    ...overrides,
  };
}

describe("private staff canonical dataset preflight contracts", () => {
  it("accepts explicit 1..100 unique version/hash pins and rejects malformed or duplicate pins", () => {
    const pin = { versionId: uuid(1), contentHash: hash };
    const parsed: StaffDatasetPreflightRequest = StaffDatasetPreflightRequestSchema.parse({ versions: [pin] });
    assert.deepEqual(parsed, { versions: [pin] });
    assert.equal(StaffDatasetPreflightRequestSchema.safeParse({ versions: [] }).success, false);
    assert.equal(StaffDatasetPreflightRequestSchema.safeParse({ versions: Array.from({ length: 101 }, (_, i) => ({ ...pin, versionId: uuid(i + 1) })) }).success, false);
    assert.equal(StaffDatasetPreflightRequestSchema.safeParse({ versions: [pin, pin] }).success, false);
    assert.equal(StaffDatasetPreflightRequestSchema.safeParse({ versions: [{ ...pin, contentHash: hash.toUpperCase() }] }).success, false);
    assert.equal(StaffDatasetPreflightRequestSchema.safeParse({ versions: [pin], actorId: uuid(2) }).success, false);
  });

  it("accepts canonical response observations with consistent count sums and conditional blockers", () => {
    const parsed = StaffDatasetPreflightSchema.parse(report());
    assert.equal(parsed.scope, "CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION");
    assert.equal(parsed.publishing, false);
    assert.equal(parsed.counts.total, parsed.versions.length);

    const fullVersions = Array.from({ length: 30 }, (_, index) => version(index + 1));
    const complete = report({
      counts: {
        total: 30,
        bySection: { MATH: 12, READING: 6, SCIENCE: 12 },
        byInteractionType: { SINGLE_CHOICE: 30, MULTIPLE_CHOICE: 0, TRUE_FALSE_GROUP: 0 },
      },
      shortfalls: { MATH: 0, READING: 0, SCIENCE: 0 },
      blockerCodes: [...requiredBlockers],
      versions: fullVersions,
    });
    assert.equal(StaffDatasetPreflightSchema.safeParse(complete).success, true);

    const duplicateBlockers = report({
      duplicateFingerprintGroupCount: 1,
      blockerCodes: [
        "CURRENT_RIGHTS_UNVERIFIED",
        "DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW",
        "HUMAN_EQUIVALENCE_REVIEW_REQUIRED",
        "LAWFUL_INVENTORY_UNVERIFIED",
        "NAMED_HUMAN_AUTHOR_REQUIRED",
        "NAMED_INDEPENDENT_REVIEWER_REQUIRED",
        "STARTER_TARGET_SHORTFALL",
      ],
    });
    assert.equal(StaffDatasetPreflightSchema.safeParse(duplicateBlockers).success, true);
  });

  it("rejects count, shortfall, blocker, timestamp, revision, order, and private-field inconsistencies", () => {
    const base = report();
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, generatedAt: "2026-10-24T12:34:56.123Z" }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, eligibilityRevision: "01" }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, eligibilityRevision: 1 }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, eligibilityRevision: "-1" }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, schemaVersion: "dataset-preflight-report/1" }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, scope: "PUBLICATION_AUTHORIZED" }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, publishing: true }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, manifestDigest: hash }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, counts: { ...base.counts, total: 2 } }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, counts: { ...base.counts, bySection: { MATH: 0, READING: 0, SCIENCE: 0 } } }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, shortfalls: { MATH: 10, READING: 6, SCIENCE: 12 } }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, blockerCodes: [...requiredBlockers] }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, blockerCodes: [...requiredBlockers].reverse() }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, blockerCodes: [...base.blockerCodes, "STARTER_TARGET_SHORTFALL"] }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, duplicateFingerprintGroupCount: 1 }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, versions: [version(2), version(1)] }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, versions: [version(1), version(1)] }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, versions: [{ ...version(1), questionId: uuid(2) }] }).success, false);
    assert.equal(StaffDatasetPreflightSchema.safeParse({ ...base, eligibilityRevision: "1".repeat(1024 * 1024) }).success, false);
  });

  it("registers an additive private POST with only CSRF headers and no path or query inputs", () => {
    const route = staffRouteRegistry.staffDatasetPreflight;
    assert.equal(route.method, "POST");
    assert.equal(route.path, "/api/v1/datasets/preflight");
    assert.equal(Object.hasOwn(route, "params"), false);
    assert.equal(route.body, StaffDatasetPreflightRequestSchema);
    assert.equal(route.headers, StaffDatasetPreflightRequestHeadersSchema);
    assert.deepEqual(Object.keys(route.responses), ["200", "400", "401", "403", "404", "409", "413", "422", "503"]);
    assert.deepEqual(StaffDatasetPreflightRequestHeadersSchema.parse({ "x-csrf-token": "A".repeat(43) }), {
      "x-csrf-token": "A".repeat(43),
    });
    assert.equal(StaffDatasetPreflightRequestHeadersSchema.safeParse({
      "x-csrf-token": "A".repeat(43),
      "idempotency-key": "not-required",
    }).success, false);

    const params: StaffOperationMap["staffDatasetPreflight"]["params"] = undefined;
    const query: StaffOperationMap["staffDatasetPreflight"]["query"] = undefined;
    const headers: StaffOperationMap["staffDatasetPreflight"]["headers"] = { "x-csrf-token": "A".repeat(43) };
    const body: StaffOperationMap["staffDatasetPreflight"]["body"] = { versions: [{ versionId: uuid(1), contentHash: hash }] };
    assert.equal(params, undefined);
    assert.equal(query, undefined);
    assert.equal(StaffDatasetPreflightRequestHeadersSchema.safeParse(headers).success, true);
    assert.equal(StaffDatasetPreflightRequestSchema.safeParse(body).success, true);
  });
});
