import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import katex from 'katex'

// Primes, angle marks and vectors must stay legible: formulas are drawn with KaTeX's own HTML and fonts, a bare
// \prime is drawn as a superscript prime, a vector over several letters gets a full-width arrow, and a point name with
// primes written outside $...$ ("ABCD.A'B'C'D'") is typeset as a formula instead of showing faint apostrophes.
describe('math notation', () => {
  let server, displayTex, TextWithMath
  before(async () => {
    server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom',
      server: { middlewareMode: true }, logLevel: 'silent' })
    ;({ displayTex, TextWithMath } = await server.ssrLoadModule('/src/content/ContentBlocks.tsx'))
  })
  after(() => server?.close())

  it('draws a bare \\prime like an apostrophe prime and leaves superscript primes alone', () => {
    assert.equal(displayTex('f\\prime(x)'), "f'(x)")
    assert.equal(displayTex('(\\sin x)\\prime=\\cos x'), "(\\sin x)'=\\cos x")
    assert.equal(displayTex('f\\prime\\prime(x)'), "f''(x)")
    assert.equal(displayTex('g^{\\prime}(x)'), 'g^{\\prime}(x)')
    assert.equal(displayTex('g^{\\prime\\prime}(x)'), 'g^{\\prime\\prime}(x)')
  })

  it('widens the arrow of a vector over several letters only', () => {
    assert.equal(displayTex('\\vec{AB}+\\vec{u}'), '\\overrightarrow{AB}+\\vec{u}')
    assert.equal(displayTex('\\vec {MN}'), '\\overrightarrow{MN}')
  })

  it('keeps every rewritten formula valid for KaTeX in strict mode', () => {
    for (const tex of ["f\\prime(x)", "\\vec{AB}", "\\widehat{BAC}=\\angle MSP", "ABCD.A'B'C'D'", "B'(-1;1;-3)"]) {
      assert.doesNotThrow(() => katex.renderToString(displayTex(tex), { output: 'htmlAndMathml', strict: 'error', throwOnError: true }), tex)
    }
  })

  it('typesets point names with primes written outside $...$ and leaves words alone', () => {
    const render = (text) => renderToStaticMarkup(React.createElement(TextWithMath, { text }))
    const cube = render("Hình lập phương ABCD.A'B'C'D' có cạnh $a$.")
    assert.equal((cube.match(/content-math/g) ?? []).length, 2, 'the point name and $a$ are formulas')
    assert.doesNotMatch(cube, /A'B'/, 'no raw apostrophes remain in the text')
    assert.match(cube, /^Hình lập phương /)
    assert.match(cube, / có cạnh /)
    for (const text of ["I'm here", 'ABCD là hình vuông', "Đáp án: C"]) assert.doesNotMatch(render(text), /content-math/, text)
  })
})
