import { useState } from 'react'
import type { AnswerValue, Slot } from '@/api/types'

export function isAnswered(slot: Slot, value: AnswerValue | undefined): boolean {
  if (!value) return false
  const interaction = slot.interaction
  switch (value.type) {
    case 'SINGLE_CHOICE': return typeof value.optionId === 'string'
    case 'MULTIPLE_CHOICE': return interaction.type === 'MULTIPLE_CHOICE' && value.optionIds.length >= interaction.minSelections
    case 'TRUE_FALSE_GROUP': return interaction.type === 'TRUE_FALSE_GROUP' && interaction.statements.every(({ id }) => value.statementValues.some((item) => item.statementId === id))
    case 'NUMERIC_RESPONSE': return typeof value.value === 'string' && value.value.trim().length > 0
    case 'CLOZE': return interaction.type === 'CLOZE' && interaction.fields.every(({ id }) => typeof value.values[id] === 'string' && (value.values[id] as string).trim().length > 0)
    case 'MATCHING': return interaction.type === 'MATCHING' && interaction.rows.every(({ id }) => typeof value.assignments[id] === 'string')
  }
}

export function useFlags(attemptId: string) {
  const key = `tsa-student-web:flags:${attemptId}`
  const [flags, setFlags] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(key) ?? '[]')) } catch { return new Set() }
  })
  const toggle = (slotId: string) => setFlags((current) => {
    const next = new Set(current)
    if (next.has(slotId)) next.delete(slotId); else next.add(slotId)
    try { sessionStorage.setItem(key, JSON.stringify([...next])) } catch { /* flags stay in memory */ }
    return next
  })
  return { flags, toggle }
}

/** Whether the question grid beside a test is shown. Hiding it gives the question the whole width; remembered per browser. */
export function useQuestionPanel() {
  const key = 'tsa-student-web:question-panel'
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(key) !== 'hidden' } catch { return true }
  })
  const toggle = () => setOpen((current) => {
    try { localStorage.setItem(key, current ? 'hidden' : 'shown') } catch { /* the choice stays in memory */ }
    return !current
  })
  return { open, toggle }
}
