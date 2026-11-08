import { z } from "zod";
import { ErrorDetailsSchema } from "./index.ts";
import { releasedReviewRouteRegistry, studentRouteRegistry } from "./routes.ts";
import { AuthorizedReleasedReviewV3Schema } from "./released-review-v3.ts";
import { FullSimulationCatalogPageV3Schema } from "./simulation.ts";
import {
  SimulationAttemptViewV3Schema,
  SimulationAttemptHistoryPageV3Schema,
  SimulationCreationReceiptV3Schema,
  SimulationCreateAttemptRequestV3Schema,
  SimulationSectionSwitchReceiptV3Schema,
  SimulationSectionSwitchRequestV3Schema,
  SimulationStartReceiptV3Schema,
} from "./student-v3.ts";

const AnswerConflictV3Schema = z.object({ error: z.object({
  code: z.enum(["REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT", "ATTEMPT_CLOSED", "SECTION_CLOSED", "CONCURRENT_MODIFICATION"]),
  message: z.string().trim().min(1).max(1024),
  requestId: z.string().min(1).max(256),
  details: ErrorDetailsSchema,
}).strict() }).strict();

const base = Object.fromEntries(Object.entries(studentRouteRegistry).map(([operation, definition]) => [operation,
  { ...definition, path: definition.path.replace("/api/v1/", "/api/v3/") },
])) as { [Key in keyof typeof studentRouteRegistry]: Omit<typeof studentRouteRegistry[Key], "path"> & { path: string } };

/** Additive full-simulation routes. Existing v1 and v2 registries remain unchanged. */
export const studentRouteRegistryV3 = {
  ...base,
  catalog: { ...base.catalog,
    responses: { ...base.catalog.responses,
      200: { ...base.catalog.responses[200], schema: FullSimulationCatalogPageV3Schema },
    },
  },
  createAttempt: { ...base.createAttempt,
    body: SimulationCreateAttemptRequestV3Schema,
    responses: { ...base.createAttempt.responses,
      201: { ...base.createAttempt.responses[201], schema: SimulationCreationReceiptV3Schema },
    },
  },
  startAttempt: { ...base.startAttempt,
    responses: { ...base.startAttempt.responses,
      200: { ...base.startAttempt.responses[200], schema: SimulationStartReceiptV3Schema },
    },
  },
  getAttempt: { ...base.getAttempt,
    responses: { ...base.getAttempt.responses,
      200: { ...base.getAttempt.responses[200], schema: SimulationAttemptViewV3Schema },
    },
  },
  saveAnswer: { ...base.saveAnswer,
    responses: { ...base.saveAnswer.responses,
      409: { ...base.saveAnswer.responses[409], schema: AnswerConflictV3Schema },
    },
  },
  attemptHistory: { ...base.attemptHistory,
    responses: { ...base.attemptHistory.responses,
      200: { ...base.attemptHistory.responses[200], schema: SimulationAttemptHistoryPageV3Schema },
    },
  },
  switchSection: {
    method: "POST",
    path: "/api/v3/attempts/{id}/section",
    summary: "Switch the active simulation section",
    params: base.startAttempt.params,
    headers: base.startAttempt.headers,
    body: SimulationSectionSwitchRequestV3Schema,
    responses: {
      200: { contentType: "application/json", schema: SimulationSectionSwitchReceiptV3Schema, description: "Active section receipt" },
      400: base.startAttempt.responses[400],
      401: base.startAttempt.responses[401],
      403: base.startAttempt.responses[403],
      404: base.startAttempt.responses[404],
      409: { contentType: "application/json", schema: AnswerConflictV3Schema, description: "Section or attempt conflict" },
      410: base.startAttempt.responses[410],
      413: base.startAttempt.responses[413],
      422: base.startAttempt.responses[422],
      503: base.startAttempt.responses[503],
    },
  },
} as const;

export const releasedReviewRouteRegistryV3 = {
  releasedResult: { ...releasedReviewRouteRegistry.releasedResult,
    path: "/api/v3/attempts/{id}/result",
    responses: { ...releasedReviewRouteRegistry.releasedResult.responses,
      200: { ...releasedReviewRouteRegistry.releasedResult.responses[200], schema: AuthorizedReleasedReviewV3Schema },
    },
  },
};
