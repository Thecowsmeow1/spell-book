/*
 * Environment variable chips in Compendium notes.
 *
 *   - Insert Variable (or Alt+V) opens a small box at the cursor, shaped like
 *     a chip. Typing filters the note's variables (from the Environment
 *     variables panel, sealed-tomes.js). Tab or a click puts in the top
 *     (or highlighted) one; Enter puts in the one with exactly that name, or
 *     makes a new variable with it. Arrow keys move the highlight, Escape
 *     closes the box. Text selected beforehand starts the search.
 *   - A chip shows the variable's value, else its default value, else its
 *     name (in italics). Changing a value in the panel changes every chip.
 *   - Hovering a chip shows the variable's name, and its Component, Default
 *     value and Description where those are filled in.
 *
 * The note stores which variable a chip is (notes.js varShell), never a
 * name to search for, so nothing written in a note becomes a variable by
 * accident. In code blocks a variable is its name between two invisible
 * characters (see "Variables in code blocks"). Chips can't go in cards,
 * template fields or sealed notes. Loaded after sealed-tomes.js (window.NoteEnv). Styles:
 * note-vars.css.
 */
;(() => {
  const api = window.NotesEditor
  const env = window.NoteEnv
  if (!api || !env || !api.insertVariable) return
  const editor = api.editor
  const openNodeId = () => {
    const node = api.selectedNode()
    return node ? node.id : null
  }

  // ─── Variables in code blocks ───────────────────────────────────────
  // A code block is plain text, so a variable there is its name between two
  // invisible characters nobody types: U+2062 before and U+2063 after. Only
  // text between them is a variable, never a name written on its own, so no
  // code syntax can be mistaken for one. The colored view draws each as a
  // chip: with its value, or with its name in the block being typed in (where
  // the view has to line up with the text). The two characters take no room.
  // Copy (the button, Ctrl+C, Ctrl+X) gives the values; pasting back into a
  // code block in Spell Book brings the variables back.
  const OPEN = '\u2062'
  const CLOSE = '\u2063'
  const TOKEN = /\u2062([^\u2062\u2063\n]*)\u2063/g
  const CODE_MARKS = { open: OPEN, close: CLOSE, split: /(\u2062[^\u2062\u2063\n]*\u2063)/ }
  const RAW_TYPE = 'text/x-spellbook-code'
  const escapeHtml = (value) =>
    String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // Whose variables: a Sealed Notes note says so (data-env-node), else the open note.
  const nodeOf = (el) => {
    const holder = el && el.closest && el.closest('[data-env-node]')
    return holder ? holder.dataset.envNode : openNodeId()
  }
  const shownValue = (variable, name) => (variable ? variable.current || variable.name || name : name)

  // Colored HTML for a code block's text, with its variables as chips.
  function codeHtml(text, lang, showValues, nodeId = openNodeId()) {
    const source = String(text)
    const count = (source.match(TOKEN) || []).length
    if (!count) return highlightCode(source, lang)
    // Each variable becomes one private-use character the highlighter leaves
    // alone (from a range the text doesn't already use), then a chip.
    let base = 0xe000
    const clashes = () => [...source].some((ch) => ch.charCodeAt(0) >= base && ch.charCodeAt(0) < base + count)
    while (clashes() && base + 2 * count < 0xf8ff) base += count
    const names = []
    const plain = source.replace(TOKEN, (whole, name) => {
      names.push(name)
      return String.fromCharCode(base + names.length - 1)
    })
    const vars = env.variables(nodeId)
    const slots = new RegExp(`[${String.fromCharCode(base)}-${String.fromCharCode(base + names.length - 1)}]`, 'g')
    return highlightCode(plain, lang).replace(slots, (ch) => {
      const name = names[ch.charCodeAt(0) - base]
      const variable = vars.find((v) => v.name === name) || null
      const classes = ['note-var', 'code-var']
      if (variable && variable.current) classes.push('has-value')
      if (!variable) classes.push('missing')
      if (showValues) classes.push('shows-value')
      const inner = showValues ? escapeHtml(shownValue(variable, name)) : OPEN + escapeHtml(name) + CLOSE
      return `<span class="${classes.join(' ')}" data-var-name="${escapeHtml(name)}">${inner}</span>`
    })
  }

  // The text with each variable replaced by what its chip shows.
  function codeValues(text, nodeId = openNodeId()) {
    const vars = env.variables(nodeId)
    return String(text)
      .replace(TOKEN, (whole, name) => shownValue(vars.find((v) => v.name === name), name))
      .replace(/[\u2062\u2063]/g, '')
  }

  const tokensIn = (value) => [...value.matchAll(TOKEN)].map((m) => ({ start: m.index, end: m.index + m[0].length }))
  const isCode = (el) => Boolean(el && el.matches && el.matches('.note-code-input'))

  // A variable is one piece: Backspace and Delete take all of it, the arrow
  // keys step over it, and the caret or a selection never stops inside one.
  document.addEventListener(
    'keydown',
    (e) => {
      const area = e.target
      if (!isCode(area) || area.readOnly || e.ctrlKey || e.altKey || e.metaKey) return
      const { selectionStart: at, selectionEnd: end } = area
      if (at !== end) return
      const tokens = tokensIn(area.value)
      const before = tokens.find((t) => t.start < at && at <= t.end)
      const after = tokens.find((t) => t.start <= at && at < t.end)
      if (e.key === 'Backspace' && before) {
        e.preventDefault()
        area.setSelectionRange(before.start, before.end)
        document.execCommand('delete')
      } else if (e.key === 'Delete' && after) {
        e.preventDefault()
        area.setSelectionRange(after.start, after.end)
        document.execCommand('delete')
      } else if (e.key === 'ArrowLeft' && !e.shiftKey && before) {
        e.preventDefault()
        area.setSelectionRange(before.start, before.start)
      } else if (e.key === 'ArrowRight' && !e.shiftKey && after) {
        e.preventDefault()
        area.setSelectionRange(after.end, after.end)
      }
    },
    true,
  )
  function snap(area) {
    const tokens = tokensIn(area.value)
    if (!tokens.length) return
    const { selectionStart: start, selectionEnd: end } = area
    const inside = (p) => tokens.find((t) => t.start < p && p < t.end)
    if (start === end) {
      const t = inside(start)
      if (t) {
        const p = start - t.start < t.end - start ? t.start : t.end
        area.setSelectionRange(p, p)
      }
      return
    }
    const a = inside(start)
    const b = inside(end)
    if (a || b) area.setSelectionRange(a ? a.start : start, b ? b.end : end, area.selectionDirection)
  }
  ;['mouseup', 'keyup', 'select'].forEach((type) =>
    document.addEventListener(type, (e) => isCode(e.target) && snap(e.target), true),
  )
  // A half-deleted variable (one of its two characters gone) is just text.
  document.addEventListener(
    'input',
    (e) => {
      const area = e.target
      if (!isCode(area) || !/[\u2062\u2063]/.test(area.value.replace(TOKEN, ''))) return
      const value = area.value
      const caret = area.selectionStart
      const fixed = value
        .split(CODE_MARKS.split)
        .map((part, i) => (i % 2 ? part : part.replace(/[\u2062\u2063]/g, '')))
        .join('')
      area.value = fixed
      const p = Math.max(0, caret - (value.slice(0, caret).length - fixed.slice(0, caret).length))
      area.setSelectionRange(p, p)
    },
    true,
  )
  function copyOrCut(e) {
    const area = e.target
    if (!isCode(area)) return
    const raw = area.value.slice(area.selectionStart, area.selectionEnd)
    if (!/[\u2062\u2063]/.test(raw)) return
    e.preventDefault()
    e.stopPropagation()
    e.clipboardData.setData('text/plain', codeValues(raw))
    e.clipboardData.setData(RAW_TYPE, raw)
    if (e.type === 'cut' && !area.readOnly) document.execCommand('delete')
  }
  document.addEventListener('copy', copyOrCut, true)
  document.addEventListener('cut', copyOrCut, true)
  document.addEventListener(
    'paste',
    (e) => {
      const area = e.target
      if (!isCode(area) || area.readOnly) return
      const raw = e.clipboardData && e.clipboardData.getData(RAW_TYPE)
      if (!raw) return
      e.preventDefault()
      e.stopPropagation()
      document.execCommand('insertText', false, raw)
    },
    true,
  )

  // A renamed variable keeps its place in the open note's code blocks.
  function renameInCode(from, to) {
    if (from === to) return
    const old = OPEN + from + CLOSE
    let any = false
    api.codeBlocksIn(editor).forEach((block) => {
      const area = block.querySelector('.note-code-input')
      if (!area.value.includes(old)) return
      area.value = area.value.split(old).join(OPEN + to.replace(/[\u2062\u2063\n]/g, '') + CLOSE)
      any = true
    })
    if (any) api.markDirty()
  }
  const redrawCode = () => api.codeBlocksIn(editor).forEach(api.renderCodeView)

  // Where the caret is in a code block: the same spot in its colored view,
  // which shows names (as in the text) while the block is typed in.
  function codeCaretRect(area) {
    const code = area.closest('pre.note-code').querySelector('.note-code-view code')
    let left = area.selectionStart
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (left <= node.data.length) {
        const r = document.createRange()
        r.setStart(node, left)
        r.collapse(true)
        let rect = r.getClientRects()[0]
        if (!rect && left < node.data.length) {
          r.setEnd(node, left + 1)
          rect = r.getClientRects()[0]
        }
        if (rect) return rect
        break
      }
      left -= node.data.length
    }
    return area.getBoundingClientRect()
  }

  // ─── Chips ──────────────────────────────────────────────────────────
  const chipInfo = new WeakMap() // chip → its variable (null when gone)

  // Draws the chips under root with the values of nodeId's variables (the
  // open note's by default).
  function draw(root, nodeId = openNodeId()) {
    const vars = env.variables(nodeId)
    let renamed = false
    api.varChipsIn(root).forEach((chip) => {
      chip.setAttribute('contenteditable', 'false')
      const variable = vars.find((v) => v.id === chip.dataset.varId) || null
      if (variable && variable.name && chip.dataset.varName !== variable.name) {
        chip.dataset.varName = variable.name
        renamed = true
      }
      const name = chip.dataset.varName || '?'
      chip.textContent = variable ? variable.current || variable.name || name : name
      chip.classList.toggle('has-value', Boolean(variable && variable.current))
      chip.classList.toggle('missing', !variable)
      chip.removeAttribute('title')
      chipInfo.set(chip, variable)
    })
    return renamed
  }

  env.onChange((info) => {
    if (info && info.rename) renameInCode(...info.rename)
    // A renamed variable changes the name saved with its chips.
    if (draw(editor)) api.markDirty()
    redrawCode()
    if (!tip.hidden && tipChip) showTip(tipChip)
  })
  draw(editor)

  // ─── Hover tooltip ──────────────────────────────────────────────────
  const tip = document.createElement('div')
  tip.className = 'var-tip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  document.body.append(tip)
  let tipChip = null

  function showTip(chip) {
    tipChip = chip
    const variable = chip.dataset.varId
      ? chipInfo.get(chip)
      : env.variables(nodeOf(chip)).find((v) => v.name === chip.dataset.varName) || null
    const line = (label, value, cls = '') => {
      const row = document.createElement('div')
      row.className = `var-tip-row ${cls}`.trim()
      if (label) {
        const key = document.createElement('span')
        key.className = 'var-tip-key'
        key.textContent = label
        row.append(key)
      }
      row.append(document.createTextNode(value))
      return row
    }
    const rows = [line('', (variable && variable.name) || chip.dataset.varName || '?', 'var-tip-name')]
    if (!variable) {
      rows.push(line('', 'Not in this note’s Variables', 'var-tip-note'))
      if (canFix(chip)) rows.push(line('', 'Click to restore it or make it text', 'var-tip-note'))
    }
    else {
      if (variable.label) rows.push(line('Component', variable.label))
      if (variable.value) rows.push(line('Default value', variable.value, 'var-tip-mono'))
      if (variable.description) rows.push(line('', variable.description, 'var-tip-desc'))
    }
    tip.replaceChildren(...rows)
    tip.hidden = false
    const box = chip.getBoundingClientRect()
    const width = tip.offsetWidth
    const height = tip.offsetHeight
    const below = box.bottom + 6 + height <= window.innerHeight
    tip.style.left = `${Math.round(Math.max(6, Math.min(box.left, window.innerWidth - width - 6)))}px`
    tip.style.top = `${Math.round(below ? box.bottom + 6 : box.top - height - 6)}px`
  }
  const hideTip = () => {
    tip.hidden = true
    tipChip = null
  }
  document.addEventListener('mouseover', (e) => {
    if (isCode(e.target)) return
    const chip = e.target.closest && e.target.closest('.note-var[data-var-id], .code-var')
    if (chip && chip !== tipChip) showTip(chip)
    else if (!chip && tipChip) hideTip()
  })
  // In a code block the text box lies over the chips, so find them by position.
  document.addEventListener('mousemove', (e) => {
    if (!isCode(e.target)) return
    const chip = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList && el.classList.contains('code-var'))
    if (chip && chip !== tipChip) showTip(chip)
    else if (!chip && tipChip) hideTip()
  })
  document.addEventListener('scroll', hideTip, true)
  document.addEventListener('mousedown', hideTip, true)

  // ─── A removed variable's chip ──────────────────────────────────────
  // Click it: put the variable back in the note's Variables, or swap the
  // chip for plain text (its last value, or its name).
  const canFix = (chip) =>
    chip.classList.contains('missing') &&
    chip.matches('.note-var[data-var-id]') &&
    editor.contains(chip) &&
    !editor.closest('[data-env-node]') &&
    Boolean(openNodeId()) &&
    !api.isSealed(openNodeId())
  editor.addEventListener('click', (e) => {
    const chip = e.target.closest && e.target.closest('.note-var.missing[data-var-id]')
    if (!chip || !canFix(chip) || !api.openMenu) return
    e.preventDefault()
    hideTip()
    const nodeId = openNodeId()
    const name = chip.dataset.varName || ''
    const variable = env.removed(nodeId, chip.dataset.varId, name)
    // Typed over the chip, so Ctrl+Z brings the chip back.
    const asText = (value) => () => {
      editor.focus()
      const range = document.createRange()
      range.selectNode(chip)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      if (!document.execCommand('insertText', false, value) || chip.isConnected) chip.replaceWith(document.createTextNode(value))
      api.afterEdit()
    }
    const quote = (value) => `“${value.length > 40 ? `${value.slice(0, 40)}…` : value}”`
    const items = [[`Restore the variable ${quote(name || '?')}`, () => env.restore(nodeId, chip.dataset.varId, name), !name]]
    if (variable && variable.current && variable.current !== name)
      items.push([`Make it text: ${quote(variable.current)}`, asText(variable.current)])
    if (name) items.push([`Make it text: ${quote(name)}`, asText(name)])
    const box = chip.getBoundingClientRect()
    api.openMenu(box.left, box.bottom + 4, items)
  })

  // ─── Insert Variable box ────────────────────────────────────────────
  const box = document.createElement('div')
  box.className = 'var-picker'
  box.hidden = true
  box.innerHTML = `
    <input class="var-picker-input note-var" type="text" spellcheck="false" autocomplete="off"
      aria-label="Variable name" aria-autocomplete="list" placeholder="variable"/>
    <ul class="var-picker-list" role="listbox" aria-label="Variables"></ul>
    <div class="var-picker-hint"></div>`
  document.body.append(box)
  const input = box.querySelector('.var-picker-input')
  const list = box.querySelector('.var-picker-list')
  const hint = box.querySelector('.var-picker-hint')
  let range = null // where the chip goes in the note's text
  let codeArea = null // or the code block it goes in, at codeAt
  let codeAt = [0, 0]
  let nodeId = null
  let matches = []
  let active = -1 // highlighted with the arrow keys; -1 = none (Tab takes the top one)

  function filter() {
    const query = input.value.trim().toLowerCase()
    const vars = env.variables(nodeId).filter((v) => v.name)
    const rank = (v) => {
      const name = v.name.toLowerCase()
      if (!query) return 1
      if (name === query) return 0
      if (name.startsWith(query)) return 1
      if (name.includes(query)) return 2
      if (v.label.toLowerCase().includes(query)) return 3
      return -1
    }
    matches = vars
      .map((v) => [v, rank(v)])
      .filter(([, r]) => r >= 0)
      .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name))
      .map(([v]) => v)
    if (active >= matches.length) active = matches.length - 1
    list.replaceChildren(
      ...matches.map((v, i) => {
        const li = document.createElement('li')
        li.setAttribute('role', 'option')
        li.setAttribute('aria-selected', String(i === active))
        li.className = `var-picker-item${i === active ? ' active' : ''}${i === 0 && active < 0 ? ' top' : ''}`
        const name = document.createElement('span')
        name.className = 'var-picker-name'
        name.textContent = v.name
        const detail = document.createElement('span')
        detail.className = 'var-picker-detail'
        detail.textContent = v.current || v.label || ''
        li.append(name, detail)
        li.addEventListener('mousedown', (e) => {
          e.preventDefault()
          choose(v)
        })
        return li
      }),
    )
    list.hidden = !matches.length
    const typed = input.value.trim()
    const exact = exactMatch()
    const parts = []
    if (matches.length) parts.push(`<kbd>Tab</kbd> ${escapeText(matches[active >= 0 ? active : 0].name)}`)
    if (typed && !exact) parts.push(`<kbd>Enter</kbd> new variable “${escapeText(typed)}”`)
    else if (exact) parts.push(`<kbd>Enter</kbd> ${escapeText(exact.name)}`)
    if (!parts.length) parts.push(vars.length ? 'No match. Type a new name.' : 'Type a name for a new variable.')
    hint.innerHTML = parts.join(' · ')
    // The box grows with what is typed, like a chip.
    input.style.width = `${Math.max(8, Math.min(40, (input.value || input.placeholder).length + 2))}ch`
  }
  const escapeText = escapeHtml
  const exactMatch = () => {
    const typed = input.value.trim().toLowerCase()
    return typed ? env.variables(nodeId).find((v) => v.name.toLowerCase() === typed) : null
  }

  function open() {
    if (!box.hidden) return
    const focused = document.activeElement
    if (isCode(focused) && editor.contains(focused)) return openInCode(focused)
    const selection = getSelection()
    if (!selection.rangeCount) return
    const at = selection.getRangeAt(0)
    if (!api.canInsertAt(at.startContainer)) return
    nodeId = openNodeId()
    if (!nodeId) return
    range = at.cloneRange()
    const picked = at.collapsed ? '' : at.toString().trim()
    input.value = picked.includes('\n') ? '' : picked.slice(0, 60)
    active = -1
    // Where the caret is; an empty line has no box of its own, so use its block.
    let spot = at.getClientRects()[0] || at.getBoundingClientRect()
    if (!spot || (!spot.width && !spot.height)) {
      const el = at.startContainer.nodeType === Node.ELEMENT_NODE ? at.startContainer : at.startContainer.parentElement
      spot = el.getBoundingClientRect()
    }
    showBox(spot)
  }

  function openInCode(area) {
    if (area.readOnly) return
    nodeId = openNodeId()
    if (!nodeId) return
    codeArea = area
    codeAt = [area.selectionStart, area.selectionEnd]
    const picked = area.value.slice(codeAt[0], codeAt[1])
    input.value = /[\n\u2062\u2063]/.test(picked) ? '' : picked.trim().slice(0, 60)
    active = -1
    showBox(codeCaretRect(area))
  }

  function showBox(spot) {
    box.hidden = false
    filter()
    const left = Math.max(6, Math.min(spot.left, window.innerWidth - box.offsetWidth - 6))
    const room = window.innerHeight - spot.top
    box.style.left = `${Math.round(left)}px`
    box.style.top = `${Math.round(room < box.offsetHeight + 8 ? Math.max(6, spot.bottom - box.offsetHeight) : spot.top - 3)}px`
    input.focus()
    input.select()
  }

  function close(putCaretBack) {
    if (box.hidden) return
    box.hidden = true
    if (codeArea) {
      if (putCaretBack) {
        codeArea.focus()
        codeArea.setSelectionRange(codeAt[0], codeAt[1])
      }
      codeArea = null
      return
    }
    if (putCaretBack && range) {
      editor.focus()
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
    range = null
  }

  function choose(variable) {
    if (codeArea) {
      const area = codeArea
      const [from, to] = codeAt
      close(false)
      area.focus()
      area.setSelectionRange(from, to)
      document.execCommand('insertText', false, OPEN + variable.name + CLOSE)
      return
    }
    const at = range
    close(false)
    if (!api.insertVariable(variable, at)) {
      editor.focus()
    }
  }

  input.addEventListener('input', () => {
    active = -1
    filter()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!matches.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      active = active < 0 ? (step > 0 ? 0 : matches.length - 1) : (active + step + matches.length) % matches.length
      filter()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (matches.length) choose(matches[active >= 0 ? active : 0])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && matches[active]) return choose(matches[active])
      const exact = exactMatch()
      if (exact) return choose(exact)
      const name = input.value.trim()
      if (name) choose(env.add(nodeId, name.replace(/[\u2062\u2063]/g, '')))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  })
  input.addEventListener('blur', () => setTimeout(() => close(false), 0))
  window.addEventListener('resize', () => close(false))
  editor.addEventListener('scroll', () => close(false))

  // Alt+V in a note (not with Ctrl, so AltGr+V still types its character).
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (!editor.contains(document.activeElement) && document.activeElement !== editor) return
    e.preventDefault()
    open()
  })
  const button = document.getElementById('notes-insert-var')
  if (button) {
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', () => {
      if (!isCode(document.activeElement)) api.restoreSelection()
      open()
    })
  }

  window.NoteVars = { draw, open, codeHtml, codeValues, CODE_MARKS }
  // Code blocks drawn before this file loaded.
  redrawCode()
})()
