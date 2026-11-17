import React, { useEffect, useMemo, useState } from 'react'
import type { AnswerValue, Interaction, Slot } from '@/api/types'
import { ContentBlocks, plainText } from '@/content/ContentBlocks'
import { buttonClass } from '@/ui/Shell'

export interface ControlProps {
  slot: Slot
  saved: AnswerValue | undefined
  disabled: boolean
  attemptId: string
  apiVersion: string
  onSave: (input: unknown) => Promise<boolean>
  /** Reports whether typed or dragged changes are not saved yet. */
  onDirtyChange?: (dirty: boolean) => void
}

function useReportDirty(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
}

const NUMERIC = /^[+-]?[0-9]{1,40}(?:[.,][0-9]{1,20})?$/u

function OptionLetter({ id, selected }: { id: string; selected: boolean }) {
  return (
    <span aria-hidden="true" className={`tabular-figures shrink-0 w-8 h-8 grid place-items-center rounded-full text-sm font-bold border-[1.5px] ${
      selected ? 'border-pen-red text-pen-red border-2' : 'border-rule-strong text-ink'}`}>
      {id.toUpperCase()}
    </span>
  )
}

export function ChoiceControl({ slot, saved, disabled, attemptId, apiVersion, onSave }: ControlProps) {
  if (slot.interaction.type !== 'SINGLE_CHOICE' && slot.interaction.type !== 'MULTIPLE_CHOICE') return null
  const multiple = slot.interaction.type === 'MULTIPLE_CHOICE'
  const selected = saved?.type === 'MULTIPLE_CHOICE' ? saved.optionIds : saved?.type === 'SINGLE_CHOICE' && saved.optionId ? [saved.optionId] : []
  const max = slot.interaction.type === 'MULTIPLE_CHOICE' ? slot.interaction.maxSelections : 1
  const choose = (id: string, checked: boolean) => {
    if (!multiple) return void onSave({ optionId: id })
    const next = checked ? [...selected, id] : selected.filter((value) => value !== id)
    void onSave({ optionIds: next })
  }
  return (
    <fieldset className="grid gap-2.5 min-w-0" data-testid="option-list">
      <legend className="sr-only">{multiple ? `Chọn tối đa ${max} phương án` : 'Chọn một phương án'}</legend>
      {slot.interaction.options.map((option) => {
        const isSelected = selected.includes(option.id)
        const atLimit = multiple && !isSelected && selected.length >= max
        return (
          <label key={option.id} className={`flex items-center gap-3 min-h-[56px] px-4 py-3 border rounded-[3px] cursor-pointer transition-colors ${
            isSelected ? 'border-pen-red bg-pen-red-wash shadow-[inset_3px_0_0_var(--pen-red)]' : 'border-rule-strong bg-paper-sheet hover:border-ink'} ${disabled || atLimit ? 'cursor-not-allowed opacity-70' : ''}`}>
            <input type={multiple ? 'checkbox' : 'radio'} name={`answer-${slot.slotId}`} value={option.id} checked={isSelected}
              disabled={disabled || atLimit} data-testid={`option-${option.id}`} onChange={(event) => choose(option.id, event.target.checked)}
              className="sr-only peer" />
            <OptionLetter id={option.id} selected={isSelected} />
            <ContentBlocks blocks={option.content} attemptId={attemptId} apiVersion={apiVersion} className="text-[15px] leading-[1.55] flex-1" />
          </label>
        )
      })}
    </fieldset>
  )
}

export function TrueFalseControl({ slot, saved, disabled, attemptId, apiVersion, onSave }: ControlProps) {
  if (slot.interaction.type !== 'TRUE_FALSE_GROUP') return null
  const values = new Map((saved?.type === 'TRUE_FALSE_GROUP' ? saved.statementValues : []).map((item) => [item.statementId, item.value]))
  const choose = (statementId: string, value: boolean) => {
    const next = new Map(values); next.set(statementId, value)
    void onSave({ statementValues: [...next].map(([id, item]) => ({ statementId: id, value: item })) })
  }
  return (
    <div className="grid gap-2.5" data-testid="true-false-group">
      {slot.interaction.statements.map((statement, index) => (
        <fieldset key={statement.id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center gap-3 border border-rule-strong bg-paper-sheet px-4 py-3 rounded-[3px] min-w-0"
          data-testid={`tf-statement-${statement.id}`}>
          <legend className="sr-only">Mệnh đề {index + 1}</legend>
          <div className="min-w-0">
            <span className="tabular-figures text-xs font-bold text-ink-secondary">Mệnh đề {index + 1}</span>
            <ContentBlocks blocks={statement.content ?? (statement.text ? [{ type: 'text', text: statement.text }] : [])} attemptId={attemptId} apiVersion={apiVersion} className="text-[15px]" />
          </div>
          <div role="radiogroup" aria-label={`Mệnh đề ${index + 1}: ${plainText(statement.content)}`} className="flex gap-1.5">
            {([[true, 'Đúng'], [false, 'Sai']] as const).map(([value, label]) => {
              const checked = values.get(statement.id) === value
              return (
                <label key={label} className={`relative inline-flex items-center justify-center w-[72px] min-h-[44px] text-sm font-semibold border rounded-[3px] cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ink ${
                  checked ? 'bg-pen-red border-pen-red text-paper-sheet' : 'bg-paper-sheet border-rule-strong text-ink hover:border-ink'}`}>
                  <input type="radio" name={`answer-${slot.slotId}-${statement.id}`} checked={checked} disabled={disabled}
                    data-testid={`tf-${statement.id}-${value}`} onChange={() => choose(statement.id, value)} className="absolute opacity-0 w-px h-px" />
                  {label}
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

function SaveBar({ dirty, disabled, invalid, onSave, label = 'Lưu câu trả lời' }: { dirty: boolean; disabled: boolean; invalid?: string | null; onSave: () => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled || !dirty || Boolean(invalid)} onClick={onSave} data-testid="answer-save" className={buttonClass.ink}>{label}</button>
      {dirty && !invalid && <span className="text-xs font-semibold text-ochre" data-testid="answer-unsaved">Chưa lưu thay đổi</span>}
      {invalid && <span role="status" className="text-xs font-semibold text-pen-red" data-testid="answer-invalid">{invalid}</span>}
    </div>
  )
}

export function NumericControl({ slot, saved, disabled, onSave, onDirtyChange }: ControlProps) {
  const savedValue = saved?.type === 'NUMERIC_RESPONSE' && typeof saved.value === 'string' ? saved.value : ''
  const [draft, setDraft] = useState(savedValue)
  useEffect(() => setDraft(savedValue), [savedValue, slot.slotId])
  const invalid = draft.trim() && !NUMERIC.test(draft.trim()) ? 'Số chưa đúng định dạng: dùng dấu phẩy cho phần thập phân, không dùng dấu phân nhóm.' : null
  useReportDirty(draft.trim() !== savedValue.trim(), onDirtyChange)
  const rawLabel = (slot.interaction as { label?: unknown }).label
  const label = typeof rawLabel === 'string' ? rawLabel : 'Đáp án'
  return (
    <div className="grid gap-3 max-w-[560px]">
      <label htmlFor={`numeric-${slot.slotId}`} className="text-sm font-semibold">{label}</label>
      <input id={`numeric-${slot.slotId}`} type="text" inputMode="decimal" maxLength={64} autoComplete="off" spellCheck={false}
        value={draft} disabled={disabled} data-testid="numeric-answer-input" onChange={(event) => setDraft(event.target.value)}
        className="tabular-figures w-full sm:w-[360px] min-h-[52px] px-4 text-lg bg-paper-sheet border border-rule-strong focus:border-ink rounded-[3px]" />
      <p className="text-xs text-ink-secondary">Có thể có dấu + hoặc −; dấu phẩy là dấu thập phân. Ví dụ: <span className="tabular-figures">-12,5</span></p>
      <SaveBar dirty={draft.trim() !== savedValue.trim()} disabled={disabled} invalid={invalid}
        onSave={() => void onSave({ type: 'NUMERIC_RESPONSE', value: draft.trim() === '' ? null : draft })} />
    </div>
  )
}

export function ClozeControl({ slot, saved, disabled, onSave, onDirtyChange }: ControlProps) {
  const interaction = slot.interaction as Extract<Interaction, { type: 'CLOZE' }>
  const savedValues = saved?.type === 'CLOZE' ? saved.values : {}
  const initial = () => Object.fromEntries(interaction.fields.map(({ id }) => [id, typeof savedValues[id] === 'string' ? savedValues[id] as string : '']))
  const [draft, setDraft] = useState<Record<string, string>>(initial)
  const savedKey = JSON.stringify(savedValues)
  useEffect(() => setDraft(initial()), [savedKey, slot.slotId]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = interaction.fields.some(({ id }) => (draft[id] ?? '') !== (typeof savedValues[id] === 'string' ? savedValues[id] : ''))
  useReportDirty(dirty, onDirtyChange)
  return (
    <div className="grid gap-4" data-testid="cloze-response-control">
      <p className="text-xs text-ink-secondary">Tối đa {interaction.maxLength} ký tự mỗi ô. Phân biệt chữ hoa, chữ thường và dấu tiếng Việt.</p>
      {interaction.fields.map((field, index) => (
        <label key={field.id} className="grid gap-1.5 min-w-0">
          <span className="text-sm font-semibold"><span className="tabular-figures text-pen-red mr-2">({index + 1})</span>{field.label}</span>
          <input type="text" autoComplete="off" spellCheck={false} maxLength={interaction.maxLength} disabled={disabled}
            value={draft[field.id] ?? ''} data-testid={`cloze-answer-${field.id}`}
            onChange={(event) => setDraft((current) => ({ ...current, [field.id]: event.target.value }))}
            className="w-full min-h-[48px] px-3 bg-paper-sheet border-0 border-b-2 border-ink/40 focus:border-pen-red text-[15px]" />
        </label>
      ))}
      <SaveBar dirty={dirty} disabled={disabled}
        onSave={() => void onSave({ type: 'CLOZE', values: Object.fromEntries(interaction.fields.map(({ id }) => [id, draft[id]?.length ? draft[id] : null])) })} />
    </div>
  )
}

/** Matching: drag a card onto a row, or tap a card then tap a row, or use each row's list. All three save the same answer. */
export function MatchingControl({ slot, saved, disabled, onSave, onDirtyChange }: ControlProps) {
  const { rows, targets } = slot.interaction as Extract<Interaction, { type: 'MATCHING' }>
  const savedAssignments = saved?.type === 'MATCHING' ? saved.assignments : {}
  const initial = () => Object.fromEntries(rows.map(({ id }) => [id, typeof savedAssignments[id] === 'string' ? savedAssignments[id] as string : null]))
  const [draft, setDraft] = useState<Record<string, string | null>>(initial)
  const [picked, setPicked] = useState<string | null>(null)
  const [overRow, setOverRow] = useState<string | null>(null)
  const savedKey = JSON.stringify(savedAssignments)
  useEffect(() => { setDraft(initial()); setPicked(null) }, [savedKey, slot.slotId]) // eslint-disable-line react-hooks/exhaustive-deps

  const uses = useMemo(() => {
    const counts = new Map<string, number>()
    for (const value of Object.values(draft)) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    return counts
  }, [draft])
  const targetLabel = new Map(targets.map((target) => [target.id, target.label]))
  const remaining = (targetId: string) => (targets.find((target) => target.id === targetId)?.maxUses ?? 0) - (uses.get(targetId) ?? 0)

  const assign = (rowId: string, targetId: string | null) => {
    setDraft((current) => {
      if (targetId && current[rowId] !== targetId) {
        const limit = targets.find((target) => target.id === targetId)?.maxUses ?? 0
        const used = Object.entries(current).filter(([id, value]) => id !== rowId && value === targetId).length
        if (used >= limit) return current
      }
      return { ...current, [rowId]: targetId }
    })
    setPicked(null)
  }
  const dirty = rows.some(({ id }) => (draft[id] ?? null) !== (typeof savedAssignments[id] === 'string' ? savedAssignments[id] : null))
  useReportDirty(dirty, onDirtyChange)

  return (
    <div className="grid gap-5" data-testid="matching-response-control">
      <p className="text-xs text-ink-secondary">Kéo thẻ ở cột phải thả vào từng dòng, hoặc chạm một thẻ rồi chạm dòng cần ghép. Có thể dùng danh sách chọn ở mỗi dòng.</p>
      <div className="grid gap-5 lg:grid-cols-[1fr_260px] items-start">
        <ol className="grid gap-2.5">
          {rows.map((row, index) => {
            const value = draft[row.id]
            return (
              <li key={row.id}
                onDragOver={(event) => { if (!disabled) { event.preventDefault(); setOverRow(row.id) } }}
                onDragLeave={() => setOverRow((current) => current === row.id ? null : current)}
                onDrop={(event) => { event.preventDefault(); setOverRow(null); const id = event.dataTransfer.getData('text/plain'); if (id && !disabled) assign(row.id, id) }}
                className={`grid grid-cols-1 sm:grid-cols-[1fr_minmax(160px,42%)] gap-2 items-center border px-3 py-3 rounded-[3px] transition-colors ${
                  overRow === row.id ? 'border-pen-red bg-pen-red-wash' : 'border-rule-strong bg-paper-sheet'}`}
                data-testid={`matching-row-${row.id}`}>
                <span className="text-sm font-semibold min-w-0"><span className="tabular-figures text-pen-red mr-2">{index + 1}.</span>{row.label}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <button type="button" disabled={disabled || (!picked && !value)}
                    onClick={() => picked ? assign(row.id, picked) : assign(row.id, null)}
                    aria-label={picked ? `Ghép “${targetLabel.get(picked)}” vào dòng ${index + 1}` : value ? `Bỏ ghép dòng ${index + 1}` : `Dòng ${index + 1} chưa ghép`}
                    data-testid={`matching-drop-${row.id}`}
                    className={`flex-1 min-w-0 min-h-[44px] px-3 text-left text-sm border border-dashed rounded-[3px] ${
                      value ? 'border-ink bg-paper font-semibold text-ink' : picked ? 'border-pen-red text-pen-red' : 'border-rule-strong text-ink-muted'}`}>
                    {value ? targetLabel.get(value) : picked ? 'Chạm để ghép vào đây' : 'Thả thẻ vào đây'}
                  </button>
                  <select aria-label={`Chọn mục ghép cho dòng ${index + 1}: ${row.label}`} disabled={disabled} value={value ?? ''}
                    data-testid={`matching-answer-${row.id}`} onChange={(event) => assign(row.id, event.target.value || null)}
                    className="w-11 sm:w-auto sm:max-w-[120px] min-h-[44px] px-1 text-xs bg-paper-sheet border border-rule-strong rounded-[3px]">
                    <option value="">—</option>
                    {targets.map((target) => (
                      <option key={target.id} value={target.id} disabled={target.id !== value && remaining(target.id) <= 0}>{target.label}</option>
                    ))}
                  </select>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="grid gap-2 lg:sticky lg:top-4" aria-label="Thẻ để ghép">
          {targets.map((target) => {
            const left = remaining(target.id)
            return (
              <button key={target.id} type="button" draggable={!disabled && left > 0} disabled={disabled || left <= 0}
                aria-pressed={picked === target.id} data-testid={`matching-card-${target.id}`}
                onDragStart={(event) => { event.dataTransfer.setData('text/plain', target.id); event.dataTransfer.effectAllowed = 'move' }}
                onClick={() => setPicked((current) => current === target.id ? null : target.id)}
                className={`flex items-center justify-between gap-2 min-h-[44px] px-3 text-left text-sm font-semibold border rounded-[3px] cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45 ${
                  picked === target.id ? 'border-pen-red bg-pen-red-wash text-pen-red' : 'border-ink bg-paper-sheet text-ink'}`}>
                <span className="min-w-0">{target.label}</span>
                <span className="tabular-figures text-[11px] font-medium text-ink-secondary shrink-0">còn {Math.max(0, left)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <SaveBar dirty={dirty} disabled={disabled} onSave={() => void onSave({ type: 'MATCHING', assignments: draft })} />
    </div>
  )
}

export function AnswerControl(props: ControlProps) {
  switch (props.slot.interaction.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': return <ChoiceControl {...props} />
    case 'TRUE_FALSE_GROUP': return <TrueFalseControl {...props} />
    case 'NUMERIC_RESPONSE': return <NumericControl {...props} />
    case 'CLOZE': return <ClozeControl {...props} />
    case 'MATCHING': return <MatchingControl {...props} />
    default: return <p className="text-sm text-pen-red">Loại câu hỏi này chưa được hỗ trợ trong giao diện mới.</p>
  }
}

export const KIND_LABELS: Record<string, string> = {
  SINGLE_CHOICE: 'Trắc nghiệm', MULTIPLE_CHOICE: 'Chọn nhiều đáp án', TRUE_FALSE_GROUP: 'Đúng / Sai',
  NUMERIC_RESPONSE: 'Điền đáp án số', CLOZE: 'Điền khuyết', MATCHING: 'Ghép nối',
}
