import {
  DocumentedErrorResponseSchema,
  StudentQuestionSchema,
  type DocumentedErrorResponse,
  type StudentQuestion,
} from "../../../dist/index.js";

const student: StudentQuestion = StudentQuestionSchema.parse({
  content: [{ type: "text", text: "Synthetic declaration consumer." }],
  interaction: {
    type: "SINGLE_CHOICE",
    options: [
      { id: "a", content: [{ type: "text", text: "A" }] },
      { id: "b", content: [{ type: "text", text: "B" }] },
    ],
  },
});

const error: DocumentedErrorResponse = DocumentedErrorResponseSchema.parse({
  error: { code: "UNAUTHENTICATED", message: "Sign in required", requestId: "synthetic-request", details: {} },
});

// @ts-expect-error Student projections do not include private answer data.
const studentWithPrivate: StudentQuestion = { ...student, private: {} };

// @ts-expect-error SINGLE_CHOICE carries options, not statements.
const wrongInteraction: StudentQuestion["interaction"] = { type: "SINGLE_CHOICE", statements: [] };

void studentWithPrivate;
void wrongInteraction;
void error;
