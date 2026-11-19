import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Formulas written as $...$ must be rendered inside table captions, headers and cells, not shown as raw TeX.
// The real pool has a Science table with cells such as "$< 10\text{mg/L}$".
describe('formulas in tables', () => {
  let server
  let ContentBlocks
  before(async () => {
    server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom',
      server: { middlewareMode: true }, logLevel: 'silent' })
    ;({ ContentBlocks } = await server.ssrLoadModule('/src/content/ContentBlocks.tsx'))
  })
  after(() => server?.close())

  it('wraps every $...$ span of a table in a math element and leaves plain cells alone', () => {
    const block = { type: 'table', caption: 'Bảng 1: nồng độ $\\text{Pb}^{2+}$', headers: ['Yếu tố', '$\\text{pH}$'],
      rows: [['Nitrate', '$< 10\\text{mg/L}$'], ['Chì', '$0,01\\text{mg/L}$'], ['Sắt', '0,45']] }
    const html = renderToStaticMarkup(React.createElement(ContentBlocks, { blocks: [block], attemptId: 'a', apiVersion: 'v3' }))
    assert.equal((html.match(/content-math/g) ?? []).length, 4, 'caption, header and two cells each hold one formula')
    assert.doesNotMatch(html, /\$/, 'no raw dollar sign remains')
    assert.doesNotMatch(html, /\\text/, 'no raw TeX command remains')
    assert.match(html, /Nitrate/)
    assert.match(html, />0,45</)
  })
})
