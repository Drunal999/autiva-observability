/**
 * Minimal, deliberately incomplete Markdown.
 *
 * Comment bodies are untrusted: a body may have arrived from a customer email
 * or a scraped page, which makes it attacker-controllable. So this parser
 * produces a TOKEN TREE, never an HTML string — the renderer emits React
 * elements from it, and `dangerouslySetInnerHTML` is never reached for.
 *
 * What is supported is the small set people actually use in an ops thread:
 * `code`, **bold**, _italic_, @mentions, and bare URLs. Everything else,
 * including raw HTML, is left as literal text. Under-supporting Markdown is a
 * feature here; a richer parser is a larger attack surface for no real gain.
 */

export type Token =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'mention'; value: string }
  | { kind: 'link'; value: string; href: string }

/** Only these schemes become links. `javascript:` and `data:` never do. */
const SAFE_SCHEME = /^https?:\/\//i

const PATTERN = new RegExp(
  [
    '`([^`\\n]+)`', // code
    '\\*\\*([^*\\n]+)\\*\\*', // bold
    '_([^_\\n]+)_', // italic
    // A mention must start a word. Without the boundary, the domain in an
    // email address parses as a handle and notifies someone never mentioned.
    '(?:^|(?<=\\s))@([a-zA-Z0-9._-]{2,40})',
    '(https?:\\/\\/[^\\s<>"\'`]+)', // bare url
  ].join('|'),
  'g'
)

export function parseCommentBody(body: string): Token[] {
  const tokens: Token[] = []
  let lastIndex = 0

  const matches: RegExpExecArray[] = []
  let hit: RegExpExecArray | null
  PATTERN.lastIndex = 0
  while ((hit = PATTERN.exec(body)) !== null) matches.push(hit)

  for (const m of matches) {
    const index = m.index ?? 0
    if (index > lastIndex) {
      tokens.push({ kind: 'text', value: body.slice(lastIndex, index) })
    }

    const [, code, bold, italic, mention, url] = m
    if (code !== undefined) tokens.push({ kind: 'code', value: code })
    else if (bold !== undefined) tokens.push({ kind: 'bold', value: bold })
    else if (italic !== undefined) tokens.push({ kind: 'italic', value: italic })
    else if (mention !== undefined) tokens.push({ kind: 'mention', value: mention })
    else if (url !== undefined) {
      // Belt and braces: the pattern already requires http(s), but a scheme
      // check here means a looser pattern later cannot silently create a
      // javascript: link.
      if (SAFE_SCHEME.test(url)) tokens.push({ kind: 'link', value: url, href: url })
      else tokens.push({ kind: 'text', value: url })
    }

    lastIndex = index + m[0].length
  }

  if (lastIndex < body.length) {
    tokens.push({ kind: 'text', value: body.slice(lastIndex) })
  }
  return tokens
}

/** @handles referenced in a body, for resolving mentions at write time. */
export function extractMentions(body: string): string[] {
  const re = /(?:^|(?<=\s))@([a-zA-Z0-9._-]{2,40})/g
  const out: string[] = []
  let hit: RegExpExecArray | null
  while ((hit = re.exec(body)) !== null) {
    if (!out.includes(hit[1])) out.push(hit[1])
  }
  return out
}

export const MAX_COMMENT_LENGTH = 2000
