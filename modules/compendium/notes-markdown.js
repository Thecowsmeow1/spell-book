/*
 * Export as Markdown: the Compendium (or the tomes you tick) as a .zip of
 * Markdown files, from Import / Export (format "Markdown (.zip)"). It's a
 * one-off copy for reading the notes in other apps; Spell Book's data file
 * stays where notes live. (Until entry 60 this kept a live copy in a linked
 * folder; that's gone.)
 *
 *   spellbook-markdown-<date>.zip
 *     assets/<note id>-<n>.png    images saved in notes
 *     attachments/<id>-<name>     files attached to notes (note-files.js)
 *     <Tome>/
 *       _tome.md                  the tome: id, name, order, seal
 *       <Note>.md                 a note…
 *       <Note>/                   …and the folder of its subnodes
 *         <Subnote>.md
 *
 * Each note file starts with front matter (id, title, tome, order, tags,
 * sealed, note preset, and its Environment variables with their values), then
 * the note as Markdown. What Markdown has no form for is written readably,
 * with Spell Book's data in an HTML comment beside it (hidden when the file
 * is shown as Markdown), so it could be read back later:
 *   - command and script cards: a quote line with the title, then the
 *     generated command (values filled in) or the script in a code block;
 *     <!-- spellbook:command {…} --> / <!-- spellbook:script {…} -->
 *   - template sections: the name in bold and a table of the records;
 *     <!-- spellbook:template {schema, records} -->
 *   - variable chips: the value, or {{name}} without one
 *   - info boxes: a > [!NOTE] callout
 *   - term links: the term in italics
 *   - attachments: a link to the file in attachments/ (in a one-file
 *     export, the file's name in brackets, since the file can't go along)
 *   - colors, fonts, sizes, alignment and image widths are left out.
 *
 * Uses: window.NotesEditor.sanitize, window.NoteEnv.variables, the spells
 * service (SpellBook.service('spells')) and codeLanguageFor (highlight.js).
 */
;(() => {
  const api = window.NotesEditor || {}

  // The live folder's leftovers, from before entry 60: its setting (in the
  // data file) and the folder's permission (this browser's IndexedDB).
  try {
    if (localStorage.getItem('spellbook_markdown_folder_v1') !== null) localStorage.removeItem('spellbook_markdown_folder_v1')
  } catch {}
  try {
    indexedDB.deleteDatabase('spellbook_markdown')
  } catch {}

  // ─── Names ──────────────────────────────────────────────────────────
  const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i
  function safeName(name, fallback = 'Untitled') {
    let s = String(name || '')
      .replace(/[\u0000-\u001f<>:"/\\|?*⁢⁣]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, 80)
      .trim()
    if (!s || s === '.' || s === '..') s = fallback
    if (RESERVED.test(s)) s = `${s}_`
    if (s.startsWith('.') || s.startsWith('_')) s = `-${s.slice(1)}`
    return s
  }
  // A name not yet used in this folder (Windows ignores case).
  function uniqueName(name, used) {
    let out = name
    for (let n = 2; used.has(out.toLowerCase()); n++) out = `${name} (${n})`
    used.add(out.toLowerCase())
    return out
  }
  // Paths inside Markdown links: each part URL-encoded.
  const linkPath = (path) => path.split('/').map(encodeURIComponent).join('/')

  // ─── Markdown ───────────────────────────────────────────────────────
  const yaml = (value) => JSON.stringify(String(value ?? ''))
  const commentJson = (data) => JSON.stringify(data).replace(/--/g, '-\\u002d').replace(/>/g, '\\u003e')
  const fence = (text, lang = '') => {
    const runs = String(text).match(/`{3,}/g) || []
    const ticks = '`'.repeat(Math.max(3, ...runs.map((r) => r.length + 1)))
    return `${ticks}${lang}\n${String(text).replace(/\n+$/, '')}\n${ticks}`
  }
  const inlineCode = (text) => {
    const s = String(text)
    const runs = s.match(/`+/g) || []
    const ticks = '`'.repeat(Math.max(1, ...runs.map((r) => r.length + 1)))
    const pad = /^`|`$/.test(s) ? ' ' : ''
    return `${ticks}${pad}${s}${pad}${ticks}`
  }
  const escapeText = (s) => s.replace(/([\\`*_[\]<>|])/g, '\\$1')
  // Markdown that would start something at the beginning of a line.
  const escapeLineStart = (line) => line.replace(/^(\s*)(#{1,6}\s|>|[-+*]\s|\d+[.)]\s|={3,}|-{3,}|~~~)/, (m, sp, mark) => `${sp}\\${mark}`)

  function noteToMarkdown(html, ctx) {
    const clean = api.sanitize ? api.sanitize(html) : String(html || '')
    const body = new DOMParser().parseFromString(clean, 'text/html').body
    return blocks(body, ctx).replace(/\n{3,}/g, '\n\n').trim()
  }

  // A variable chip or a variable in a code block: its value, or {{name}}.
  const varText = (ctx, id, name) => {
    const v = ctx.vars.find((x) => (id && x.id === id) || (!id && x.name === name))
    return v && v.current ? v.current : `{{${(v && v.name) || name}}}`
  }

  const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'HR', 'TABLE', 'LI'])

  // Block-level content, separated by blank lines.
  function blocks(root, ctx) {
    const out = []
    let inline = []
    const flushInline = () => {
      const text = inlineOf(inline, ctx).trim()
      if (text) out.push(text.split('\n').map(escapeLineStart).join('\n'))
      inline = []
    }
    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && (isBlock(node) || isSpecialBlock(node))) {
        flushInline()
        const md = block(node, ctx)
        if (md && md.trim()) out.push(md)
      } else {
        inline.push(node)
      }
    })
    flushInline()
    return out.join('\n\n')
  }
  const isBlock = (el) => BLOCK_TAGS.has(el.tagName)
  const isSpecialBlock = (el) => el.matches('[data-command-id], [data-script-id], [data-block-section], [data-callout]')

  function block(el, ctx) {
    if (el.matches('[data-command-id], [data-script-id]')) return card(el, ctx)
    if (el.matches('[data-block-section]')) return templateSection(el, ctx)
    if (el.matches('[data-callout]')) {
      const inner = blocks(el, ctx)
      return ['> [!NOTE]', ...inner.split('\n').map((l) => (l ? `> ${l}` : '>'))].join('\n')
    }
    const tag = el.tagName
    if (/^H[1-6]$/.test(tag)) {
      const text = inlineOf([...el.childNodes], ctx).replace(/\s*\n\s*/g, ' ').trim()
      return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : ''
    }
    if (tag === 'HR') return '---'
    if (tag === 'PRE') {
      const lang = el.dataset.lang || ''
      const text = el.textContent.replace(/⁢([^⁢⁣\n]*)⁣/g, (m, name) => varText(ctx, '', name))
      return fence(text, lang)
    }
    if (tag === 'UL' || tag === 'OL') return list(el, ctx, 0)
    if (tag === 'BLOCKQUOTE') {
      const inner = blocks(el, ctx)
      return inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')
    }
    if (tag === 'TABLE') return table(el, ctx)
    // P, DIV, a stray LI: a DIV may hold blocks of its own.
    if ([...el.children].some((c) => isBlock(c) || isSpecialBlock(c))) return blocks(el, ctx)
    const text = inlineOf([...el.childNodes], ctx).trim()
    return text.split('\n').map(escapeLineStart).join('\n')
  }

  function list(el, ctx, depth) {
    const ordered = el.tagName === 'OL'
    const lines = []
    let n = 1
    ;[...el.children].forEach((li) => {
      if (li.tagName === 'UL' || li.tagName === 'OL') {
        lines.push(list(li, ctx, depth + 1))
        return
      }
      const marker = ordered ? `${n++}. ` : '- '
      const pad = '  '.repeat(depth)
      const own = []
      const nested = []
      li.childNodes.forEach((c) => {
        if (c.nodeType === Node.ELEMENT_NODE && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c)
        else own.push(c)
      })
      const text = own.some((c) => c.nodeType === Node.ELEMENT_NODE && (isBlock(c) || isSpecialBlock(c)))
        ? blocks(wrap(own), ctx)
        : inlineOf(own, ctx).trim()
      const indent = ' '.repeat(marker.length)
      lines.push(`${pad}${marker}${text.split('\n').join(`\n${pad}${indent}`)}`)
      nested.forEach((sub) => lines.push(list(sub, ctx, depth + 1)))
    })
    return lines.join('\n')
  }
  const wrap = (nodes) => {
    const div = document.createElement('div')
    nodes.forEach((n) => div.append(n.cloneNode(true)))
    return div
  }

  const cellText = (cell, ctx) =>
    inlineOf([...cell.childNodes], ctx, { table: true }).trim().replace(/\n/g, '<br>') || ' '
  function table(el, ctx) {
    const rows = [...el.rows]
    if (!rows.length) return ''
    const width = Math.max(...rows.map((r) => r.cells.length))
    const line = (cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? ' ').join(' | ')} |`
    const head = rows[0]
    const out = [line([...head.cells].map((c) => cellText(c, ctx))), line(Array(width).fill('---'))]
    rows.slice(1).forEach((r) => out.push(line([...r.cells].map((c) => cellText(c, ctx)))))
    return out.join('\n')
  }

  // Inline content: text with **bold**, *italic*, `code`, links, images…
  function inlineOf(nodes, ctx, opts = {}) {
    let out = ''
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += escapeText(node.nodeValue.replace(/[\s ]+/g, ' '))
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const el = node
      const tag = el.tagName
      const inner = () => inlineOf([...el.childNodes], ctx, opts)
      const wrapWith = (mark) => {
        const text = inner()
        const m = text.match(/^(\s*)(.*?)(\s*)$/s)
        return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text
      }
      if (el.matches('span[data-attachment]')) out += attachmentLink(el, ctx)
      else if (el.matches('span[data-var-id]')) out += escapeText(varText(ctx, el.dataset.varId, el.dataset.varName || el.textContent))
      else if (el.matches('a[data-term-id]')) out += wrapWith('*')
      else if (el.matches('[data-command-id], [data-script-id], [data-block-section]')) out += `\n\n${block(el, ctx)}\n\n`
      else if (tag === 'BR') out += opts.table ? '\n' : '  \n'
      else if (tag === 'B' || tag === 'STRONG') out += wrapWith('**')
      else if (tag === 'I' || tag === 'EM') out += wrapWith('*')
      else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out += wrapWith('~~')
      else if (tag === 'U') out += `<u>${inner()}</u>`
      else if (tag === 'SUB' || tag === 'SUP') out += `<${tag.toLowerCase()}>${inner()}</${tag.toLowerCase()}>`
      else if (tag === 'CODE') out += inlineCode(el.textContent)
      else if (tag === 'A') {
        const href = el.getAttribute('href') || ''
        const text = inner().trim() || escapeText(href)
        out += href ? `[${text}](<${href.replace(/>/g, '%3E')}>)` : text
      } else if (tag === 'IMG') out += image(el, ctx)
      else if (isBlock(el)) out += `${opts.table ? '\n' : '\n\n'}${inner()}${opts.table ? '\n' : '\n\n'}`
      else out += inner()
    })
    return out
  }

  // Images saved in a note become files in assets/; web images keep their address.
  function image(el, ctx) {
    const src = el.getAttribute('src') || ''
    const alt = escapeText(el.getAttribute('alt') || '')
    const m = src.match(/^data:image\/([a-z0-9.+-]+);base64,(.*)$/i)
    if (!m) return src ? `![${alt}](<${src}>)` : ''
    // One-file exports (note-select.js) keep the image in the file.
    if (ctx.inline) return `![${alt}](<${src}>)`
    const ext = { jpeg: 'jpg', 'svg+xml': 'svg', 'x-icon': 'ico' }[m[1].toLowerCase()] || m[1].toLowerCase()
    const name = `${safeName(ctx.nodeId, 'note')}-${++ctx.images}.${ext}`
    ctx.files.set(`assets/${name}`, { base64: m[2] })
    return `![${alt}](${'../'.repeat(ctx.depth)}assets/${linkPath(name)})`
  }

  // Attachments: the file goes in attachments/ (once, however many notes
  // link to it), filled in by withAttachments() before zipping.
  function attachmentLink(el, ctx) {
    const id = el.dataset.attachment || ''
    const name = el.dataset.name || 'file'
    if (ctx.inline || !/^[0-9a-f]{64}$/.test(id)) return `📎 ${escapeText(name)} (attachment)`
    const file = `${id.slice(0, 12)}-${safeName(name, 'file')}`
    ctx.files.set(`attachments/${file}`, { attachment: id })
    return `[📎 ${escapeText(name)}](${'../'.repeat(ctx.depth)}attachments/${linkPath(file)})`
  }
  // Replaces each attachment entry with the file's bytes. A file this browser
  // can't find is left out, and listed in attachments/_missing.txt.
  async function withAttachments(files) {
    const missing = []
    for (const [path, content] of [...files]) {
      if (!content || typeof content !== 'object' || !content.attachment) continue
      const blob = window.Attachments ? await window.Attachments.get(content.attachment) : null
      if (blob) files.set(path, new Uint8Array(await blob.arrayBuffer()))
      else {
        files.delete(path)
        missing.push(path.replace(/^attachments\//, ''))
      }
    }
    if (missing.length) files.set('attachments/_missing.txt', `Not in this browser when exported, so not included:\n${missing.join('\n')}\n`)
    return files
  }

  // Commands and scripts from the Spells tab, when it's there.
  const spellsHere = () => Boolean(window.SpellBook && window.SpellBook.service('spells'))
  const spellsFind = (kind, id) => (spellsHere() ? window.SpellBook.service('spells').find(kind, id) : null)
  // Without Spells a card is written from its saved copy, without "gone".
  const goneNote = (live) => (live || !spellsHere() ? '' : ' *(no longer in the Spell Book)*')

  function card(el, ctx) {
    const d = el.dataset
    if (d.scriptId !== undefined) {
      const live = spellsFind('scripts', d.scriptId)
      const title = live ? live.name : d.title || 'Script'
      const lang = live ? live.language : d.platform || ''
      const body = live ? live.body : d.template || ''
      return [
        `<!-- spellbook:script ${commentJson({ scriptId: d.scriptId, title, platform: lang })} -->`,
        `> **Script:** ${escapeText(title)}${lang ? ` · ${escapeText(lang)}` : ''}${goneNote(live)}`,
        '',
        fence(body, langFor(lang)),
      ].join('\n')
    }
    const live = spellsFind('commands', d.commandId)
    const title = live ? live.title : d.title || 'Command'
    const platform = live ? live.platform : d.platform || ''
    const template = live ? live.command : d.template || ''
    let values = {}
    try {
      values = JSON.parse(d.values || '{}') || {}
    } catch {}
    let generated = d.generated || template
    try {
      const spells = window.SpellBook.service('spells')
      if (spells) generated = spells.fields.build(template, values)
    } catch {}
    return [
      `<!-- spellbook:command ${commentJson({ commandId: d.commandId, title, platform, template, values })} -->`,
      `> **Command:** ${escapeText(title)}${platform ? ` · ${escapeText(platform)}` : ''}${goneNote(live)}`,
      '',
      fence(generated, langFor(platform)),
    ].join('\n')
  }
  const langFor = (name) => {
    try {
      return typeof codeLanguageFor === 'function' ? codeLanguageFor(name) || '' : ''
    } catch {
      return ''
    }
  }

  function templateSection(el, ctx) {
    let schema = {}
    let records = []
    try {
      schema = JSON.parse(el.dataset.blockSchema || '{}') || {}
      records = JSON.parse(el.dataset.blockRecords || '[]') || []
    } catch {}
    const fields = Array.isArray(schema.fields) ? schema.fields : []
    const value = (record, f) => {
      if (record.h && typeof record.h[f.id] === 'string') {
        const div = document.createElement('div')
        div.innerHTML = api.sanitize ? api.sanitize(record.h[f.id]) : ''
        return inlineOf([...div.childNodes], ctx, { table: true }).trim()
      }
      const v = record.v ? record.v[f.id] : ''
      if (f.type === 'checkbox') return v === '1' || v === true ? '✓' : ''
      return escapeText(String(v ?? ''))
    }
    const out = [`<!-- spellbook:template ${commentJson({ type: el.dataset.blockType || '', from: el.dataset.blockFrom || '', schema, records })} -->`, `**${escapeText(schema.name || 'Template')}**`]
    if (fields.length && records.length) {
      out.push('')
      out.push(`| ${fields.map((f) => escapeText(f.label || f.id)).join(' | ')} |`)
      out.push(`| ${fields.map(() => '---').join(' | ')} |`)
      records.forEach((r) => out.push(`| ${fields.map((f) => value(r, f).replace(/\n/g, '<br>') || ' ').join(' | ')} |`))
    } else {
      out.push('', '*(no records)*')
    }
    return out.join('\n')
  }

  // ─── The whole Compendium as files ──────────────────────────────────
  function variablesOf(id) {
    try {
      return window.NoteEnv && window.NoteEnv.variables ? window.NoteEnv.variables(id) : []
    } catch {
      return []
    }
  }

  // Returns Map<path, string | { base64 }>.
  function buildFiles(tomes) {
    const files = new Map()
    const topUsed = new Set(['assets', 'attachments'])
    tomes.forEach((tome, tomeIndex) => {
      const dir = uniqueName(safeName(tome.name, 'Tome'), topUsed)
      files.set(
        `${dir}/_tome.md`,
        ['---', `id: ${yaml(tome.id)}`, `name: ${yaml(tome.name)}`, `order: ${tomeIndex + 1}`, ...(tome.sealed ? ['sealed: true'] : []), '---', '', `# ${escapeText(tome.name || 'Tome')}`, ''].join('\n'),
      )
      const walk = (list, folder, depth, used) => {
        list.forEach((node, index) => {
          const name = uniqueName(safeName(node.name), used)
          const vars = variablesOf(node.id)
          const ctx = { nodeId: node.id, vars, depth, files, images: 0 }
          const md = noteToMarkdown(node.html, ctx)
          const front = ['---', `id: ${yaml(node.id)}`, `title: ${yaml(node.name)}`, `tome: ${yaml(tome.name)}`, `order: ${index + 1}`]
          if ((node.tags || []).length) front.push(`tags: [${node.tags.map(yaml).join(', ')}]`)
          if (node.sealed) front.push('sealed: true')
          if (node.template) front.push('preset: true')
          if (node.starred) front.push('starred: true')
          if (vars.length) {
            front.push('variables:')
            vars.forEach((v) => {
              front.push(`  - name: ${yaml(v.name)}`)
              front.push(`    value: ${yaml(v.current || '')}`)
              if (v.value && v.value !== v.current) front.push(`    default: ${yaml(v.value)}`)
              if (v.label) front.push(`    component: ${yaml(v.label)}`)
              if (v.description) front.push(`    description: ${yaml(v.description)}`)
            })
          }
          front.push('---', '', '')
          files.set(`${folder}/${name}.md`, `${front.join('\n')}${md}${md ? '\n' : ''}`)
          if ((node.children || []).length) {
            // The subnodes' folder shares the note's name; their names are
            // unique among themselves.
            walk(node.children, `${folder}/${name}`, depth + 1, new Set())
          }
        })
      }
      walk(tome.nodes || [], dir, 1, new Set())
    })
    return files
  }

  const toBytes = (content) => {
    if (typeof content === 'string') return new TextEncoder().encode(content)
    if (content instanceof Uint8Array) return content
    const bin = atob(content.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  // ─── A .zip, written by hand (stored, not compressed) ───────────────
  // Markdown is small, and the images are already compressed, so storing is
  // enough. Names are UTF-8 (flag bit 11), as tome and note names may not
  // be ASCII.
  const CRC = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })()
  function crc32(bytes) {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  function zip(files) {
    const enc = new TextEncoder()
    const now = new Date()
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
    const parts = []
    const central = []
    let offset = 0
    for (const [path, content] of files) {
      const name = enc.encode(path)
      const data = toBytes(content)
      const crc = crc32(data)
      const local = new DataView(new ArrayBuffer(30))
      local.setUint32(0, 0x04034b50, true)
      local.setUint16(4, 20, true)
      local.setUint16(6, 0x0800, true)
      local.setUint16(8, 0, true)
      local.setUint16(10, time, true)
      local.setUint16(12, date, true)
      local.setUint32(14, crc, true)
      local.setUint32(18, data.length, true)
      local.setUint32(22, data.length, true)
      local.setUint16(26, name.length, true)
      local.setUint16(28, 0, true)
      parts.push(local.buffer, name, data)
      const entry = new DataView(new ArrayBuffer(46))
      entry.setUint32(0, 0x02014b50, true)
      entry.setUint16(4, 20, true)
      entry.setUint16(6, 20, true)
      entry.setUint16(8, 0x0800, true)
      entry.setUint16(10, 0, true)
      entry.setUint16(12, time, true)
      entry.setUint16(14, date, true)
      entry.setUint32(16, crc, true)
      entry.setUint32(20, data.length, true)
      entry.setUint32(24, data.length, true)
      entry.setUint16(28, name.length, true)
      entry.setUint32(42, offset, true)
      central.push(entry.buffer, name)
      offset += 30 + name.length + data.length
    }
    const size = central.reduce((n, b) => n + b.byteLength, 0)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, files.size, true)
    end.setUint16(10, files.size, true)
    end.setUint32(12, size, true)
    end.setUint32(16, offset, true)
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
  }

  // Import / Export (js/transfer.js): "Markdown (.zip)" exports the ticked
  // tomes of the Compendium part ("tomes"), whose data is a list of tomes.
  window.SpellBook.exportFormat({
    id: 'markdown',
    label: 'Markdown (.zip): Compendium',
    parts: ['tomes'],
    async write(parts) {
      const files = await withAttachments(buildFiles(parts.tomes || []))
      return { name: window.DataFile.backupName('spellbook-markdown', 'zip'), blob: zip(files) }
    },
  })

  // For testing and other pages: the conversion without downloading anything.
  window.NotesMarkdown = {
    buildFiles: (tomes) => buildFiles(tomes || []),
    noteToMarkdown: (html, nodeId = '', options = {}) =>
      noteToMarkdown(html, { nodeId, vars: variablesOf(nodeId), depth: 1, files: new Map(), images: 0, inline: Boolean(options.inline) }),
    variablesOf,
    withAttachments,
    zip,
  }
})()
