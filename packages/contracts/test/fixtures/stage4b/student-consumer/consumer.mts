import {
  CatalogQuerySchema,
  StudentQuestionSchema,
  type StudentOperations,
  type StudentQuestion,
} from "../../../../dist/student.js";

const question: StudentQuestion = StudentQuestionSchema.parse({
  content: [{ type: "text", text: "Synthetic emitted student consumer." }],
  interaction: {
    type: "SINGLE_CHOICE",
    options: [
      { id: "a", content: [{ type: "text", text: "A" }] },
      { id: "b", content: [{ type: "text", text: "B" }] },
    ],
  },
});
const query: StudentOperations["catalog"]["query"] = { cursor: "opaque", limit: "25" };
const parsedLimit: number | undefined = CatalogQuerySchema.parse(query).limit;
// @ts-expect-error Generated request types preserve the wire string type.
const invalidQuery: StudentOperations["catalog"]["query"] = { limit: 25 };
void invalidQuery;

// @ts-expect-error The student entrypoint does not expose answer keys.
import { AnswerKeySchema } from "../../../../dist/student.js";
// @ts-expect-error The student entrypoint does not expose the fully validating factory parser.
import { parseFactoryPackageV2 } from "../../../../dist/student.js";

void question;
void parsedLimit;

// @ts-expect-error No private-input projection helper is exposed by the student entry.
import { toStudentQuestion } from "../../../../dist/student.js";
// @ts-expect-error Authoring schemas remain internal.
import { QuestionVersionSchema } from "../../../../dist/student.js";
// @ts-expect-error Private response fields are not added by generated operations.
const invalidQuestion: StudentQuestion = { ...question, private: { answerKey: "hidden" } };
void invalidQuestion;
