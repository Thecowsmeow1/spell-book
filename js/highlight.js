// ─── Syntax highlighting for code blocks ──────────────────────────────
// A small built-in highlighter (no libraries). It wraps comments, strings,
// variables, keywords, commands, flags, numbers and <placeholders> in
// <span class="tok-..."> elements; the colors come from the code block theme in
// styles.css (--tok-* variables).

const codeEscape = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const KEYWORDS = {
  powershell:
    'if|else|elseif|foreach|for|while|do|until|switch|function|filter|param|return|try|catch|finally|throw|break|continue|in|begin|process|end|exit|trap|class|enum|using|not|and|or|eq|ne|gt|ge|lt|le|like|match|contains',
  bash: 'if|then|else|elif|fi|for|while|until|do|done|case|esac|function|in|select|time|return|exit|break|continue|export|local|readonly|source|alias|unset|set|shift|trap',
  batch:
    'if|else|for|in|do|goto|call|set|setlocal|endlocal|echo|exit|not|exist|defined|equ|neq|lss|leq|gtr|geq|pause|shift|start|rem',
  python:
    'def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|lambda|pass|in|not|and|or|is|None|True|False|raise|yield|global|nonlocal|assert|break|continue|del|async|await',
  sql: 'select|from|where|and|or|not|insert|into|values|update|set|delete|create|table|drop|alter|join|left|right|inner|outer|on|group|by|order|having|limit|as|distinct|union|null|is|in|like|between|exists|case|when|then|else|end|count|sum|avg|min|max',
  generic: 'if|then|else|elif|fi|for|while|do|done|in|function|return',
}

// Each rule: [token class, regex source]. Earlier rules win at the same spot.
// Sources use only non-capturing groups.
function codeRules(language, template) {
  const rules = []
  const add = (name, source) => rules.push([name, source])
  const placeholder = '<[^<>\\n]+>'

  if (language === 'powershell') {
    add('comment', '<#[\\s\\S]*?#>|#[^\\n]*')
  } else if (language === 'batch') {
    add('comment', '^[ \\t]*(?:rem\\b|::)[^\\n]*')
  } else if (language === 'sql') {
    add('comment', '--[^\\n]*|/\\*[\\s\\S]*?\\*/')
  } else if (language === 'python') {
    add('comment', '#[^\\n]*')
  } else {
    add('comment', '(?:^|(?<=\\s))#[^\\n]*')
  }

  if (template) add('placeholder', placeholder)

  if (language === 'python') {
    add('string', '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'')
  }
  if (language === 'powershell') {
    add('string', "\"(?:`.|[^\"`\\n])*(?:\"|$)|'(?:''|[^'\\n])*(?:'|$)")
  } else if (language === 'sql') {
    add('string', "'(?:''|[^'\\n])*(?:'|$)|\"[^\"\\n]*(?:\"|$)")
  } else {
    add(
      'string',
      '"(?:\\\\.|[^"\\\\\\n])*(?:"|$)|\'(?:\\\\.|[^\'\\\\\\n])*(?:\'|$)',
    )
  }

  if (language === 'powershell') {
    add('variable', '\\$(?:\\{[^}\\n]*\\}|[\\w:?]+)')
  } else if (language === 'batch') {
    add('variable', '%%[A-Za-z]|%[\\w~:*-]+%|%[0-9*]|![\\w]+!')
  } else if (language !== 'python' && language !== 'sql') {
    add(
      'variable',
      '\\$(?:\\{[^}\\n]*\\}|[A-Za-z_]\\w*|[0-9@#?*$!-])|%[\\w~:*-]+%',
    )
  }

  if (language === 'python') add('function', '@\\w[\\w.]*')
  add('keyword', `\\b(?:${KEYWORDS[language] || KEYWORDS.generic})\\b`)
  if (language === 'powershell') {
    add('function', '\\b[A-Za-z]+-[A-Za-z]+\\b')
  }
  add('number', '\\b\\d+(?:\\.\\d+)*\\b')
  if (language === 'batch') {
    add('flag', '(?<=\\s)/[A-Za-z?][\\w-]*')
  }
  if (language !== 'sql' && language !== 'python') {
    add('flag', '(?<![\\w-])--?[A-Za-z][\\w-]*')
  }
  if (language === 'bash' || language === 'batch' || language === 'generic') {
    // The command at the start of a line or after a pipe, ;, or &.
    add('function', '(?<=^[ \\t]*|[|;&]\\s*)[A-Za-z_./~][\\w./~-]*')
  }
  add(
    'operator',
    template ? '\\|\\|?|&&?|>>?|;|[\\[\\]]' : '\\|\\|?|&&?|>>?|<|;|[=!]=',
  )
  return rules
}

const codeRegexCache = new Map()

function compiledCodeRules(language, template) {
  const key = `${language}|${template}`
  if (!codeRegexCache.has(key)) {
    const rules = codeRules(language, template)
    const caseInsensitive = ['powershell', 'batch', 'sql'].includes(language)
    codeRegexCache.set(key, {
      names: rules.map(([name]) => name),
      regex: new RegExp(
        rules.map(([, source]) => `(${source})`).join('|'),
        caseInsensitive ? 'gmi' : 'gm',
      ),
    })
  }
  return codeRegexCache.get(key)
}

// Maps a platform, script language or fence label to a highlighter language.
function codeLanguageFor(name) {
  const value = String(name || '').toLowerCase()
  if (/power\s?shell|^ps1?$|^pwsh$/.test(value)) return 'powershell'
  if (/^(bash|sh|shell|zsh|console)$/.test(value)) return 'bash'
  if (/^(cmd|batch|bat)$/.test(value)) return 'batch'
  if (/^(py|python)/.test(value)) return 'python'
  if (value === 'sql') return 'sql'
  return 'generic'
}

// Returns safe HTML for `text`. `template: true` also colors <placeholders>
// and [optional] brackets in command templates.
function highlightCode(text, languageName, { template = false } = {}) {
  const source = String(text)
  const language = codeLanguageFor(languageName)
  const { names, regex } = compiledCodeRules(language, template)
  regex.lastIndex = 0
  let html = ''
  let last = 0
  let match
  while ((match = regex.exec(source)) !== null) {
    if (match[0] === '') {
      regex.lastIndex += 1
      continue
    }
    const group = match.findIndex((value, i) => i > 0 && value !== undefined)
    html += codeEscape(source.slice(last, match.index))
    html += `<span class="tok-${names[group - 1]}">${codeEscape(match[0])}</span>`
    last = match.index + match[0].length
  }
  return html + codeEscape(source.slice(last))
}
