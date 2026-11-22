/*
 * The About window (core): the README, embedded in index.html as
 * <script id="readme-source" type="text/x-readme">, rendered as HTML.
 * Opened by the About button in the top bar; Esc or a click outside closes it.
 */
function renderReadmeMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let html = ''
  let inList = false
  let listType = 'ul'
  let inCode = false
  let codeLang = ''
  let codeLines = []
  let paragraph = []
  const inline = (value) =>
    escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
      )
  const flushParagraph = () => {
    if (paragraph.length) {
      html += `<p>${inline(paragraph.join(' '))}</p>`
      paragraph = []
    }
  }
  const closeList = () => {
    if (inList) {
      html += `</${listType}>`
      inList = false
    }
  }
  lines.forEach((line) => {
    if (line.trim().startsWith('````')) return
    if (line.trim().startsWith('```')) {
      flushParagraph()
      closeList()
      if (inCode) {
        html += `${highlightCode(codeLines.join('\n'), codeLang)}</pre>`
        codeLines = []
      } else {
        codeLang = line.trim().slice(3).trim()
        html += '<pre>'
      }
      inCode = !inCode
      return
    }
    if (inCode) {
      codeLines.push(line)
      return
    }
    if (!line.trim()) {
      flushParagraph()
      closeList()
      return
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/)
    const bullet = line.match(/^\s*[*-]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/)
    const quote = line.match(/^\s*>\s?(.+)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      html += `<h${level}>${inline(heading[2])}</h${level}>`
    } else if (bullet || numbered) {
      flushParagraph()
      const nextListType = numbered ? 'ol' : 'ul'
      if (inList && listType !== nextListType) closeList()
      if (!inList) {
        listType = nextListType
        html += `<${listType}>`
        inList = true
      }
      html += `<li>${inline((bullet || numbered)[1])}</li>`
    } else if (quote) {
      flushParagraph()
      closeList()
      html += `<blockquote>${inline(quote[1])}</blockquote>`
    } else {
      paragraph.push(line.trim())
    }
  })
  flushParagraph()
  closeList()
  if (inCode) html += `${highlightCode(codeLines.join('\n'), codeLang)}</pre>`
  return html
}

// The README text is embedded in index.html (see tools/embed-readme.js), so it
// shows even when the page is opened straight from disk. If it is missing, the
// README.md file is fetched instead.
async function openReadme() {
  const modal = document.getElementById('readme-modal')
  const content = document.getElementById('readme-content')
  modal.classList.add('open')
  const embedded = document.getElementById('readme-source')
  if (embedded && embedded.textContent.trim()) {
    content.innerHTML = renderReadmeMarkdown(embedded.textContent)
    return
  }
  content.innerHTML = `<p class="readme-loading">Loading README…</p>`
  try {
    const response = await fetch('README.md')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    content.innerHTML = renderReadmeMarkdown(await response.text())
  } catch {
    content.innerHTML = `<p>README.md could not be loaded in this browser context.</p><p><a href="README.md" target="_blank" rel="noreferrer">Open README.md separately</a> or run the Spell Book through a local web server.</p>`
  }
}

function closeReadme() {
  document.getElementById('readme-modal').classList.remove('open')
}

document.getElementById('btn-readme').addEventListener('click', openReadme)
document.getElementById('btn-readme-close').addEventListener('click', closeReadme)
document.getElementById('readme-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('readme-modal')) closeReadme()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeReadme()
})
