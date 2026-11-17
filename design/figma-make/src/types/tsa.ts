export type ScreenId = 'home' | 'catalog' | 'question' | 'sections' | 'result'

export type SectionId = 'math' | 'reading' | 'science'

export type QuestionType = 'mcq' | 'numeric' | 'cloze' | 'matching'

export type FigureVariant = 'catalytic-yield' | 'parabola-tangent'

export interface FigureSpec {
  code: string
  title: string
  caption: string
  variant: FigureVariant
  hint: string
}

export interface McqOption {
  key: 'A' | 'B' | 'C' | 'D'
  text: string
}

export interface ClozeBlank {
  id: string
  label: string
  choices: string[]
  correctChoice: string
}

export interface MatchingPair {
  id: string
  leftLabel: string
  leftText: string
  correctRightId: string
}

export interface MatchingRightOption {
  id: string
  label: string
  text: string
}

export interface QuestionItem {
  id: string
  numberInSection: number
  section: SectionId
  topicId: string
  topicTitle: string
  type: QuestionType
  prompt: string
  passageId?: string
  figure?: FigureSpec
  options?: McqOption[]
  correctOption?: 'A' | 'B' | 'C' | 'D'
  unit?: string
  acceptedNumeric?: string[]
  numericHint?: string
  clozeSegments?: Array<{ text: string; blankId?: string }>
  clozeBlanks?: ClozeBlank[]
  matchingLeft?: MatchingPair[]
  matchingRight?: MatchingRightOption[]
  explanation: string
}

export interface ReadingPassage {
  id: string
  code: string
  title: string
  sourceNote: string
  paragraphs: string[]
}

export interface TopicEntry {
  id: string
  orderNumber: string
  section: SectionId
  title: string
  subtitle: string
  questionCount: number
  estimatedMinutes: number
}

export interface SectionConfig {
  id: SectionId
  title: string
  shortTitle: string
  totalQuestions: number
  durationSeconds: number
  description: string
}

export type UserAnswer =
  | { type: 'mcq'; value: 'A' | 'B' | 'C' | 'D' }
  | { type: 'numeric'; value: string }
  | { type: 'cloze'; values: Record<string, string> }
  | { type: 'matching'; pairs: Record<string, string> }

export interface SectionClockState {
  remainingSeconds: number
  status: 'active' | 'finished' | 'expired'
}

export type CatalogFetchState = 'ready' | 'loading' | 'error'
