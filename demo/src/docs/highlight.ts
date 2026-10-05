/**
 * A small syntax highlighter for the code samples in the docs: pure, no
 * dependencies, and safe to run on the server (static pages) and in the browser
 * (snippets that change as you click). It is not a parser; it colours the
 * things you notice in a sample: comments, strings, keywords, components.
 */

export type CodeLang = 'tsx' | 'ts' | 'bash' | 'json' | 'text'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const KEYWORDS = 'import|from|export|default|const|let|var|function|return|async|await|new|type|interface|extends|if|else|for|of|in|as|true|false|null|undefined|void|typeof|class'

// One pass, left to right; the first alternative that matches wins.
const TS_PATTERN = new RegExp(
  [
    '(?<comment>//[^\\n]*|/\\*[\\s\\S]*?\\*/)',
    '(?<string>\'(?:\\\\.|[^\'\\\\\\n])*\'|"(?:\\\\.|[^"\\\\\\n])*"|`(?:\\\\.|[^`\\\\])*`)',
    '(?<tag></?[A-Z][A-Za-z0-9.]*)',
    `(?<keyword>\\b(?:${KEYWORDS})\\b)`,
    '(?<number>\\b\\d[\\d_]*(?:\\.\\d+)?\\b)',
    '(?<attr>\\b[a-zA-Z][\\w-]*(?==))',
    '(?<fn>\\b[A-Za-z_$][\\w$]*(?=\\())',
  ].join('|'),
  'g'
)

const BASH_PATTERN = /(?<comment>#[^\n]*)|(?<string>'[^']*'|"[^"]*")|(?<fn>\b(?:npm|pnpm|yarn|npx|cd|node|git)\b)|(?<keyword>(?<=\s)--?[a-zA-Z][\w-]*)/g

const JSON_PATTERN = /(?<string>"(?:\\.|[^"\\\n])*")(?<colon>\s*:)?|(?<number>-?\b\d+(?:\.\d+)?\b)|(?<keyword>\b(?:true|false|null)\b)/g

function paint(code: string, pattern: RegExp): string {
  let out = ''
  let last = 0
  pattern.lastIndex = 0
  for (const match of code.matchAll(pattern)) {
    const groups = match.groups ?? {}
    const kind = Object.keys(groups).find(name => groups[name] !== undefined && name !== 'colon')
    out += escapeHtml(code.slice(last, match.index))
    if (kind === 'string' && groups.colon !== undefined) {
      out += `<span class="tk-attr">${escapeHtml(groups.string)}</span>${escapeHtml(groups.colon)}`
    } else if (kind !== undefined) {
      out += `<span class="tk-${kind}">${escapeHtml(match[0])}</span>`
    } else {
      out += escapeHtml(match[0])
    }
    last = (match.index ?? 0) + match[0].length
  }
  return out + escapeHtml(code.slice(last))
}

/** HTML for `code`, with <span class="tk-…"> around the interesting parts. */
export function highlight(code: string, lang: CodeLang = 'tsx'): string {
  switch (lang) {
    case 'tsx':
    case 'ts': return paint(code, TS_PATTERN)
    case 'bash': return paint(code, BASH_PATTERN)
    case 'json': return paint(code, JSON_PATTERN)
    default: return escapeHtml(code)
  }
}
