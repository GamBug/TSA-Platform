import React from 'react'
import { IconClock, IconLock } from './Icons'

interface TimerChipProps {
  remainingSeconds: number
  expired?: boolean
  compact?: boolean
  label?: string
}

export function formatClockMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function TimerChip({
  remainingSeconds,
  expired = false,
  compact = false,
  label,
}: TimerChipProps) {
  const isExpired = expired || remainingSeconds <= 0
  const isUnderFiveMinutes = !isExpired && remainingSeconds <= 5 * 60

  if (isExpired) {
    return (
      <div
        role="status"
        aria-label="Hết thời gian làm phần thi"
        className={`inline-flex items-center gap-2 bg-pen-red-wash border border-pen-red rounded-[3px] ${
          compact ? 'px-2.5 py-1.5 min-h-[36px]' : 'px-3 py-2'
        }`}
      >
        <IconLock size={14} className="text-pen-red shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wide text-pen-red">
          {label ? `${label} · Hết giờ` : 'Hết giờ'}
        </span>
        <span className="tabular-figures text-sm sm:text-base font-bold text-pen-red tracking-tight">
          00:00
        </span>
      </div>
    )
  }

  if (isUnderFiveMinutes) {
    return (
      <div
        role="status"
        aria-label={`Sắp hết giờ: còn ${formatClockMMSS(remainingSeconds)}`}
        className={`inline-flex items-center gap-2 bg-ochre-wash border border-ochre rounded-[3px] ${
          compact ? 'px-2.5 py-1.5 min-h-[36px]' : 'px-3 py-2'
        }`}
      >
        <span className="w-2 h-2 bg-pen-red rounded-[1px] shrink-0" />
        <span className="text-xs font-semibold text-ink whitespace-nowrap">
          {label ? label : compact ? 'Dưới 5p' : 'Sắp hết giờ'}
        </span>
        <span className="tabular-figures text-sm sm:text-base font-bold text-ink tracking-tight">
          {formatClockMMSS(remainingSeconds)}
        </span>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-label={`Thời gian còn lại ${formatClockMMSS(remainingSeconds)}`}
      className={`inline-flex items-center gap-2 bg-paper-sheet border border-rule-strong rounded-[3px] ${
        compact ? 'px-2.5 py-1.5 min-h-[36px]' : 'px-3 py-2'
      }`}
    >
      <IconClock size={14} className="text-ink-secondary shrink-0" />
      {!compact && (
        <span className="text-xs text-ink-secondary whitespace-nowrap">
          {label ?? 'Còn lại'}
        </span>
      )}
      <span className="tabular-figures text-sm sm:text-base font-bold text-ink tracking-tight">
        {formatClockMMSS(remainingSeconds)}
      </span>
    </div>
  )
}
