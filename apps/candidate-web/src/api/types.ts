// Shapes returned by the existing student API client (apps/practice-prototype/public/app/persistent-api.js).
// The server owns these contracts; this file only describes what the React app reads.

export type Domain = 'MATH' | 'READING' | 'SCIENCE'

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'math'; tex: string; display?: boolean; inline?: boolean; accessibleText?: string }
  | { type: 'table'; caption?: string; headers?: string[]; rows?: string[][] }
  | { type: 'image'; assetVersionId: string; alt: string; caption?: string }

export interface ChoiceOption { id: string; content: ContentBlock[] }
export interface Statement { id: string; label?: string; content?: ContentBlock[]; text?: string }

export type Interaction =
  | { type: 'SINGLE_CHOICE'; options: ChoiceOption[] }
  | { type: 'MULTIPLE_CHOICE'; options: ChoiceOption[]; minSelections: number; maxSelections: number }
  | { type: 'TRUE_FALSE_GROUP'; statements: Statement[] }
  | { type: 'NUMERIC_RESPONSE'; [key: string]: unknown }
  | { type: 'CLOZE'; fields: { id: string; label: string }[]; maxLength: number }
  | { type: 'MATCHING'; rows: { id: string; label: string }[]; targets: { id: string; label: string; maxUses: number }[] }

export interface Slot {
  slotId: string
  sectionId?: string
  ordinal: number
  stimulus?: { content?: ContentBlock[] } | null
  content: ContentBlock[]
  interaction: Interaction
}

export type AnswerValue =
  | { slotId: string; type: 'SINGLE_CHOICE'; optionId: string | null; revision: number }
  | { slotId: string; type: 'MULTIPLE_CHOICE'; optionIds: string[]; revision: number }
  | { slotId: string; type: 'TRUE_FALSE_GROUP'; statementValues: { statementId: string; value: boolean }[]; revision: number }
  | { slotId: string; type: 'NUMERIC_RESPONSE'; value: string | null; revision: number }
  | { slotId: string; type: 'CLOZE'; values: Record<string, string | null>; revision: number }
  | { slotId: string; type: 'MATCHING'; assignments: Record<string, string | null>; revision: number }

export type AttemptState = 'CREATED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'GRADED' | 'CANCELLED' | 'INVALIDATED'

export interface Attempt {
  attemptId: string
  formId: string
  domain: Domain
  state: AttemptState
  practiceProfile: CatalogProfile | null
  serverNow: string
  startedAt: string | null
  deadlineAt: string | null
  closedAt: string | null
  closureReason: string | null
  gradingStatus: string | null
  questionCount: number
  durationSeconds: number
  slots: Slot[]
  answers: AnswerValue[]
  answeredCount: number
  result: { label: string; correctCount: number; totalCount: number; percentage: number } | null
}

export interface CatalogProfile {
  domain: Domain
  name: string
  questionCount: number
  durationSeconds: number
  isShort: boolean
  reviewAllowed: boolean
  availableFrom: string
  availableUntil: string
  blueprintVersionId: string
  available: boolean
}

export interface Principal { userId: string; actorKey?: string; displayName?: string; roles: string[] }
export interface SessionState { authenticated: boolean; principal?: Principal }

export interface ReviewSlot {
  slotId: string
  ordinal: number
  type: Interaction['type']
  earned: number
  correctOptionId?: string
  correctOptionIds?: string[]
  correctNumericValue?: string
  numericResponseValue?: string | null
  correctStatementValues?: { statementId: string; value: boolean }[]
  statementValues?: { statementId: string; value: boolean }[]
  clozeResponseValues?: Record<string, string | null>
  clozeAcceptedValues?: Record<string, string[]>
  matchingAssignments?: Record<string, string | null>
  correctMatchingAnswers?: Record<string, string>
  explanation: ContentBlock[] | null
}

export interface ApiError extends Error { code?: string; status?: number; details?: Record<string, unknown> }

export interface StudentApi {
  openDemoSession(): Promise<{ attempt: Attempt | null }>
  loginCandidate(actorKey: 'studentA' | 'studentB'): Promise<SessionState>
  logout(): Promise<void>
  loadCatalog(): Promise<{ domains: CatalogProfile[] }>
  startDemo(domain: Domain, blueprintVersionId: string): Promise<{ attempt: Attempt; resumed: boolean }>
  startReservedAttempt(attemptId: string, expected?: unknown): Promise<{ attempt: Attempt; resumed: boolean }>
  readAttempt(attemptId: string, expected?: unknown): Promise<{ attempt: Attempt }>
  saveAnswer(attemptId: string, slotId: string, input: unknown): Promise<{ attempt: Attempt; message: string }>
  submitAttempt(attemptId: string): Promise<{ attempt: Attempt }>
  readReview(attemptId: string): Promise<{ review: { attemptId: string; slots: ReviewSlot[] } }>
}
