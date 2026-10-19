import type { AnswerKey, ReleasedReviewOperations } from "../../../dist/released-review.js";
declare const result: ReleasedReviewOperations["releasedResult"]["responses"][200];
const key: AnswerKey = result.items[0]!.correctAnswer;
// @ts-expect-error Released review excludes provenance and authoring internals.
const provenance = result.provenanceIds;
// @ts-expect-error Released review does not expose Factory parsing.
import { parseFactoryPackageV2 } from "../../../dist/released-review.js";
void key;
void provenance;
