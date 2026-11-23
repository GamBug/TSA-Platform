import React, { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { ContentBlock } from '@/api/types'
import { IconExpand } from '@/components/Icons'

// Question text is never parsed as HTML. Formulas are explicit math blocks or $...$ spans and render with KaTeX in
// strict mode: KaTeX's own HTML and fonts for the eye, so primes, hats, arrows and angle marks look the same on every
// device instead of depending on the browser's MathML fonts, plus MathML for screen readers. On any parser error the
// accessible text or TeX source is shown.

/**
 * Display-only clean-ups of how the stored TeX is written; the stored content is never changed. Pure.
 * - A bare `f\prime(x)` is drawn as a superscript prime, the same as `f'(x)`, not a full-height mark.
 * - `\vec{AB}` over two or more letters gets an arrow as wide as the letters, as Vietnamese textbooks print vectors.
 */
export function displayTex(tex: string): string {
  return tex
    .replace(/(?<=[A-Za-z0-9)\]])(?<!\\prime)(?:\\prime(?![A-Za-z]))+/g, (run) => "'".repeat(run.length / 6))
    .replace(/\\vec\s*\{([^{}]{2,})\}/g, '\\overrightarrow{$1}')
}

function MathSpan({ tex, display = false, inline = false, accessibleText }: { tex: string; display?: boolean; inline?: boolean; accessibleText?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    try {
      katex.render(displayTex(tex || ''), node, {
        output: 'htmlAndMathml', displayMode: display, throwOnError: true, trust: false, strict: 'error',
        maxSize: 10, maxExpand: 500, macros: Object.create(null),
      })
      setFailed(false)
    } catch {
      node.textContent = ''
      setFailed(true)
    }
  }, [tex, display])
  const Tag = inline ? 'span' : 'div'
  return (
    <Tag className={`content-math ${display ? 'block text-center my-3 overflow-x-auto' : inline ? 'inline' : 'block my-2 overflow-x-auto'}`}>
      {accessibleText && <span className="sr-only">{accessibleText}</span>}
      <span ref={ref} aria-hidden={accessibleText ? true : undefined} />
      {failed && <span>{accessibleText || tex || 'Biểu thức chưa hiển thị được.'}</span>}
    </Tag>
  )
}

/** A caption as plain words for an accessible name: no dollar signs, and \text{...} reduced to its text. */
const plainCaption = (text: string) => text.replace(/\\text\{([^}]*)\}/g, '$1').replace(/[$\\{}]/g, '')

const INLINE_MATH = /\$(?=\S)([^$]+?)(?<=\S)\$/gu

// A point name written outside $...$, such as "ABCD.A'B'C'D'", uses a typewriter apostrophe that is almost invisible
// next to a capital letter. A word of capital letters (and digits, joined by dots) that carries a prime is typeset as a
// formula, as textbooks print point names, so its primes look like the ones inside $...$. "I'm" is left alone: a
// lowercase letter right after the apostrophe makes it a word, not a point name.
const POINT_NAME = /(?<![\p{L}\p{N}'])[A-Z][A-Z0-9']*(?:\.[A-Z][A-Z0-9']*)*(?![\p{L}\p{N}])/gu

function TextWithPointNames({ text, start }: { text: string; start: number }) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(POINT_NAME)) {
    if (!match[0].includes("'")) continue
    if (match.index! > cursor) parts.push(text.slice(cursor, match.index))
    parts.push(<MathSpan key={`p${start + match.index!}`} tex={match[0]} inline />)
    cursor = match.index! + match[0].length
  }
  if (cursor === 0) return <>{text}</>
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

export function TextWithMath({ text }: { text: string }) {
  const source = String(text ?? '')
  const parts: React.ReactNode[] = []
  let cursor = 0
  let key = 0
  for (const match of source.matchAll(INLINE_MATH)) {
    if (match.index! > cursor) parts.push(<TextWithPointNames key={key++} text={source.slice(cursor, match.index)} start={cursor} />)
    parts.push(<MathSpan key={key++} tex={match[1]} inline />)
    cursor = match.index! + match[0].length
  }
  if (cursor < source.length) parts.push(<TextWithPointNames key={key++} text={source.slice(cursor)} start={cursor} />)
  return <>{parts}</>
}

export function QuestionImage({ block, attemptId, apiVersion, purpose = 'question', imageSource }: {
  block: Extract<ContentBlock, { type: 'image' }>; attemptId: string; apiVersion: string; purpose?: 'question' | 'explanation'
  imageSource?: (assetVersionId: string) => string
}) {
  const [loaded, setLoaded] = useState(false)
  const [broken, setBroken] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  // Images use only the owned-attempt asset route, never source URLs or paths.
  // The admin page passes its own same-origin image route instead.
  const url = !uuid.test(block.assetVersionId) ? null : imageSource ? imageSource(block.assetVersionId)
    : uuid.test(attemptId) ? `/api/${apiVersion}/attempts/${attemptId}/assets/${block.assetVersionId}?purpose=${purpose}` : null
  return (
    <figure className="my-5 border border-rule-strong bg-paper-sheet rounded-[3px]" data-testid="question-image">
      {url && !broken && (
        <button type="button" disabled={!loaded} onClick={() => dialog.current?.showModal()}
          aria-label={`Phóng to hình: ${block.alt}`} aria-haspopup="dialog"
          className="block w-full min-h-[44px] p-3 cursor-zoom-in disabled:cursor-default text-left">
          <img src={url} alt={block.alt} loading="lazy" decoding="async" className="max-w-full h-auto mx-auto"
            onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />
          {loaded && <span className="mt-2 flex items-center justify-end gap-1.5 text-xs font-semibold text-ink-secondary"><IconExpand size={13} /> Phóng to</span>}
        </button>
      )}
      {(!url || broken || !loaded) && <p className="px-3 py-2 text-sm text-ink-secondary">{block.alt || 'Hình minh họa chưa khả dụng.'}</p>}
      {block.caption && <figcaption className="border-t border-rule px-3 py-2 text-xs text-ink-secondary">{block.caption}</figcaption>}
      {url && (
        <dialog ref={dialog} aria-label={`Hình phóng to: ${block.alt}`}
          className="m-auto max-w-[96vw] max-h-[94dvh] p-4 bg-paper-sheet border border-ink rounded-[4px] backdrop:bg-ink/60">
          <img src={url} alt={block.alt} className="max-h-[80dvh] mx-auto" />
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => dialog.current?.close()} autoFocus
              className="px-4 min-h-[44px] text-sm font-semibold bg-paper-sheet border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer">Đóng hình</button>
          </div>
        </dialog>
      )}
    </figure>
  )
}

export function ContentBlocks({ blocks, attemptId, apiVersion, purpose = 'question', className = '', imageSource }: {
  blocks: ContentBlock[] | undefined | null; attemptId: string; apiVersion: string; purpose?: 'question' | 'explanation'; className?: string
  imageSource?: (assetVersionId: string) => string
}) {
  return (
    <div className={`min-w-0 [overflow-wrap:anywhere] ${className}`}>
      {(blocks ?? []).map((block, index) => {
        if (block.type === 'text') return <p key={index} className="whitespace-pre-wrap mb-3 last:mb-0"><TextWithMath text={block.text ?? ''} /></p>
        if (block.type === 'math') return <MathSpan key={index} tex={block.tex} display={block.display} accessibleText={block.accessibleText} />
        if (block.type === 'table') {
          return (
            <div key={index} tabIndex={0} role="region" aria-label={plainCaption(block.caption ?? '') || 'Bảng dữ liệu câu hỏi'}
              className="my-4 max-w-full overflow-x-auto border border-rule-strong rounded-[3px]">
              <table className="w-full border-collapse text-sm text-left">
                {block.caption && <caption className="px-3 py-2 text-left font-semibold bg-paper-recessed"><TextWithMath text={block.caption} /></caption>}
                <thead><tr>{(block.headers ?? []).map((value, column) => <th key={column} scope="col" className="px-3 py-2 bg-paper-recessed border-t border-rule"><TextWithMath text={value} /></th>)}</tr></thead>
                <tbody>{(block.rows ?? []).map((row, rowIndex) => (
                  <tr key={rowIndex} className="even:bg-paper">{row.map((value, column) => <td key={column} className="px-3 py-2 border-t border-rule min-w-[4em]"><TextWithMath text={value} /></td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'image') return <QuestionImage key={index} block={block} attemptId={attemptId} apiVersion={apiVersion} purpose={purpose} imageSource={imageSource} />
        return null
      })}
    </div>
  )
}

export function plainText(blocks: ContentBlock[] | undefined): string {
  return (blocks ?? []).map((block) => block.type === 'text' ? block.text : block.type === 'math' ? (block.accessibleText || block.tex) : '').join(' ').trim()
}
