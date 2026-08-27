import { describe, it, expect } from 'vitest'
import { parseCommentBody, extractMentions } from '../safeMarkdown'

const kinds = (body: string) => parseCommentBody(body).map((t) => t.kind)
const linkHrefs = (body: string) =>
  parseCommentBody(body).flatMap((t) => (t.kind === 'link' ? [t.href] : []))

describe('safeMarkdown — hostile input', () => {
  it('treats raw HTML as literal text, never as markup', () => {
    const tokens = parseCommentBody('<script>alert(1)</script>')
    expect(tokens).toEqual([{ kind: 'text', value: '<script>alert(1)</script>' }])
  })

  it('treats an img onerror payload as text', () => {
    const body = '<img src=x onerror="alert(1)">'
    expect(kinds(body)).toEqual(['text'])
    expect(parseCommentBody(body)[0]).toMatchObject({ value: body })
  })

  it('never produces a javascript: link', () => {
    expect(linkHrefs('javascript:alert(1)')).toEqual([])
    expect(kinds('javascript:alert(1)')).toEqual(['text'])
  })

  it('never produces a data: link', () => {
    expect(linkHrefs('data:text/html;base64,PHNjcmlwdD4=')).toEqual([])
  })

  it('only linkifies http and https', () => {
    expect(linkHrefs('see https://example.com/x')).toEqual(['https://example.com/x'])
    expect(linkHrefs('see http://example.com')).toEqual(['http://example.com'])
    expect(linkHrefs('see ftp://example.com')).toEqual([])
  })

  it('does not let markdown syntax smuggle a link target', () => {
    // Link syntax is not supported at all, so the whole thing stays text.
    const body = '[click](javascript:alert(1))'
    expect(linkHrefs(body)).toEqual([])
  })
})

describe('safeMarkdown — supported formatting', () => {
  it('parses code, bold, italic and mentions', () => {
    expect(kinds('`x` **b** _i_ @dev')).toEqual([
      'code', 'text', 'bold', 'text', 'italic', 'text', 'mention',
    ])
  })

  it('preserves surrounding text exactly', () => {
    const tokens = parseCommentBody('before `code` after')
    expect(tokens[0]).toEqual({ kind: 'text', value: 'before ' })
    expect(tokens[1]).toEqual({ kind: 'code', value: 'code' })
    expect(tokens[2]).toEqual({ kind: 'text', value: ' after' })
  })

  it('round-trips a body with no special syntax unchanged', () => {
    const plain = 'the cron skipped tasks with a null dueDate'
    expect(parseCommentBody(plain)).toEqual([{ kind: 'text', value: plain }])
  })

  it('is reusable — the global regex does not carry lastIndex between calls', () => {
    const body = '@dev look at `this`'
    expect(kinds(body)).toEqual(kinds(body))
  })
})

describe('extractMentions', () => {
  it('finds handles and de-duplicates them', () => {
    expect(extractMentions('@dev and @dev and @ana')).toEqual(['dev', 'ana'])
  })

  it('returns nothing when there are no mentions', () => {
    expect(extractMentions('no handles here')).toEqual([])
  })

  it('does not treat an email domain as a mention', () => {
    // A mention has to start a word, otherwise every email address in a thread
    // would notify a user who was never mentioned.
    expect(extractMentions('mail me at someone@example.com')).toEqual([])
    expect(parseCommentBody('mail someone@example.com').map((t) => t.kind)).toEqual(['text'])
  })

  it('still finds a mention at the start of a line or after a space', () => {
    expect(extractMentions('@dev take a look')).toEqual(['dev'])
    expect(extractMentions('cc @ana please')).toEqual(['ana'])
  })
})
