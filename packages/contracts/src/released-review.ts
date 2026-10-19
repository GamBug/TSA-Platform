/** Authorized released-review shapes; runtime access checks remain mandatory. */
export {
  AnswerKeySchema,
  AuthorizedReleasedReviewSchema,
  ReleasedReviewItemSchema,
} from "./index.ts";
export type { AnswerKey, AuthorizedReleasedReview, ReleasedReviewItem } from "./index.ts";
export { releasedReviewRouteRegistry } from "./routes.ts";
export type { ReleasedReviewOperationMap } from "./routes.ts";
export type { ReleasedReviewOperations } from "./generated/released-review-operations.ts";
