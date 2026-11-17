import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const output = new URL('../dist/', import.meta.url)

describe('student app build output', () => {
  it('makes no runtime request to a third-party origin', async () => {
    const files = ['index.html', ...(await readdir(new URL('assets/', output))).map((name) => `assets/${name}`)]
    const textFiles = files.filter((name) => /\.(html|js|css)$/.test(name))
    assert.ok(textFiles.some((name) => name.endsWith('.js')), 'build contains a script bundle')
    for (const name of textFiles) {
      const text = await readFile(new URL(name, output), 'utf8')
      // Only SVG namespace identifiers, React's error-decoder text and Tailwind's license banner comment may
      // contain absolute URLs; none of them is fetched.
      const allowed = ['http://www.w3.org', 'https://react.dev', 'https://tailwindcss.com']
      const origins = [...text.matchAll(/https?:\/\/[a-zA-Z0-9.-]+/g)].map((match) => match[0])
      const unexpected = origins.filter((origin) => !allowed.includes(origin))
      assert.deepEqual([...new Set(unexpected)], [], `${name} references a third-party origin`)
      assert.doesNotMatch(text, /fonts\.googleapis|googletagmanager|gstatic/, name)
    }
  })

  it('serves assets under the /student/ base path', async () => {
    const html = await readFile(new URL('index.html', output), 'utf8')
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (match[1].startsWith('data:')) continue
      assert.match(match[1], /^\/student\/assets\//, match[1])
    }
  })
})
