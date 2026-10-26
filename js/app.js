/*
 * Main application controller.
 *
 * Owns command/script/term state, localStorage persistence, rendering, forms,
 * keyboard shortcuts, import/export, and modal coordination. index.html is
 * the caller surface: its button ids are looked up and wired in this file.
 * settings.js is loaded after this file and calls several helpers defined here.
 * Keep storage keys synchronized with reset actions and js/datafile.js.
 */
// ─── Seed data (generalized from notes) ───────────────────────────────
const SEED = window.SPELLBOOK_COMMANDS || []

// ─── State ────────────────────────────────────────────────────────────
let commands = []
let currentFilters = [] // selected platform quick filters; empty = All
// Each table (commands, scripts, terms) keeps its own selected tags.
const tagSelections = { commands: [], scripts: [], terms: [] }
const selectedTags = () => tagSelections[currentView]
let selectedId = null
let searchQuery = ''
let sortKey = 'title'
let sortDir = 1
let currentPage = 'spellbook' // 'spellbook' | 'guides' | 'templates'
let currentView = 'commands' // 'commands' | 'scripts'

const STORAGE_KEY = 'spellbook_commands_v1'
const TRASH_STORAGE_KEY = 'spellbook_trash_v1'
const BASELINE_STORAGE_KEY = 'spellbook_import_baseline_v1'
let trashedCommands = []
let baselineCommandIds = new Set()
const PLATFORM_ID_PREFIXES = {
  PowerShell: 'powershell',
  Bash: 'bash',
  Proxmox: 'proxmox',
  Cisco: 'cisco',
  Docker: 'docker',
  Kubernetes: 'kubernetes',
  Wireshark: 'wireshark',
  Kibana: 'kibana',
  Arkime: 'arkime',
}

function platformIdPrefix(platform) {
  if (PLATFORM_ID_PREFIXES[platform]) return PLATFORM_ID_PREFIXES[platform]
  const slug = String(platform || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'windows'
}

// Older data used an "os" field; it is now called "platform".
function withPlatform(cmd) {
  if (!cmd || typeof cmd !== 'object' || cmd.platform || !cmd.os) return cmd
  const { os, ...rest } = cmd
  return { ...rest, platform: os }
}

function normalizeCommandIds(commandList) {
  const usedByPrefix = {}
  return commandList.map((original) => {
    const cmd = withPlatform(original)
    const platform = cmd && cmd.platform ? cmd.platform : 'Windows'
    const rawId = typeof cmd?.id === 'string' ? cmd.id : ''
    // A well-formed id keeps its own prefix, so renaming a command's platform
    // never renumbers it.
    const match = rawId.match(/^([a-z0-9-]+)-(\d{4})$/i)
    const prefix = match ? match[1].toLowerCase() : platformIdPrefix(platform)

    let nextNumber
    if (match) {
      nextNumber = Number.parseInt(match[2], 10)
    } else {
      const used = usedByPrefix[prefix] || new Set()
      let candidate = 0
      while (used.has(candidate)) candidate += 1
      nextNumber = candidate
      usedByPrefix[prefix] = used
      used.add(nextNumber)
    }

    const used = usedByPrefix[prefix] || new Set()
    while (used.has(nextNumber)) {
      nextNumber += 1
    }
    used.add(nextNumber)
    usedByPrefix[prefix] = used

    return { ...cmd, id: `${prefix}-${String(nextNumber).padStart(4, '0')}` }
  })
}

function generateCommandId(platform, existingCommands = commands) {
  const prefix = platformIdPrefix(platform)
  const used = new Set()
  existingCommands.forEach((cmd) => {
    if (!cmd) return
    const match = String(cmd.id || '').match(
      new RegExp(`^${prefix}-(\\d{4})$`, 'i'),
    )
    if (match) used.add(Number.parseInt(match[1], 10))
  })

  let next = 0
  while (used.has(next)) next += 1
  return `${prefix}-${String(next).padStart(4, '0')}`
}

// ─── Persistence ──────────────────────────────────────────────────────
// Reads and writes browser-local data. These functions do not edit files in
// data/: Export creates a browser download, while DataFile handles optional
// File System Access API writes from js/datafile.js.

// One-time rename of the old Windows / Linux platforms to the current quick
// filters: Linux becomes Bash; Windows becomes PowerShell or CMD, judged by the
// command's tags and then its syntax. Ids are left unchanged.
const PLATFORM_MIGRATION_KEY = 'spellbook_platform_rename_v1'

function legacyPlatformFor(cmd) {
  if (cmd.platform === 'Linux') return 'Bash'
  if (cmd.platform !== 'Windows') return cmd.platform
  const tags = (cmd.tags || []).map((t) => String(t).toLowerCase())
  if (tags.includes('powershell')) return 'PowerShell'
  if (tags.some((t) => ['cmd', 'wmic', 'batch'].includes(t))) return 'CMD'
  return /(^|[|;(]\s*)[A-Z][a-z]+-[A-Z][A-Za-z]+|\$[A-Za-z_]|\bpowershell\b|\bpwsh\b/.test(
    String(cmd.command || ''),
  )
    ? 'PowerShell'
    : 'CMD'
}

function migrateLegacyPlatforms() {
  try {
    if (localStorage.getItem(PLATFORM_MIGRATION_KEY)) return
    const rename = (cmd) => ({ ...cmd, platform: legacyPlatformFor(cmd) })
    commands = commands.map(rename)
    trashedCommands = trashedCommands.map(rename)
    save()
    saveTrash()
    localStorage.setItem(PLATFORM_MIGRATION_KEY, '1')
  } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const stored = JSON.parse(raw)
      commands = Array.isArray(stored)
        ? normalizeCommandIds(stored)
        : normalizeCommandIds([...SEED])
    } else {
      commands = normalizeCommandIds([...SEED])
    }
  } catch {
    commands = normalizeCommandIds([...SEED])
  }

  try {
    const storedTrash = JSON.parse(
      localStorage.getItem(TRASH_STORAGE_KEY) || '[]',
    )
    trashedCommands = Array.isArray(storedTrash)
      ? storedTrash
          .filter((cmd) => cmd && typeof cmd === 'object')
          .map(withPlatform)
      : []
  } catch {
    trashedCommands = []
  }

  migrateLegacyPlatforms()

  try {
    const storedBaseline = localStorage.getItem(BASELINE_STORAGE_KEY)
    baselineCommandIds =
      storedBaseline === null
        ? new Set(normalizeCommandIds([...SEED]).map((cmd) => cmd.id))
        : new Set(
            JSON.parse(storedBaseline).filter((id) => typeof id === 'string'),
          )
    if (storedBaseline === null) saveBaseline()
  } catch {
    baselineCommandIds = new Set(
      normalizeCommandIds([...SEED]).map((cmd) => cmd.id),
    )
    saveBaseline()
  }
}

function save() {
  // Persist only user-added / edited items that differ from pure seed,
  // but simplest reliable approach: store everything and on load prefer seed for known ids.
  // For "live add" we store the full list; seed is always the baseline.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(commands))
}

function saveTrash() {
  localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(trashedCommands))
}

function saveBaseline() {
  localStorage.setItem(
    BASELINE_STORAGE_KEY,
    JSON.stringify([...baselineCommandIds]),
  )
}

function getCommandChangeCounts() {
  const activeIds = new Set(commands.map((cmd) => cmd.id))
  return {
    added: commands.filter((cmd) => !baselineCommandIds.has(cmd.id)).length,
    deleted: [...baselineCommandIds].filter((id) => !activeIds.has(id)).length,
  }
}

// ─── Command-template parsing and rendering ────────────────────────────
// The editor stores a template plus variable metadata. The detail pane calls
// this section to turn placeholders into controls and then into executable
// text; syntax highlighting is supplied by js/highlight.js.
// Supported syntax:
//   <name>                               Required text field
//   [name]                               Standalone optional text field
//   <option1 | option2 | option3>        Required choice dropdown
//   [--option <name>]                    Optional group
//   [--format <csv | list | hform>]      Optional group with dropdown
//   [--proxy <proxy> [--type <http | socks5>]]
//                                        Nested optional group
const TEMPLATE_FIELD_NAME = /^[A-Za-z0-9_.-]+$/

// A switch such as [-a] or [--all] (a bracket group with only text in it) is a
// checkbox: ticking it puts the flag in the generated command.
const FLAG_TEXT = /^-{1,2}[A-Za-z0-9][\w-]*$/

function containsFieldNode(nodes) {
  // A group containing any editable field behaves differently from a plain
  // switch such as [--verbose], so inspect nested groups recursively.
  return nodes.some(
    (node) =>
      node.type === 'requiredField' ||
      node.type === 'optionalField' ||
      node.type === 'choiceField' ||
      (node.type === 'optionalGroup' && containsFieldNode(node.children)),
  )
}

const toggleLabel = (node) =>
  // Optional groups made only from text use that text as their checkbox label.
  node.children
    .filter((child) => child.type === 'text')
    .map((child) => child.value)
    .join('')
    .trim()

function parseCommandTemplate(command) {
  // `source` is never mutated. `position` is the cursor shared by the
  // recursive reader, so nested [groups] can continue exactly where their
  // parent stopped.
  const source = String(command || '')
  let position = 0
  let choiceIndex = 0
  let toggleIndex = 0

  function readNodes(stopAtClosingBracket = false) {
    // Convert one level of template text into a small AST. Returning `closed`
    // lets the caller distinguish a real group from an unmatched `[`.
    const nodes = []
    let text = ''

    const flushText = () => {
      // Keep ordinary command text as one node instead of creating one node
      // per character; this makes later rendering simpler and faster.
      if (text) {
        nodes.push({
          type: 'text',
          value: text,
        })

        text = ''
      }
    }

    while (position < source.length) {
      const character = source[position]

      // Escape literal template-control characters.
      //
      // Examples in a command template:
      //   \[\[  becomes [[
      //   \]\]  becomes ]]
      //
      // The backslash is consumed by the parser and does not appear in the
      // generated command.
      if (character === '\\' && position + 1 < source.length) {
        const nextCharacter = source[position + 1]

        if ('[]<>\\'.includes(nextCharacter)) {
          text += nextCharacter
          position += 2
          continue
        }
      }

      // Close a nested optional group.
      if (stopAtClosingBracket && character === ']') {
        flushText()
        position += 1

        return {
          nodes,
          closed: true,
        }
      }

      // Optional field or optional group.
      if (character === '[') {
        // Read the contents recursively because optional groups may contain
        // fields or another optional group.
        const groupStart = position
        position += 1

        const parsedGroup = readNodes(true)

        // Treat unmatched opening brackets as normal command text.
        if (!parsedGroup.closed) {
          text += source.slice(groupStart)
          break
        }

        const innerText = source.slice(groupStart + 1, position - 1)

        flushText()

        // Preserve backward-compatible [name] standalone optional fields.
        if (TEMPLATE_FIELD_NAME.test(innerText) && !FLAG_TEXT.test(innerText)) {
          nodes.push({
            type: 'optionalField',
            name: innerText,
          })
        } else {
          const group = {
            type: 'optionalGroup',
            children: parsedGroup.nodes,
            toggleKey: null,
          }
          // Text only, no fields: a switch the user can turn on or off.
          if (!containsFieldNode(parsedGroup.nodes) && toggleLabel(group)) {
            group.toggleKey = `toggle-${toggleIndex}`
            toggleIndex += 1
          }
          nodes.push(group)
        }

        continue
      }

      // Required text field or required choice field.
      if (character === '<') {
        // Angle brackets represent required values, or a choice when the
        // contents contain two or more pipe-separated alternatives.
        const closingAngle = source.indexOf('>', position + 1)

        if (closingAngle !== -1) {
          const innerText = source.slice(position + 1, closingAngle)

          // A pipe-delimited angle-bracket token becomes a dropdown.
          const options = innerText
            .split('|')
            .map((option) => option.trim())
            .filter(Boolean)

          if (options.length >= 2) {
            flushText()

            nodes.push({
              type: 'choiceField',
              key: `choice-${choiceIndex}`,
              options,
              raw: `<${innerText}>`,
            })

            choiceIndex += 1
            position = closingAngle + 1
            continue
          }

          // A normal <name> token becomes a required text field.
          if (TEMPLATE_FIELD_NAME.test(innerText)) {
            flushText()

            nodes.push({
              type: 'requiredField',
              name: innerText,
            })

            position = closingAngle + 1
            continue
          }
        }
      }

      text += character
      position += 1
    }

    flushText()

    return {
      nodes,
      closed: false,
    }
  }

  return readNodes(false).nodes
}

function getTemplateFields(command) {
  // Flatten the AST into form fields. A map prevents duplicate placeholders
  // from creating duplicate inputs while `priority` preserves the strongest
  // meaning when the same name appears in different contexts.
  const fields = []
  const fieldsByKey = new Map()
  const priority = {
    manual: 0,
    optional: 1,
    conditional: 2,
    conditionalChoice: 2,
    toggle: 2,
    required: 3,
    choice: 3,
  }
  const addField = (field) => {
    // The first occurrence establishes order; later occurrences may only
    // strengthen the field type, not move the input in the UI.
    const existing = fieldsByKey.get(field.key)
    if (!existing) {
      const savedField = { ...field }
      fields.push(savedField)
      fieldsByKey.set(savedField.key, savedField)
      return
    }
    // Preserve the strongest designation when a text variable is used
    // in more than one location in the template.
    if (priority[field.type] > priority[existing.type]) {
      existing.type = field.type
    }
  }

  const visitNodes = (nodes, insideOptionalGroup = false) => {
    // Carry the optional-group context down so a required field inside `[...]`
    // becomes conditionally required rather than globally required.
    nodes.forEach((node) => {
      if (node.type === 'requiredField') {
        addField({
          key: node.name,
          name: node.name,
          type: insideOptionalGroup ? 'conditional' : 'required',
        })
        return
      }
      if (node.type === 'optionalField') {
        addField({
          key: node.name,
          name: node.name,
          type: 'optional',
        })
        return
      }
      if (node.type === 'choiceField') {
        addField({
          key: node.key,
          name: node.options.join(' | '),
          raw: node.raw,
          options: node.options,
          type: insideOptionalGroup ? 'conditionalChoice' : 'choice',
        })
        return
      }
      if (node.type === 'optionalGroup') {
        if (node.toggleKey) {
          addField({
            key: node.toggleKey,
            name: toggleLabel(node),
            flag: toggleLabel(node),
            type: 'toggle',
          })
          return
        }
        visitNodes(node.children, true)
      }
    })
  }
  visitNodes(parseCommandTemplate(command))
  return fields
}

function extractPlaceholders(command) {
  // Preserve the existing command-data format: only ordinary named fields
  // are stored in cmd.variables. Dropdown fields are rediscovered from
  // the template each time the command is rendered.
  return getTemplateFields(command)
    .filter(
      (field) =>
        field.type !== 'choice' &&
        field.type !== 'conditionalChoice' &&
        field.type !== 'toggle',
    )
    .map((field) => field.name)
}

function renderTemplateNodes(nodes, values, insideOptionalGroup = false) {
  // Render the AST while tracking two separate facts: whether the user
  // supplied anything for this group, and whether every required value is
  // complete. Optional groups use both facts to decide whether to appear.
  let text = ''
  let hasUserValue = false
  let complete = true
  nodes.forEach((node) => {
    if (node.type === 'text') {
      text += node.value
      return
    }
    if (node.type === 'requiredField') {
      // Top-level blanks stay visible as <name> so the user can see what is
      // missing; blanks inside optional groups suppress that group instead.
      const value = String(values[node.name] || '').trim()
      if (value) {
        text += value
        hasUserValue = true
      } else if (insideOptionalGroup) {
        // Required fields inside optional groups are conditionally required.
        complete = false
      } else {
        // Preserve blank top-level required fields visibly.
        text += `<${node.name}>`
      }
      return
    }
    if (node.type === 'optionalField') {
      const value = String(values[node.name] || '').trim()
      if (value) {
        text += value
        hasUserValue = true
      }
      return
    }
    if (node.type === 'choiceField') {
      const selectedValue = String(values[node.key] || '').trim()
      if (selectedValue) {
        text += selectedValue
        hasUserValue = true
      } else if (insideOptionalGroup) {
        // An unselected dropdown inside an optional group keeps that group
        // out of the generated command.
        complete = false
      } else {
        // Preserve blank top-level dropdowns visibly.
        text += node.raw
      }
      return
    }
    if (node.type === 'optionalGroup' && node.toggleKey) {
      // A text-only optional group is controlled by a checkbox-like toggle.
      if (values[node.toggleKey]) {
        text += renderTemplateNodes(node.children, values, true).text
        hasUserValue = true
      }
      return
    }
    if (node.type === 'optionalGroup') {
      // A field-based optional group is included only when it has input and
      // does not contain an unfinished required child.
      const result = renderTemplateNodes(node.children, values, true)
      // Include the optional group only when it contains user-provided
      // data and every required/choice field within that group is complete.
      if (result.hasUserValue) {
        hasUserValue = true
        if (result.complete) {
          text += result.text
        } else {
          complete = false
        }
      }
    }
  })
  return {
    text,
    hasUserValue,
    complete,
  }
}

function buildGeneratedCommand(command, values = {}) {
  // Public command-builder entry point used by the detail form and copy/run
  // actions. Parsing is repeated here so saved templates remain the source of
  // truth even if their stored variable list is old or incomplete.
  const nodes = parseCommandTemplate(command)
  const result = renderTemplateNodes(nodes, values)
  // Preserve internal spaces because they can matter in quoted strings,
  // regular expressions, and command syntax.
  return result.text.trimEnd()
}

function renderCommandTemplate(command) {
  const renderNodes = (nodes) => {
    return nodes
      .map((node) => {
        if (node.type === 'text') {
          return node.value
        }
        if (node.type === 'requiredField') {
          return `<${node.name}>`
        }
        if (node.type === 'optionalField') {
          return `[${node.name}]`
        }
        if (node.type === 'choiceField') {
          return node.raw
        }
        if (node.type === 'optionalGroup') {
          return `[${renderNodes(node.children)}]`
        }
        return ''
      })
      .join('')
  }
  return renderNodes(parseCommandTemplate(command))
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

function getPlatformBadgeClass(platform) {
  return (
    {
      Windows: 'win',
      Linux: 'lin',
      Wireshark: 'ws',
      'Routers+Switches': 'rs',
      Kibana: 'kb',
      Arkime: 'ar',
    }[platform] || 'custom'
  )
}

function highlight(text, q) {
  if (!q) return escapeHtml(text)
  const re = new RegExp(
    '(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')',
    'gi',
  )
  return escapeHtml(text).replace(
    re,
    "<mark style='background:#3b82f6;color:#fff;padding:0 2px;border-radius:2px'>$1</mark>",
  )
}

// ─── Render list ──────────────────────────────────────────────────────
// Every search, filter, sort, import, or mutation eventually redraws this
// boundary and then redraws the selected detail record.
function getFiltered() {
  let list = commands
  if (currentFilters.length) {
    list = list.filter((c) =>
      currentFilters.some((p) => sameText(p, c.platform || '')),
    )
  }
  if (tagSelections.commands.length) {
    // A command must carry every selected tag.
    list = list.filter((c) =>
      tagSelections.commands.every((t) => (c.tags || []).includes(t)),
    )
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    list = list.filter((c) => {
      const blob = [
        c.title,
        c.description,
        c.command,
        c.example,
        c.notes,
        (c.variables || []).join(' '),
        (c.tags || []).join(' '),
        c.platform,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }
  return list
}

// Tags in the table currently showing.
function getAllTags() {
  const items =
    currentView === 'scripts'
      ? scripts
      : currentView === 'terms'
        ? terms
        : commands
  return [...new Set(items.flatMap((item) => item.tags || []))].sort((a, b) =>
    a.localeCompare(b),
  )
}

// Lowercased, de-duplicated tags from an array or a comma/semicolon string.
function cleanTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;]/)
  return [
    ...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean)),
  ]
}

const hasAllTags = (item, selected) =>
  selected.every((t) => (item.tags || []).includes(t))

const tagChips = (item) =>
  (item.tags || [])
    .map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`)
    .join('')

// ─── Editing tags in the detail view ──────────────────────────────────
// Tags sit on their own row under the platform / language / category. Click a
// tag's × to remove it; type in the box and press Enter or a comma to add one.
// Changes are saved straight away. `persist` saves the item's collection.
function bindTagEditor(item, persist) {
  const host = document.getElementById('entry-tags')
  if (!host) return

  const commit = (tags, refocus = true) => {
    item.tags = tags
    persist()
    renderList() // the table's Tags column and the tag filter pick it up
    draw(refocus)
  }
  const add = (text, refocus = true) => {
    const added = cleanTags(text)
    if (added.length) {
      commit(cleanTags([...(item.tags || []), ...added]), refocus)
    }
  }

  function draw(refocus = true) {
    host.replaceChildren()
    ;(item.tags || []).forEach((tag) => {
      const chip = document.createElement('span')
      chip.className = 'tag-chip editable'
      chip.append(document.createTextNode(tag))
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'tag-x'
      remove.textContent = '×'
      remove.title = `Remove the tag "${tag}"`
      remove.setAttribute('aria-label', `Remove the tag ${tag}`)
      remove.addEventListener('click', () =>
        commit((item.tags || []).filter((t) => t !== tag)),
      )
      chip.append(remove)
      host.append(chip)
    })
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'tag-add-input'
    input.placeholder = '+ add tag'
    input.setAttribute('aria-label', 'Add a tag')
    input.autocomplete = 'off'

    // As you type, tags that already exist (in this table) and match are
    // listed; click one, or use the arrow keys and Enter, to add it.
    const wrap = document.createElement('span')
    wrap.className = 'tag-add-wrap'
    const panel = document.createElement('div')
    panel.className = 'tag-suggest'
    panel.hidden = true
    // Keep focus in the box while a suggestion is pressed.
    panel.addEventListener('mousedown', (e) => e.preventDefault())
    let matches = []
    let active = -1

    const paintActive = () => {
      panel.querySelectorAll('.tag-pick').forEach((button, i) => {
        button.classList.toggle('active', i === active)
      })
    }
    const refreshSuggestions = () => {
      const piece = input.value.split(',').pop().trim().toLowerCase()
      const have = new Set(item.tags || [])
      matches = piece
        ? getAllTags()
            .filter((t) => !have.has(t) && t.toLowerCase().includes(piece))
            .sort(
              (a, b) =>
                Number(b.startsWith(piece)) - Number(a.startsWith(piece)) ||
                a.localeCompare(b),
            )
            .slice(0, 12)
        : []
      active = -1
      panel.replaceChildren()
      panel.hidden = !piece
      if (!piece) return
      matches.forEach((tag) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'tag-chip tag-pick'
        button.textContent = tag
        button.addEventListener('click', () => {
          // Replace the piece being typed with the chosen tag.
          const before = input.value.split(',').slice(0, -1)
          input.value = ''
          add([...before, tag].join(','))
        })
        panel.append(button)
      })
      const exact = matches.includes(piece) || have.has(piece)
      if (!exact) {
        const hint = document.createElement('span')
        hint.className = 'tag-suggest-hint'
        hint.textContent = matches.length
          ? `Enter adds "${piece}" as a new tag`
          : `No existing tag matches. Enter adds "${piece}".`
        panel.append(hint)
      }
    }

    input.addEventListener('input', refreshSuggestions)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!matches.length) return
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        active = (active + step + matches.length + 1) % (matches.length + 1)
        if (active === matches.length) active = -1 // back to "what I typed"
        paintActive()
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault()
        const before = input.value.split(',').slice(0, -1)
        input.value = ''
        add([...before, matches[active]].join(','))
      } else if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        add(input.value)
      } else if (e.key === 'Backspace' && !input.value && item.tags?.length) {
        commit(item.tags.slice(0, -1))
      } else if (e.key === 'Escape') {
        input.value = ''
        refreshSuggestions()
      }
    })
    input.addEventListener('blur', () => {
      panel.hidden = true
      // Text left in the box when you click away is added too.
      if (input.value.trim()) {
        const text = input.value
        input.value = ''
        add(text, false) // do not pull focus back from where you clicked
      }
    })
    wrap.append(input, panel)
    host.append(wrap)
    if (refocus && host.dataset.focus === 'input') input.focus()
  }

  // Keep typing in the box after each add or removal.
  host.addEventListener('focusin', () => {
    host.dataset.focus = 'input'
  })
  host.addEventListener('focusout', () => {
    delete host.dataset.focus
  })
  draw(false)
}

// Moves any complete, known tags out of the input and into chips. The final
// comma-separated piece stays in the input unless `final` is true (Enter).
function commitTagInput(input, final = false) {
  const known = getAllTags()
  const parts = input.value.split(',')
  const tail = final ? [] : [parts.pop().trimStart()]
  const unknown = []
  let changed = false
  parts.forEach((part) => {
    const raw = part.trim().toLowerCase()
    if (!raw) return
    const tag = known.find((t) => t.toLowerCase() === raw)
    if (tag && !selectedTags().includes(tag)) {
      selectedTags().push(tag)
      changed = true
    } else if (!tag) {
      unknown.push(part.trim())
    }
  })
  // Unrecognised pieces stay in the box, in the order they were typed.
  input.value = [...unknown, ...tail].filter(Boolean).join(', ')
  if (changed) {
    renderTagFilter()
    renderList()
  }
}

// The tag picker: every tag not yet selected, shown as clickable chips in a
// panel as wide as the filter bar. It follows what is typed after the last
// comma and stays open while the tag box has focus.
let tagPanelOpen = false

function renderTagSuggestions() {
  const panel = document.getElementById('tag-suggestions')
  const input = document.getElementById('tag-filter')
  panel.hidden = !tagPanelOpen
  if (!tagPanelOpen) return
  const typed = input.value.split(',').pop().trim().toLowerCase()
  const matches = getAllTags().filter(
    (t) => !selectedTags().includes(t) && t.toLowerCase().includes(typed),
  )
  panel.innerHTML = matches.length
    ? matches
        .map(
          (t) =>
            `<button type="button" class="tag-chip tag-pick" data-pick-tag="${escapeHtml(
              t,
            )}">${escapeHtml(t)}</button>`,
        )
        .join('')
    : `<span class="tag-suggestions-empty">${
        typed ? 'No matching tags' : 'No more tags to add'
      }</span>`
}

function setTagPanelOpen(open) {
  tagPanelOpen = open
  renderTagSuggestions()
}

function renderTagFilter() {
  const tags = getAllTags()
  tagSelections[currentView] = selectedTags().filter((t) => tags.includes(t))
  renderTagSuggestions()

  const activeEl = document.getElementById('active-tags')
  activeEl.hidden = selectedTags().length === 0
  activeEl.innerHTML = selectedTags()
    .map(
      (t) =>
        `<span class="active-tag">${escapeHtml(
          t,
        )}<button type="button" data-remove-tag="${escapeHtml(
          t,
        )}" aria-label="Remove tag ${escapeHtml(t)}">×</button></span>`,
    )
    .join('')
  activeEl.querySelectorAll('[data-remove-tag]').forEach((button) => {
    button.addEventListener('click', () => {
      tagSelections[currentView] = selectedTags().filter(
        (t) => t !== button.dataset.removeTag,
      )
      renderTagFilter()
      renderList()
    })
  })
}

// ─── Hex color fields ────────────────────────────────────────────────
// The browser's own color picker may open in RGB or HSL, so each color input
// gets a plain "#rrggbb" box beside it. Both stay in sync; typing a valid hex
// value (3 or 6 digits) updates the color.
function normalizeHex(value) {
  let v = String(value).trim().toLowerCase()
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[0-9a-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  }
  return /^#[0-9a-f]{6}$/.test(v) ? v : ''
}

// Returns the hex text box; the caller places it. `colorInput.syncHex()` must
// be called after setting colorInput.value from code.
function attachHexField(colorInput) {
  const text = document.createElement('input')
  text.type = 'text'
  text.className = 'hex-input'
  text.maxLength = 7
  text.spellcheck = false
  text.autocomplete = 'off'
  text.setAttribute('aria-label', 'Hex color')
  const sync = () => {
    text.value = colorInput.value
  }
  colorInput.syncHex = sync
  sync()
  colorInput.addEventListener('input', sync)
  text.addEventListener('input', () => {
    const hex = normalizeHex(text.value)
    if (!hex) return
    // Wait for the full 6 digits (or a complete 3-digit shorthand on blur).
    if (hex.length === 7 && text.value.replace('#', '').length === 6) {
      colorInput.value = hex
      colorInput.dispatchEvent(new Event('input', { bubbles: true }))
      colorInput.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
  text.addEventListener('blur', () => {
    const hex = normalizeHex(text.value)
    if (hex && hex !== colorInput.value) {
      colorInput.value = hex
      colorInput.dispatchEvent(new Event('input', { bubbles: true }))
      colorInput.dispatchEvent(new Event('change', { bubbles: true }))
    }
    sync() // put back the last valid color if the text was incomplete
  })
  return text
}

// ─── Category colors ──────────────────────────────────────────────────
// Each command platform, script language and term category can have its own
// color, set in Settings. It colors that category's badge and quick filter.
const CATEGORY_COLORS_KEY = 'spellbook_category_colors_v1'
const NEUTRAL_CATEGORY_COLOR = '#8b9bb4'
let categoryColors = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(CATEGORY_COLORS_KEY) || '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
})()

const categoryColorKey = (kind, name) => `${kind}:${String(name).toLowerCase()}`

function getCategoryColor(kind, name) {
  const color = categoryColors[categoryColorKey(kind, name)]
  return /^#[0-9a-f]{6}$/i.test(color || '') ? color : ''
}

function setCategoryColor(kind, name, color) {
  const key = categoryColorKey(kind, name)
  if (color) categoryColors[key] = color
  else delete categoryColors[key]
  try {
    localStorage.setItem(CATEGORY_COLORS_KEY, JSON.stringify(categoryColors))
  } catch {}
}

function getCategoryColors() {
  return { ...categoryColors }
}

// Replaces every category color (used when importing a theme).
function replaceCategoryColors(colors) {
  categoryColors = Object.fromEntries(
    Object.entries(colors && typeof colors === 'object' ? colors : {})
      .filter(
        ([key, value]) =>
          /^(commands|scripts|terms):/.test(key) &&
          /^#[0-9a-f]{6}$/i.test(String(value)),
      )
      .map(([key, value]) => [key, String(value).toLowerCase()]),
  )
  try {
    localStorage.setItem(CATEGORY_COLORS_KEY, JSON.stringify(categoryColors))
  } catch {}
  renderList()
  renderDetail()
}

function clearCategoryColors() {
  categoryColors = {}
  try {
    localStorage.removeItem(CATEGORY_COLORS_KEY)
  } catch {}
  renderList()
  renderDetail()
}

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

// A badge for a platform ('commands'), language ('scripts') or category
// ('terms'), using its custom color when one is set.
function renderBadge(kind, name) {
  if (!name) return ''
  const color = getCategoryColor(kind, name)
  if (color) {
    return `<span class="badge" style="background: ${hexToRgba(color, 0.18)}; color: ${color}">${escapeHtml(name)}</span>`
  }
  const className = kind === 'commands' ? getPlatformBadgeClass(name) : 'custom'
  return `<span class="badge ${className}">${escapeHtml(name)}</span>`
}

// Inline style for a quick-filter button (a colored stripe) when colored.
function filterColorStyle(kind, name) {
  const color = getCategoryColor(kind, name)
  return color ? `style="--cat-color: ${color}"` : ''
}

// Fills the "Category Colors" part of the Settings window.
function renderCategoryColorSettings() {
  const container = document.getElementById('category-colors')
  if (!container) return
  const platforms = [...getPlatformList(true)]
  commands.forEach((c) => {
    if (c.platform && !platforms.some((p) => sameText(p, c.platform))) {
      platforms.push(c.platform)
    }
  })
  const groups = [
    { kind: 'commands', title: 'Command platforms', names: platforms },
    { kind: 'scripts', title: 'Script languages', names: getLangList(true) },
    { kind: 'terms', title: 'Term categories', names: getCategoryList(true) },
  ]
  container.innerHTML = ''
  groups.forEach(({ kind, title, names }) => {
    const heading = document.createElement('h4')
    heading.textContent = title
    container.appendChild(heading)
    if (!names.length) {
      const empty = document.createElement('p')
      empty.className = 'form-hint'
      empty.textContent = 'None yet.'
      container.appendChild(empty)
      return
    }
    const grid = document.createElement('div')
    grid.className = 'settings-grid'
    names.forEach((name) => {
      const row = document.createElement('label')
      const text = document.createElement('span')
      text.textContent = name
      const controls = document.createElement('span')
      controls.className = 'cat-color-controls'
      const input = document.createElement('input')
      input.type = 'color'
      input.value = getCategoryColor(kind, name) || NEUTRAL_CATEGORY_COLOR
      const reset = document.createElement('button')
      reset.type = 'button'
      reset.className = 'filter-remove'
      reset.textContent = '×'
      reset.title = 'Remove custom color'
      reset.hidden = !getCategoryColor(kind, name)
      input.addEventListener('input', () => {
        setCategoryColor(kind, name, input.value)
        reset.hidden = false
        renderList()
      })
      input.addEventListener('change', renderDetail)
      reset.addEventListener('click', (e) => {
        e.preventDefault()
        setCategoryColor(kind, name, '')
        input.value = NEUTRAL_CATEGORY_COLOR
        input.syncHex()
        reset.hidden = true
        renderList()
        renderDetail()
      })
      controls.append(input, attachHexField(input), reset)
      row.append(text, controls)
      grid.appendChild(row)
    })
    container.appendChild(grid)
  })
}

// ─── Resizable table columns ──────────────────────────────────────────
const COLUMN_WIDTH_KEY = 'spellbook_column_widths_v1'
const MIN_COLUMN_WIDTH = 60
// Starting widths, as a share of the table area.
const DEFAULT_COLUMN_SHARES = {
  commands: {
    title: 0.22,
    platform: 0.1,
    tags: 0.22,
    description: 0.38,
    vars: 0.08,
  },
  scripts: { name: 0.22, language: 0.12, tags: 0.2, preview: 0.46 },
  terms: { term: 0.2, category: 0.14, tags: 0.2, definition: 0.46 },
}
let columnWidths = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMN_WIDTH_KEY) || '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
})()

function saveColumnWidths() {
  try {
    localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(columnWidths))
  } catch {}
}

// Gives the freshly rendered table fixed column widths and a drag handle on
// each header cell. `kind` is 'commands' or 'scripts'.
function applyColumnSizing(wrap, kind) {
  const table = wrap.querySelector('table')
  if (!table) return
  const shares = DEFAULT_COLUMN_SHARES[kind]
  const saved = columnWidths[kind] || {}
  const available = Math.max(wrap.clientWidth, 600)
  const headers = [...table.querySelectorAll('th[data-sort]')]
  const colgroup = document.createElement('colgroup')
  const cols = headers.map((th) => {
    const col = document.createElement('col')
    const key = th.dataset.sort
    col.style.width = `${
      saved[key] || Math.round(available * (shares[key] || 0.15))
    }px`
    colgroup.appendChild(col)
    return col
  })
  table.prepend(colgroup)
  const setTableWidth = () => {
    table.style.width = `${cols.reduce(
      (total, col) => total + parseFloat(col.style.width),
      0,
    )}px`
  }
  setTableWidth()

  headers.forEach((th, index) => {
    const handle = document.createElement('span')
    handle.className = 'col-resizer'
    handle.title = 'Drag to resize (double-click to reset)'
    th.appendChild(handle)
    // Using the handle must not sort the column.
    handle.addEventListener('click', (e) => e.stopPropagation())
    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      delete columnWidths[kind]
      saveColumnWidths()
      renderList()
    })
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      handle.setPointerCapture(e.pointerId)
      handle.classList.add('dragging')
      const startX = e.clientX
      const startWidth = parseFloat(cols[index].style.width)
      const move = (event) => {
        const width = Math.max(
          MIN_COLUMN_WIDTH,
          startWidth + event.clientX - startX,
        )
        cols[index].style.width = `${width}px`
        setTableWidth()
      }
      const end = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', end)
        handle.removeEventListener('pointercancel', end)
        handle.classList.remove('dragging')
        columnWidths[kind] = Object.fromEntries(
          headers.map((header, i) => [
            header.dataset.sort,
            parseFloat(cols[i].style.width),
          ]),
        )
        saveColumnWidths()
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', end)
      handle.addEventListener('pointercancel', end)
    })
  })
}

const TABLE_COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'platform', label: 'Platform' },
  { key: 'tags', label: 'Tags' },
  { key: 'description', label: 'Description' },
  { key: 'vars', label: 'Vars' },
]

// What each command column shows; the table only builds the visible ones.
const COMMAND_CELLS = {
  title: (c) => `<td>${highlight(c.title, searchQuery)}</td>`,
  platform: (c) => `<td>${renderBadge('commands', c.platform)}</td>`,
  tags: (c) => `<td>${tagChips(c)}</td>`,
  description: (c) =>
    `<td class="col-desc" title="${escapeHtml(c.description || '')}">${highlight(c.description || '', searchQuery)}</td>`,
  vars: (c) => `<td class="col-vars">${(c.variables || []).length}</td>`,
}

function getSortValue(c, key) {
  if (key === 'tags') return (c.tags || []).join(' ')
  if (key === 'vars') return (c.variables || []).length
  return c[key] || ''
}

function sortCommands(list) {
  return [...list].sort((a, b) => {
    const x = getSortValue(a, sortKey)
    const y = getSortValue(b, sortKey)
    const result =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, {
            numeric: true,
            sensitivity: 'base',
          })
    return result * sortDir
  })
}

// Quick filters are multi-select: clicking one turns it on or off, several can
// be on at once (an entry matching any of them is shown), and All clears them.
function toggleSelection(list, value) {
  return list.some((v) => sameText(v, value))
    ? list.filter((v) => !sameText(v, value))
    : [...list, value]
}

// Marks the buttons inside a quick-filter grid as toggles (for screen readers
// and tooltips). `selector` picks the buttons, e.g. '[data-filter]'.
function markFilterToggles(container, selector, allValue = 'all') {
  container.querySelectorAll(selector).forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.classList.contains('active')))
    const value = btn.dataset.filter ?? btn.dataset.lang ?? btn.dataset.category
    btn.title =
      value === allValue
        ? 'Show everything (clears the selected filters)'
        : 'Click to turn this filter on or off'
  })
}

// ─── Hiding quick filters ─────────────────────────────────────────────
// Any quick filter can be removed in Edit mode. Removing one only hides its
// button: your commands, scripts and terms keep their platform, language or
// category. Hidden filters are listed per section and can be restored.
const HIDDEN_FILTERS_KEY = 'spellbook_hidden_filters_v1'

function getHiddenFilters(kind) {
  try {
    const stored = JSON.parse(localStorage.getItem(HIDDEN_FILTERS_KEY) || '{}')
    const list = stored && stored[kind]
    return Array.isArray(list) ? list.filter((n) => typeof n === 'string') : []
  } catch {
    return []
  }
}

function setHiddenFilters(kind, names) {
  try {
    const stored = JSON.parse(localStorage.getItem(HIDDEN_FILTERS_KEY) || '{}')
    const all = stored && typeof stored === 'object' ? stored : {}
    if (names.length) all[kind] = names
    else delete all[kind]
    if (Object.keys(all).length) {
      localStorage.setItem(HIDDEN_FILTERS_KEY, JSON.stringify(all))
    } else {
      localStorage.removeItem(HIDDEN_FILTERS_KEY)
    }
  } catch {}
}

const isFilterHidden = (kind, name) =>
  getHiddenFilters(kind).some((n) => sameText(n, name))

function hideFilter(kind, name) {
  if (!isFilterHidden(kind, name)) {
    setHiddenFilters(kind, [...getHiddenFilters(kind), name])
  }
}

function unhideFilter(kind, name) {
  setHiddenFilters(
    kind,
    getHiddenFilters(kind).filter((n) => !sameText(n, name)),
  )
}

// While editing, a "Restore removed" button brings hidden filters back.
function addRestoreButton(container, kind, editing) {
  const hidden = getHiddenFilters(kind)
  if (!editing || !hidden.length) return
  const item = document.createElement('div')
  item.className = 'filter-item'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'filter-btn filter-restore'
  button.textContent = `Restore removed (${hidden.length})`
  button.title = hidden.join(', ')
  button.addEventListener('click', () => {
    setHiddenFilters(kind, [])
    renderList()
  })
  item.appendChild(button)
  container.appendChild(item)
}

// ─── Renaming quick filters ───────────────────────────────────────────
// A filter is renamed by renaming it on every entry that uses it (commands,
// their Trash, scripts or terms). Built-in filters keep a small rename map so
// they show under the new name; ones you added are renamed in place.
const FILTER_RENAMES_KEY = 'spellbook_filter_renames_v1'
const FILTER_FIELDS = {
  commands: 'platform',
  scripts: 'language',
  terms: 'category',
}

function getFilterRenames(kind) {
  try {
    const stored = JSON.parse(localStorage.getItem(FILTER_RENAMES_KEY) || '{}')
    const map = stored && stored[kind]
    return map && typeof map === 'object' ? { ...map } : {}
  } catch {
    return {}
  }
}

function setFilterRenames(kind, map) {
  try {
    const stored = JSON.parse(localStorage.getItem(FILTER_RENAMES_KEY) || '{}')
    const all = stored && typeof stored === 'object' ? stored : {}
    if (Object.keys(map).length) all[kind] = map
    else delete all[kind]
    if (Object.keys(all).length) {
      localStorage.setItem(FILTER_RENAMES_KEY, JSON.stringify(all))
    } else {
      localStorage.removeItem(FILTER_RENAMES_KEY)
    }
  } catch {}
}

// The name a built-in filter is shown under.
function builtinFilterName(kind, name) {
  const map = getFilterRenames(kind)
  const key = Object.keys(map).find((k) => sameText(k, name))
  return key ? map[key] : name
}

const swapName = (list, oldName, newName) => {
  const swapped = list.map((n) => (sameText(n, oldName) ? newName : n))
  return swapped.filter(
    (n, i) => swapped.findIndex((m) => sameText(m, n)) === i,
  )
}

// Returns true when something changed. Asks before merging into a filter that
// already has the new name.
function renameFilter(kind, oldName, rawName) {
  const newName = String(rawName).trim().slice(0, 30)
  if (!newName || newName === oldName) return false
  const all = {
    commands: getPlatformList(true),
    scripts: getLangList(true),
    terms: getCategoryList(true),
  }[kind]
  const existing = all.find(
    (n) => sameText(n, newName) && !sameText(n, oldName),
  )
  if (
    existing &&
    !confirm(`"${existing}" already exists. Merge "${oldName}" into it?`)
  ) {
    return false
  }
  const target = existing || newName

  // 1. The entries that use the filter
  const field = FILTER_FIELDS[kind]
  const items =
    kind === 'commands'
      ? [...commands, ...trashedCommands]
      : kind === 'scripts'
        ? scripts
        : terms
  items.forEach((item) => {
    if (sameText(item[field] || '', oldName)) item[field] = target
  })
  if (kind === 'commands') {
    save()
    saveTrash()
    renderTrash()
  } else if (kind === 'scripts') {
    saveScripts()
  } else {
    saveTerms()
  }

  // 2. The filter itself: a built-in (rename map) or one you added
  const builtins = {
    commands: BUILTIN_PLATFORMS,
    scripts: BUILTIN_LANGS,
    terms: [],
  }[kind]
  const map = getFilterRenames(kind)
  const mappedFrom = Object.keys(map).find((k) => sameText(map[k], oldName))
  const builtin = builtins.find((b) => sameText(b, oldName))
  if (mappedFrom) {
    map[mappedFrom] = target
    setFilterRenames(kind, map)
  } else if (builtin) {
    map[builtin] = target
    setFilterRenames(kind, map)
  } else if (kind === 'commands') {
    saveCustomPlatforms(swapName(getCustomPlatforms(), oldName, target))
  } else if (kind === 'scripts') {
    saveCustomLangs(swapName(getCustomLangs(), oldName, target))
  } else {
    saveCustomCategories(swapName(getCustomCategories(), oldName, target))
  }
  setHiddenFilters(kind, swapName(getHiddenFilters(kind), oldName, target))

  // 3. Its color and whether it is switched on
  const color = getCategoryColor(kind, oldName)
  if (color && !getCategoryColor(kind, target))
    setCategoryColor(kind, target, color)
  setCategoryColor(kind, oldName, '')
  currentFilters = swapName(currentFilters, oldName, target)
  currentScriptLangs = swapName(currentScriptLangs, oldName, target)
  currentTermCategories = swapName(currentTermCategories, oldName, target)
  return true
}

// Asks for a new name; used by the pencil button in Edit mode.
function promptRenameFilter(kind, oldName) {
  const name = prompt(`Rename "${oldName}" to:`, oldName)
  if (name === null) return
  if (renameFilter(kind, oldName, name)) {
    renderList()
    renderDetail()
  }
}

// ─── Editing quick filters ────────────────────────────────────────────
// Each section (Commands, Scripts, Terms) has an Edit button. While it is on,
// the quick filters you added (and no entry uses) show a × to remove them.
const filterEditing = { commands: false, scripts: false, terms: false }

// Updates the section's Edit button and returns whether it is in edit mode.
function syncFilterEdit(kind, hasRemovable, container) {
  if (!hasRemovable) filterEditing[kind] = false
  const editing = filterEditing[kind]
  const button = document.getElementById(`btn-filters-edit-${kind}`)
  if (button) {
    button.textContent = editing ? 'Done' : 'Edit'
    button.disabled = !hasRemovable && !editing
    button.title = hasRemovable
      ? 'Rename or remove quick filters'
      : 'There are no quick filters to edit'
  }
  if (container) container.classList.toggle('editing', editing)
  return editing
}

// ─── Quick filters / platform list ──────────────────────────────────────────
const BUILTIN_PLATFORMS = [
  'PowerShell',
  'Bash',
  'CMD',
  'Proxmox',
  'Docker',
  'Kubernetes',
  'Cisco',
  'Kibana',
  'Wireshark',
  'Arkime',
]
const CUSTOM_PLATFORMS_KEY = 'spellbook_custom_os_v1'

function getCustomPlatforms() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CUSTOM_PLATFORMS_KEY) || '[]',
    )
    return Array.isArray(stored)
      ? stored.filter(
          (platform) => typeof platform === 'string' && platform.trim(),
        )
      : []
  } catch {
    return []
  }
}

function saveCustomPlatforms(list) {
  try {
    localStorage.setItem(CUSTOM_PLATFORMS_KEY, JSON.stringify(list))
  } catch {}
}

// Built-in and user-added quick filters only. A platform that appears just in
// the data (for example Windows or Linux commands) gets no button; use + Add
// to create one.
function getPlatformList(includeHidden = false) {
  const list = BUILTIN_PLATFORMS.map((n) => builtinFilterName('commands', n))
  const add = (platform) => {
    if (
      platform &&
      !list.some((o) => o.toLowerCase() === platform.toLowerCase())
    ) {
      list.push(platform)
    }
  }
  getCustomPlatforms().forEach(add)
  return includeHidden
    ? list
    : list.filter((p) => !isFilterHidden('commands', p))
}

function renderPlatformControls() {
  const platformList = getPlatformList()
  currentFilters = currentFilters.filter((p) => platformList.includes(p))
  const filters = document.getElementById('filters')
  const editing = syncFilterEdit('commands', platformList.length > 0, filters)
  filters.innerHTML =
    `<div class="filter-item"><button type="button" class="filter-btn ${
      currentView === 'commands' && currentFilters.length === 0 ? 'active' : ''
    }" data-filter="all">All</button></div>` +
    platformList
      .map((platform) => {
        const removable = editing
        return `<div class="filter-item"><button type="button" class="filter-btn ${
          currentView === 'commands' && currentFilters.includes(platform)
            ? 'active'
            : ''
        }" data-filter="${escapeHtml(platform)}" ${filterColorStyle('commands', platform)}>${escapeHtml(platform)}</button>${
          removable
            ? `<button type="button" class="filter-rename" data-rename-platform="${escapeHtml(
                platform,
              )}" title="Rename this quick filter" aria-label="Rename ${escapeHtml(
                platform,
              )} filter">✎</button><button type="button" class="filter-remove" data-remove-platform="${escapeHtml(
                platform,
              )}" title="Remove this quick filter (Restore removed brings it back)" aria-label="Remove ${escapeHtml(
                platform,
              )} filter">×</button>`
            : ''
        }</div>`
      })
      .join('') +
    `<div class="filter-item"><button type="button" class="filter-btn filter-add" id="btn-add-filter" title="Add a quick filter">+ Add</button></div>`

  addRestoreButton(filters, 'commands', editing)
  markFilterToggles(filters, '[data-filter]')
  filters.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentView = 'commands'
      const value = btn.dataset.filter
      currentFilters =
        value === 'all' ? [] : toggleSelection(currentFilters, value)
      renderList()
      renderDetail()
    })
  })
  filters.querySelectorAll('[data-rename-platform]').forEach((btn) => {
    btn.addEventListener('click', () =>
      promptRenameFilter('commands', btn.dataset.renamePlatform),
    )
  })
  filters.querySelectorAll('[data-remove-platform]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hideFilter('commands', btn.dataset.removePlatform)
      renderList()
    })
  })
  document.getElementById('btn-add-filter').addEventListener('click', () => {
    const name = (
      prompt('Name for the new quick filter (e.g. Kubernetes):') || ''
    ).trim()
    if (!name) return
    unhideFilter('commands', name)
    currentView = 'commands'
    const existing = getPlatformList().find(
      (o) => o.toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      if (!currentFilters.includes(existing)) currentFilters.push(existing)
    } else {
      saveCustomPlatforms([...getCustomPlatforms(), name])
      currentFilters.push(name)
    }
    renderList()
    renderDetail()
  })

  const suggestions = document.getElementById('command-platform-suggestions')
  suggestions.replaceChildren(...getPlatformList(true).map((name) => new Option(name, name)))

}

// Both counters always show: commands and scripts matching the current filters.
// Scripts and terms also track what was added or removed since the last import
// (or since they were first saved), like the commands do.
const BASELINE_KEYS = {
  scripts: 'spellbook_baseline_scripts_v1',
  terms: 'spellbook_baseline_terms_v1',
}
const itemBaselines = { scripts: new Set(), terms: new Set() }

function itemsOf(kind) {
  return kind === 'commands' ? commands : kind === 'scripts' ? scripts : terms
}

// Called once saved scripts and terms are loaded.
function loadItemBaselines() {
  for (const kind of ['scripts', 'terms']) {
    let ids = null
    try {
      const stored = JSON.parse(localStorage.getItem(BASELINE_KEYS[kind]))
      if (Array.isArray(stored))
        ids = stored.filter((id) => typeof id === 'string')
    } catch {}
    if (!ids) {
      ids = itemsOf(kind).map((item) => item.id)
      try {
        localStorage.setItem(BASELINE_KEYS[kind], JSON.stringify(ids))
      } catch {}
    }
    itemBaselines[kind] = new Set(ids)
  }
}

// An import starts a new "since last import" count.
function resetItemBaseline(kind) {
  const ids = itemsOf(kind).map((item) => item.id)
  itemBaselines[kind] = new Set(ids)
  try {
    localStorage.setItem(BASELINE_KEYS[kind], JSON.stringify(ids))
  } catch {}
}

function changeCounts(kind) {
  if (kind === 'commands') return getCommandChangeCounts()
  const items = itemsOf(kind)
  const current = new Set(items.map((item) => item.id))
  const baseline = itemBaselines[kind]
  return {
    added: items.filter((item) => !baseline.has(item.id)).length,
    deleted: [...baseline].filter((id) => !current.has(id)).length,
  }
}

// The count shows everything you have; when filters or a search hide some, it
// also says how many are showing.
// A shown count describes the *active* repository's filter/search state.
// Do not compare shown with total to decide whether a filter is active:
// selecting a category containing every entry (or an empty category) is still
// a real filter. Inactive repositories retain selections for later use but
// must not advertise those selections as currently active.
function hasActiveListFilter(kind) {
  if (kind !== currentView) return false
  const selected = kind === 'commands' ? currentFilters
    : kind === 'scripts' ? currentScriptLangs : currentTermCategories
  return Boolean(selected.length || tagSelections[kind].length || searchQuery)
}

function totalText(kind, total, shown, filtering = false) {
  return countText(kind, total) + (filtering ? ` (${shown} shown)` : '')
}

function updateCounts() {
  const kinds = {
    commands: ['command', getFiltered],
    scripts: ['script', getFilteredScripts],
    terms: ['term', getFilteredTerms],
  }
  for (const [kind, [prefix, getItems]] of Object.entries(kinds)) {
    const filtering = hasActiveListFilter(kind)
    const shown = filtering ? getItems().length : itemsOf(kind).length
    document.getElementById(`${prefix}-total`).textContent = totalText(
      kind,
      itemsOf(kind).length,
      shown,
      filtering,
    )
    const changes = changeCounts(kind)
    document.getElementById(`added-${prefix}-count`).textContent =
      `+${changes.added}`
    document.getElementById(`deleted-${prefix}-count`).textContent =
      `-${changes.deleted}`
  }
}

function renderList() {
  const columnsButton = document.getElementById('btn-columns')
  if (columnsButton) {
    const cards = useListView()
    columnsButton.disabled = cards
    columnsButton.title = cards
      ? 'Columns apply to the table view (not the card list)'
      : 'Show or hide table columns'
  }
  renderPlatformControls()
  renderScriptControls()
  renderTermControls()
  renderTagFilter()
  updateCounts()
  if (currentView === 'terms') {
    renderTermTable()
    return
  }
  if (currentView === 'scripts') {
    renderScriptTable()
    return
  }
  const listEl = document.getElementById('cmd-list')
  const filtered = sortCommands(getFiltered())
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="table-empty">No matches</div>`
    return
  }
  if (useListView()) {
    renderCardList('commands', filtered)
    return
  }
  const head = visibleColumns('commands', TABLE_COLUMNS)
    .map((col) => {
      const sorted = col.key === sortKey
      const arrow = sorted ? (sortDir === 1 ? '▲' : '▼') : ''
      return `<th data-sort="${col.key}" class="${
        sorted ? 'sorted' : ''
      }" aria-sort="${
        sorted ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'
      }">${col.label} <span class="sort-arrow">${arrow}</span></th>`
    })
    .join('')
  const rows = filtered
    .map(
      (c) => `
        <tr class="${c.id === selectedId ? 'active' : ''}" data-id="${escapeHtml(
          c.id,
        )}">
          ${visibleColumns('commands', TABLE_COLUMNS)
            .map((col) => COMMAND_CELLS[col.key](c))
            .join('')}
        </tr>`,
    )
    .join('')
  listEl.innerHTML = `<table class="cmd-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
  applyColumnSizing(listEl, 'commands')
  listEl.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      if (sortKey === th.dataset.sort) sortDir = -sortDir
      else {
        sortKey = th.dataset.sort
        sortDir = 1
      }
      renderList()
    })
  })
  listEl.querySelectorAll('tbody tr').forEach((row) => {
    row.addEventListener('click', () => {
      selectedId = row.dataset.id
      renderList()
      renderDetail()
    })
  })
}

// ─── Render detail ────────────────────────────────────────────────────
function renderDetail() {
  if (currentView === 'terms') {
    renderTermDetail()
    return
  }
  if (currentView === 'scripts') {
    renderScriptDetail()
    return
  }
  const el = document.getElementById('detail')
  const cmd = commands.find((c) => c.id === selectedId)
  if (!cmd) {
    el.innerHTML = `
      <div class="empty-state">
        Select a command from the list or use search.
      </div>
    `
    return
  }
  const templateFields = getTemplateFields(cmd.command)
  const fields = []
  const addedFieldKeys = new Set()
  // Preserve any explicit variable ordering in the command record.
  ;(cmd.variables || []).forEach((variableName) => {
    const templateField = templateFields.find(
      (field) => field.key === variableName,
    )
    if (templateField) {
      fields.push(templateField)
      addedFieldKeys.add(templateField.key)
      return
    }
    // A flag such as [-Append] is now a switch, not a text variable.
    if (
      templateFields.some(
        (field) => field.type === 'toggle' && field.flag === variableName,
      )
    ) {
      return
    }
    // Continue supporting manually added variables that are not in the
    // command template, consistent with the original application behavior.
    fields.push({
      key: `manual-${variableName}`,
      name: variableName,
      type: 'manual',
    })
    addedFieldKeys.add(`manual-${variableName}`)
  })
  // Add all remaining template fields, including dropdowns.
  templateFields.forEach((field) => {
    if (!addedFieldKeys.has(field.key)) {
      fields.push(field)
      addedFieldKeys.add(field.key)
    }
  })
  const getFieldLabel = (field) => {
    if (field.type === 'toggle') {
      return `${escapeHtml(field.flag)} <span style="opacity:0.72">(switch)</span>`
    }
    if (field.type === 'optional') {
      return `[${escapeHtml(field.name)}]`
    }
    if (field.type === 'choice') {
      return `
        ${escapeHtml(field.raw)}
        <span style="opacity:0.72">(select one)</span>
      `
    }
    if (field.type === 'conditionalChoice') {
      return `
        ${escapeHtml(field.raw)}
        <span style="opacity:0.72">(optional group; select one)</span>
      `
    }
    if (field.type === 'conditional') {
      return `
        &lt;${escapeHtml(field.name)}&gt;
        <span style="opacity:0.72">(optional group)</span>
      `
    }
    return `&lt;${escapeHtml(field.name)}&gt;`
  }
  const getFieldControl = (field, index) => {
    if (field.type === 'toggle') {
      return `
        <label class="toggle-control">
          <input type="checkbox" id="var-${index}" data-var="${escapeHtml(field.key)}" />
          include <code>${escapeHtml(field.flag)}</code>
        </label>
      `
    }
    if (field.type === 'choice' || field.type === 'conditionalChoice') {
      return `
        <select
          id="var-${index}"
          data-var="${escapeHtml(field.key)}"
        >
          <option value="">Select an option…</option>
          ${field.options
            .map(
              (option) => `
            <option value="${escapeHtml(option)}">
              ${escapeHtml(option)}
            </option>
          `,
            )
            .join('')}
        </select>
      `
    }
    return `
      <input
        type="text"
        id="var-${index}"
        data-var="${escapeHtml(field.key)}"
        placeholder="${escapeHtml(field.name)}"
      />
    `
  }
  let varsHtml = ''
  if (fields.length) {
    varsHtml = `
      <div class="section">
        <h3>Variables – fill to generate ready-to-run command</h3>
        <div class="vars-grid" id="vars-grid">
          ${fields
            .map(
              (field, index) => `
            <div class="var-field">
              <label for="var-${index}" ${variableDetailFor(cmd, field.name)?.description ? `title="${escapeHtml(variableDetailFor(cmd, field.name).description)}"` : ''}>
                ${getFieldLabel(field)}
                ${variableDetailFor(cmd, field.name)?.type ? `<span class="var-field-type">${escapeHtml(variableDetailFor(cmd, field.name).type)}</span>` : ''}
              </label>
              ${getFieldControl(field, index)}
              ${variableDetailFor(cmd, field.name)?.description ? `<div class="var-field-desc">${escapeHtml(variableDetailFor(cmd, field.name).description)}</div>` : ''}
            </div>
          `,
            )
            .join('')}
        </div>
        <div class="filled-cmd">
          <h3 style="margin-top:1rem">Generated Command</h3>
          <pre class="cmd" id="generated-cmd"><button class="copy-btn" data-target="generated-cmd">Copy</button><code id="generated-code">${highlightCode(
            buildGeneratedCommand(cmd.command),
            codeLanguageFor(cmd.platform),
            { template: true },
          )}</code></pre>
        </div>
      </div>
    `
  }
  el.innerHTML = `
    <h2>${escapeHtml(cmd.title)}</h2>
    <div class="entry-labels">
      ${renderBadge('commands', cmd.platform)}
    </div>
    <div class="entry-tags" id="entry-tags"></div>
    ${
      cmd.description
        ? `
      <div class="section">
        <h3>Description / Use Case</h3>
        <p class="desc">${escapeHtml(cmd.description)}</p>
      </div>
    `
        : ''
    }
    <div class="section">
      <h3>Command Template</h3>
      <pre class="cmd"><button class="copy-btn" data-target="template-cmd">Copy</button><code id="template-cmd">${highlightCode(
        renderCommandTemplate(cmd.command),
        codeLanguageFor(cmd.platform),
        { template: true },
      )}</code></pre>
    </div>
    ${varsHtml}
    ${variableReferenceHtml(cmd)}
    ${
      cmd.example
        ? `
      <div class="section">
        <h3>Example</h3>
        <pre class="cmd"><button class="copy-btn" data-target="example-cmd">Copy</button><code id="example-cmd">${highlightCode(
          cmd.example,
          codeLanguageFor(cmd.platform),
        )}</code></pre>
      </div>
    `
        : ''
    }
    ${
      cmd.notes
        ? `
      <div class="section">
        <h3>Notes</h3>
        <div class="notes">${escapeHtml(cmd.notes)}</div>
      </div>
    `
        : ''
    }
    <div class="detail-actions">
      <button class="btn secondary sm" id="btn-edit">Edit</button>
      <button class="btn danger sm" id="btn-delete">Delete</button>
    </div>
  `
  // ─── Variable live substitution ─────────────────────────────────────
  if (fields.length) {
    const controls = el.querySelectorAll('#vars-grid input, #vars-grid select')
    const updateGeneratedCommand = () => {
      const values = {}
      controls.forEach((control) => {
        values[control.dataset.var] =
          control.type === 'checkbox'
            ? control.checked
              ? '1'
              : ''
            : control.value
      })
      // The highlighter escapes the text; copying still reads textContent, so
      // the command is copied exactly as shown.
      document.getElementById('generated-code').innerHTML = highlightCode(
        buildGeneratedCommand(cmd.command, values),
        codeLanguageFor(cmd.platform),
        { template: true },
      )
    }
    controls.forEach((control) => {
      control.addEventListener('input', updateGeneratedCommand)
      control.addEventListener('change', updateGeneratedCommand)
    })
    updateGeneratedCommand()
  }
  // ─── Copy buttons ───────────────────────────────────────────────────
  el.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target
      const codeEl = document.getElementById(
        targetId === 'generated-cmd' ? 'generated-code' : targetId,
      )
      const text = codeEl ? codeEl.textContent : ''
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!'
        setTimeout(() => {
          btn.textContent = 'Copy'
        }, 1200)
      })
    })
  })
  bindTagEditor(cmd, save)
  document.getElementById('btn-edit').addEventListener('click', () => {
    openModal(cmd)
  })
  document.getElementById('btn-delete').addEventListener('click', () => {
    if (confirm(`Delete "${cmd.title}"?`)) {
      commands = commands.filter((command) => command.id !== cmd.id)
      trashedCommands.push(cmd)
      selectedId = null
      save()
      saveTrash()
      renderTrash()
      renderList()
      renderDetail()
    }
  })
}

// ─── Modal ────────────────────────────────────────────────────────────
function openModal(existing = null) {
  renderPlatformControls()
  document.getElementById('modal-title').textContent = existing
    ? 'Edit Command'
    : 'New Command'
  document.getElementById('edit-id').value = existing ? existing.id : ''
  document.getElementById('f-title').value = existing ? existing.title : ''
  document.getElementById('f-platform').value = existing
    ? existing.platform || ''
    : ''
  tagInputs.commands.set(existing ? existing.tags : [])
  document.getElementById('f-desc').value = existing
    ? existing.description || ''
    : ''
  document.getElementById('f-cmd').value = existing ? existing.command : ''
  variableEditor.set(
    existing ? existing.variables : [],
    existing ? existing.variableDetails : [],
  )
  document.getElementById('f-example').value = existing
    ? existing.example || ''
    : ''
  document.getElementById('f-notes').value = existing
    ? existing.notes || ''
    : ''
  document.getElementById('modal').classList.add('open')
  fitResizableModal(document.getElementById('modal'))
  document.getElementById('f-title').focus()
}

function closeModal() {
  document.getElementById('modal').classList.remove('open')
}

function renderTrash() {
  const list = document.getElementById('trash-list')
  document.getElementById('trash-count').textContent = trashedCommands.length
  document.getElementById('btn-empty-trash').disabled =
    trashedCommands.length === 0
  if (trashedCommands.length === 0) {
    list.innerHTML = `<div class="empty-state">Trash is empty.</div>`
    return
  }
  list.innerHTML = trashedCommands
    .map(
      (cmd) => `
        <div class="trash-item">
          <div class="trash-item-info">
            <strong>${escapeHtml(cmd.title || 'Untitled command')}</strong>
            ${renderBadge('commands', cmd.platform || 'Unknown')}
          </div>
          <div class="trash-item-actions">
            <button type="button" class="btn secondary sm" data-restore-id="${escapeHtml(
              cmd.id,
            )}">Restore</button>
            <button type="button" class="btn danger sm" data-delete-id="${escapeHtml(
              cmd.id,
            )}">Delete forever</button>
          </div>
        </div>
      `,
    )
    .join('')
  list.querySelectorAll('[data-restore-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = trashedCommands.findIndex(
        (cmd) => cmd.id === button.dataset.restoreId,
      )
      if (index < 0) return
      const [command] = trashedCommands.splice(index, 1)
      if (commands.some((cmd) => cmd.id === command.id)) {
        command.id = generateCommandId(command.platform, [
          ...commands,
          ...trashedCommands,
        ])
      }
      commands.push(command)
      selectedId = command.id
      save()
      saveTrash()
      renderTrash()
      renderList()
      renderDetail()
    })
  })
  list.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const command = trashedCommands.find(
        (cmd) => cmd.id === button.dataset.deleteId,
      )
      if (!command || !confirm(`Permanently delete "${command.title}"?`)) return
      trashedCommands = trashedCommands.filter((cmd) => cmd.id !== command.id)
      saveTrash()
      renderTrash()
    })
  })
}

function openTrash() {
  renderTrash()
  document.getElementById('trash-modal').classList.add('open')
}

function closeTrash() {
  document.getElementById('trash-modal').classList.remove('open')
}

// ─── Events ───────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim()
  renderList()
})

const tagInput = document.getElementById('tag-filter')
tagInput.addEventListener('input', () => {
  commitTagInput(tagInput)
  renderTagSuggestions()
})
tagInput.addEventListener('focus', () => setTagPanelOpen(true))
tagInput.addEventListener('blur', () => setTagPanelOpen(false))
const tagPanel = document.getElementById('tag-suggestions')
// Keep focus in the tag box while a chip is pressed, so the panel stays open.
tagPanel.addEventListener('mousedown', (e) => e.preventDefault())
tagPanel.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-pick-tag]')
  if (!chip) return
  const tag = chip.dataset.pickTag
  if (!selectedTags().includes(tag)) selectedTags().push(tag)
  tagInput.value = ''
  renderTagFilter()
  renderList()
})
tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setTagPanelOpen(false)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    commitTagInput(tagInput, true)
  } else if (
    e.key === 'Backspace' &&
    !tagInput.value &&
    selectedTags().length
  ) {
    selectedTags().pop()
    renderTagFilter()
    renderList()
  }
})
document.getElementById('btn-add').addEventListener('click', () => openModal())
document.getElementById('btn-trash').addEventListener('click', openTrash)
document.getElementById('btn-trash-close').addEventListener('click', closeTrash)

document.getElementById('trash-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('trash-modal')) closeTrash()
})

document.getElementById('btn-empty-trash').addEventListener('click', () => {
  if (
    trashedCommands.length &&
    confirm(
      `Permanently delete all ${trashedCommands.length} trashed commands?`,
    )
  ) {
    trashedCommands = []
    saveTrash()
    renderTrash()
  }
})
document.getElementById('btn-readme').addEventListener('click', openReadme)
document
  .getElementById('btn-readme-close')
  .addEventListener('click', closeReadme)

document.getElementById('readme-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('readme-modal')) closeReadme()
})

document.getElementById('btn-cancel').addEventListener('click', closeModal)

document.getElementById('cmd-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const title = document.getElementById('f-title').value.trim()
  const typedPlatform = document.getElementById('f-platform').value.trim()
  const platform = getPlatformList(true).find((p) => sameText(p, typedPlatform)) || typedPlatform
  if (!platform) return
  if (!getPlatformList(true).some((p) => sameText(p, platform))) {
    saveCustomPlatforms([...getCustomPlatforms(), platform])
  }
  const existingId = document.getElementById('edit-id').value
  const id =
    existingId || generateCommandId(platform, [...commands, ...trashedCommands])
  const tags = tagInputs.commands.get()
  const description = document.getElementById('f-desc').value.trim()
  const command = document.getElementById('f-cmd').value.trim()
  const editorVars = variableEditor.get()
  const variables = editorVars.names.length
    ? editorVars.names
    : extractPlaceholders(command)
  const variableDetails = editorVars.details
  const example = document.getElementById('f-example').value.trim()
  const notes = document.getElementById('f-notes').value.trim()
  const entry = {
    id,
    title,
    platform,
    tags,
    description,
    command,
    variables,
    variableDetails,
    example,
    notes,
  }
  const idx = commands.findIndex((c) => c.id === id)
  if (idx >= 0) {
    commands[idx] = entry
  } else {
    commands.push(entry)
  }
  selectedId = id
  save()
  closeModal()
  renderPlatformControls()
  renderList()
  renderDetail()
})

// ─── CSV import helpers ───────────────────────────────────────────────
// Parses RFC 4180 style CSV (quoted fields, doubled quotes, embedded commas
// and newlines) into an array of rows.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const source = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (inQuotes) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (inQuotes) throw new Error('CSV has an unterminated quoted field.')
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// Turns CSV text into objects keyed by the (lowercased) header names.
function parseCsvRecords(text) {
  const [header, ...rows] = parseCsv(text)
  if (!header) throw new Error('The CSV file is empty.')
  const keys = header.map((h) => h.trim().toLowerCase())
  return rows.map((cells) => {
    const record = {}
    keys.forEach((key, index) => {
      if (key) record[key] = cells[index] === undefined ? '' : cells[index]
    })
    return record
  })
}

const splitCsvList = (value) =>
  String(value || '')
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)

// Columns: id (optional), title, platform (or os), tags, description, command, variables,
// example, notes. Tags and variables are separated by commas or semicolons.
// The field names of the columns a CSV row actually has ("os" means platform).
// The "variable_details" CSV column holds the details as JSON text.
function parseVariableDetailsCell(cell) {
  if (!cell || !String(cell).trim()) return []
  try {
    return sanitizeVariableDetails(JSON.parse(cell))
  } catch {
    return []
  }
}

const csvColumns = (record) =>
  Object.keys(record).map((key) =>
    key === 'os'
      ? 'platform'
      : key === 'variable_details'
        ? 'variableDetails'
        : key,
  )

function commandsFromCsv(text) {
  const used = []
  const records = parseCsvRecords(text)
  return records.map((record, index) => {
    const rowNumber = index + 2
    const title = (record.title || '').trim()
    // Accepts the older "os" column name as well as "platform".
    const platform = (record.platform || record.os || '').trim()
    const command = (record.command || '').trim()
    if (!title || !platform || !command) {
      throw new Error(
        `CSV row ${rowNumber} needs a title, platform and command (columns: id, title, platform, tags, description, command, variables, example, notes).`,
      )
    }
    let id = (record.id || '').trim()
    if (!id) {
      id = generateCommandId(platform, [
        ...commands,
        ...trashedCommands,
        ...used,
      ])
    }
    const variables = splitCsvList(record.variables)
    const entry = {
      id,
      title,
      platform,
      tags: [...new Set(splitCsvList(record.tags).map((t) => t.toLowerCase()))],
      description: (record.description || '').trim(),
      command,
      variables: variables.length ? variables : extractPlaceholders(command),
      variableDetails: parseVariableDetailsCell(record.variable_details),
      example: (record.example || '').trim(),
      notes: (record.notes || '').trim(),
      _cols: csvColumns(record),
    }
    used.push(entry)
    return entry
  })
}

// Columns: id (optional), name, language, body, notes (optional).
function scriptsFromCsv(text) {
  return parseCsvRecords(text).map((record, index) => {
    if (!(record.name || '').trim() || !(record.body || '').trim()) {
      throw new Error(
        `CSV row ${index + 2} needs a name and body (columns: id, name, language, tags, body, notes).`,
      )
    }
    return {
      id: (record.id || '').trim(),
      name: record.name.trim(),
      language: (record.language || '').trim(),
      tags: cleanTags(record.tags),
      body: record.body,
      notes: (record.notes || '').trim(),
      _cols: csvColumns(record),
    }
  })
}

// ─── Export helpers ───────────────────────────────────────────────────
function downloadFile(fileName, contents, type) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

const csvCell = (value) => {
  const text = String(value === undefined || value === null ? '' : value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// The leading BOM lets Excel read the file as UTF-8.
function toCsv(columns, rows) {
  const lines = [columns.join(',')]
  rows.forEach((row) => lines.push(row.map(csvCell).join(',')))
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

function commandsToCsv(list) {
  return toCsv(
    [
      'id',
      'title',
      'platform',
      'tags',
      'description',
      'command',
      'variables',
      'variable_details',
      'example',
      'notes',
    ],
    list.map((c) => [
      c.id,
      c.title,
      c.platform,
      (c.tags || []).join('; '),
      c.description,
      c.command,
      (c.variables || []).join('; '),
      c.variableDetails && c.variableDetails.length
        ? JSON.stringify(c.variableDetails)
        : '',
      c.example,
      c.notes,
    ]),
  )
}

function scriptsToCsv(list) {
  return toCsv(
    ['id', 'name', 'language', 'tags', 'body', 'notes'],
    list.map((s) => [
      s.id,
      s.name,
      s.language,
      (s.tags || []).join('; '),
      s.body,
      s.notes,
    ]),
  )
}

// Small popup menu under a button; closes on pick, outside click or Esc.
function showExportMenu(anchor, options) {
  document.querySelectorAll('.export-menu').forEach((m) => m.remove())
  const menu = document.createElement('div')
  menu.className = 'export-menu'
  const rect = anchor.getBoundingClientRect()
  menu.style.top = `${rect.bottom + 4}px`
  menu.style.right = `${Math.max(4, window.innerWidth - rect.right)}px`
  const close = () => {
    menu.remove()
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
  }
  const onOutside = (e) => {
    if (!menu.contains(e.target)) close()
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close()
  }
  options.forEach(({ label, run }) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.textContent = label
    item.addEventListener('click', () => {
      close()
      run()
    })
    menu.appendChild(item)
  })
  document.body.appendChild(menu)
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  menu.querySelector('button').focus()
}

// ─── Import / Export ─────────────────────────────────────────────────
// Browsers cannot silently overwrite data/commands.js on disk. Import replaces
// the active Spell Book dataset in this browser; Export produces a replacement
// commands.txt with the same assignment syntax as data/commands.js.
// Button ids btn-import, btn-export, btn-scripts-import/export, and
// btn-terms-import/export enter this section from index.html.
const importFile = document.getElementById('import-file')

document.getElementById('btn-import').addEventListener('click', () => {
  importFile.value = ''
  importFile.click()
})

importFile.addEventListener('change', async () => {
  const file = importFile.files && importFile.files[0]
  if (!file) return
  try {
    const text = await file.text()
    let imported
    if (file.name.toLowerCase().endsWith('.json')) {
      imported = JSON.parse(text)
    } else if (file.name.toLowerCase().endsWith('.csv')) {
      imported = commandsFromCsv(text)
    } else {
      // Accept the exact TXT format exported by this Spell Book:
      // window.SPELLBOOK_COMMANDS = [ ... ];
      const match = text.match(
        /window\.SPELLBOOK_COMMANDS\s*=\s*([\s\S]*?)\s*;?\s*$/,
      )
      if (!match)
        throw new Error(
          'This .txt file does not define window.SPELLBOOK_COMMANDS.',
        )
      imported = JSON.parse(match[1])
    }
    if (!Array.isArray(imported))
      throw new Error('Imported data must be an array of commands.')
    if (
      !imported.every(
        (c) =>
          c &&
          typeof c === 'object' &&
          c.id &&
          c.title &&
          (c.platform || c.os) &&
          typeof c.command === 'string',
      )
    ) {
      throw new Error(
        'One or more command entries are missing required fields.',
      )
    }
    openImportManager('commands', file.name, imported.map(cleanImportedCommand))
  } catch (err) {
    alert('Import failed: ' + err.message)
  }
})

document.getElementById('btn-export').addEventListener('click', (e) => {
  showExportMenu(e.currentTarget, [
    {
      label: 'JSON (commands.json)',
      run: () =>
        downloadFile(
          'commands.json',
          JSON.stringify(commands, null, 2) + '\n',
          'application/json;charset=utf-8',
        ),
    },
    {
      label: 'CSV (commands.csv)',
      run: () =>
        downloadFile(
          'commands.csv',
          commandsToCsv(commands),
          'text/csv;charset=utf-8',
        ),
    },
  ])
})

// Keyboard: Esc closes open dialogs. Slash and A are intentionally guarded so
// typing in a form field never triggers navigation or a new-record modal.
function closeQuickCreate() {
  document.getElementById('quick-create-modal').classList.remove('open')
}
function openQuickCreate() {
  document.getElementById('quick-create-modal').classList.add('open')
  document.querySelector('[data-create-kind="commands"]').focus()
}
function chooseQuickCreate(kind) {
  closeQuickCreate()
  if (kind === 'commands') openModal()
  if (kind === 'scripts') openScriptModal()
  if (kind === 'terms') openTermModal()
}
document.querySelectorAll('[data-create-kind]').forEach((button) =>
  button.addEventListener('click', () => chooseQuickCreate(button.dataset.createKind))
)
document.getElementById('quick-create-cancel').addEventListener('click', closeQuickCreate)
document.getElementById('quick-create-modal').addEventListener('click', (event) => {
  if (event.target.id === 'quick-create-modal') closeQuickCreate()
})
document.getElementById('quick-create-modal').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); closeQuickCreate(); return }
  if (event.ctrlKey || event.altKey || event.metaKey || event.target.matches('input,textarea')) return
  const kind = { c: 'commands', s: 'scripts', t: 'terms' }[event.key.toLowerCase()]
  if (kind) { event.preventDefault(); chooseQuickCreate(kind) }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal()
    closeSettings()
    closeReadme()
    closeTrash()
    closeImportManager()
    closeScriptModal()
    closeTermModal()
    closeQuickCreate()
    return
  }
  if (document.querySelector('.modal-overlay.open')) return
  if (currentPage !== 'spellbook') return
  const key = e.key.toLowerCase()
  const targetIsEditable =
    e.target instanceof Element &&
    e.target.closest("input, textarea, select, [contenteditable='true']")
  if (
    key === '/' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.shiftKey &&
    !targetIsEditable
  ) {
    e.preventDefault()
    document.getElementById('search').focus()
  } else if (
    key === 'a' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.shiftKey &&
    !targetIsEditable
  ) {
    e.preventDefault()
    openQuickCreate()
  }
})

// ─── Resizable table / detail split ───────────────────────────────────
// The table and the details sit one above the other, or side by side (see
// Settings → Appearance, or the button beside Columns). Drag the bar between
// them to resize; the size is remembered separately for each arrangement.
;(() => {
  const HEIGHT_KEY = 'spellbook_split_v1'
  const WIDTH_KEY = 'spellbook_split_w_v1'
  const page = document.getElementById('page-spellbook')
  const splitter = document.getElementById('splitter')
  const table = document.getElementById('cmd-list')
  const main = document.querySelector('.main')
  const MIN_HEIGHT = 80
  const MIN_WIDTH = 260
  const side = () => page.dataset.panes === 'side'
  const storageKey = () => (side() ? WIDTH_KEY : HEIGHT_KEY)
  const available = () => (side() ? main.clientWidth : main.clientHeight)
  const currentSize = () => (side() ? table.offsetWidth : table.offsetHeight)
  const clamp = (px) => {
    if (side()) {
      const room = main.clientWidth - splitter.offsetWidth
      return Math.max(MIN_WIDTH, Math.min(px, room - MIN_WIDTH))
    }
    const room = main.clientHeight - table.offsetTop + main.offsetTop
    return Math.max(
      MIN_HEIGHT,
      Math.min(px, room - splitter.offsetHeight - MIN_HEIGHT),
    )
  }
  const setSize = (px, persist = true) => {
    if (!available()) return // Spell Book page is not showing
    const size = clamp(px)
    table.style.flexBasis = `${size}px`
    if (persist) {
      try {
        localStorage.setItem(storageKey(), String(size))
      } catch {}
    }
  }
  // Applies the saved size for the current arrangement (or the default).
  const restoreSplit = () => {
    table.style.flexBasis = ''
    if (page.dataset.tableDock === 'control') return // docked: no main split
    splitter.setAttribute(
      'aria-orientation',
      side() ? 'vertical' : 'horizontal',
    )
    try {
      const saved = Number.parseFloat(localStorage.getItem(storageKey()))
      if (saved > 0) setSize(saved, false)
    } catch {}
  }
  restoreSplit()
  window.restoreSplitHeight = restoreSplit

  splitter.addEventListener('pointerdown', (e) => {
    splitter.setPointerCapture(e.pointerId)
    splitter.classList.add('dragging')
    document.body.style.userSelect = 'none'
  })
  splitter.addEventListener('pointermove', (e) => {
    if (!splitter.hasPointerCapture(e.pointerId)) return
    const rect = table.getBoundingClientRect()
    setSize(side() ? e.clientX - rect.left : e.clientY - rect.top)
  })
  const endDrag = (e) => {
    if (splitter.hasPointerCapture(e.pointerId)) {
      splitter.releasePointerCapture(e.pointerId)
    }
    splitter.classList.remove('dragging')
    document.body.style.userSelect = ''
  }
  splitter.addEventListener('pointerup', endDrag)
  splitter.addEventListener('pointercancel', endDrag)
  splitter.addEventListener('keydown', (e) => {
    const [less, more] = side()
      ? ['ArrowLeft', 'ArrowRight']
      : ['ArrowUp', 'ArrowDown']
    if (e.key !== less && e.key !== more) return
    e.preventDefault()
    const step = e.shiftKey ? 80 : 20
    setSize(currentSize() + (e.key === less ? -step : step))
  })
  splitter.addEventListener('dblclick', () => {
    table.style.flexBasis = ''
    try {
      localStorage.removeItem(storageKey())
    } catch {}
  })
  // Keep the saved size valid when the window shrinks.
  window.addEventListener('resize', () => {
    if (table.style.flexBasis) setSize(currentSize(), false)
  })
})()

// ─── Script repository ────────────────────────────────────────────────
const SCRIPTS_KEY = 'spellbook_scripts_v1'
let scripts = []

function loadScripts() {
  try {
    const stored = JSON.parse(localStorage.getItem(SCRIPTS_KEY) || '[]')
    scripts = Array.isArray(stored)
      ? stored.filter(
          (s) => s && typeof s.name === 'string' && typeof s.body === 'string',
        )
      : []
  } catch {
    scripts = []
  }
}

function saveScripts() {
  try {
    localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts))
  } catch {
    alert('Could not save scripts: browser storage is unavailable or full.')
  }
}

function newScriptId() {
  return `script-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

const BUILTIN_LANGS = ['Bash', 'PowerShell', 'Python', 'Batch', 'SQL']
const CUSTOM_LANGS_KEY = 'spellbook_custom_langs_v1'
let currentScriptLangs = [] // selected language quick filters; empty = All
let selectedScriptId = null
let scriptSortKey = 'name'
let scriptSortDir = 1

function getCustomLangs() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_LANGS_KEY) || '[]')
    return Array.isArray(stored)
      ? stored.filter((l) => typeof l === 'string' && l.trim())
      : []
  } catch {
    return []
  }
}

function saveCustomLangs(list) {
  try {
    localStorage.setItem(CUSTOM_LANGS_KEY, JSON.stringify(list))
  } catch {}
}

const sameText = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()

// Built-ins, user-added languages, and any language found in saved scripts.
function getLangList(includeHidden = false) {
  const list = BUILTIN_LANGS.map((n) => builtinFilterName('scripts', n))
  const add = (lang) => {
    if (lang && !list.some((l) => sameText(l, lang))) list.push(lang)
  }
  getCustomLangs().forEach(add)
  scripts.forEach((s) => add(s.language))
  return includeHidden
    ? list
    : list.filter((l) => !isFilterHidden('scripts', l))
}

function renderScriptControls() {
  const langs = getLangList()
  currentScriptLangs = currentScriptLangs.filter((l) => langs.includes(l))
  const isActive = (lang) =>
    currentView === 'scripts' &&
    (lang === 'all'
      ? currentScriptLangs.length === 0
      : currentScriptLangs.includes(lang))
  const list = document.getElementById('scripts-list')
  const editing = syncFilterEdit('scripts', langs.length > 0, list)
  list.innerHTML =
    [`all`, ...langs]
      .map((lang) => {
        const removable = editing && lang !== 'all'
        return `<div class="filter-item"><button type="button" class="filter-btn ${
          isActive(lang) ? 'active' : ''
        }" data-lang="${escapeHtml(lang)}" ${lang === 'all' ? '' : filterColorStyle('scripts', lang)}>${
          lang === 'all' ? 'All' : escapeHtml(lang)
        }</button>${
          removable
            ? `<button type="button" class="filter-rename" data-rename-lang="${escapeHtml(
                lang,
              )}" title="Rename this quick filter" aria-label="Rename ${escapeHtml(
                lang,
              )} filter">✎</button><button type="button" class="filter-remove" data-remove-lang="${escapeHtml(
                lang,
              )}" title="Remove this quick filter (Restore removed brings it back)" aria-label="Remove ${escapeHtml(
                lang,
              )} filter">×</button>`
            : ''
        }</div>`
      })
      .join('') +
    `<div class="filter-item"><button type="button" class="filter-btn filter-add" id="btn-add-lang" title="Add a language quick filter">+ Add</button></div>`

  addRestoreButton(list, 'scripts', editing)
  markFilterToggles(list, '[data-lang]')
  list.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentView = 'scripts'
      const value = btn.dataset.lang
      currentScriptLangs =
        value === 'all' ? [] : toggleSelection(currentScriptLangs, value)
      renderList()
      renderDetail()
    })
  })
  list.querySelectorAll('[data-rename-lang]').forEach((btn) => {
    btn.addEventListener('click', () =>
      promptRenameFilter('scripts', btn.dataset.renameLang),
    )
  })
  list.querySelectorAll('[data-remove-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hideFilter('scripts', btn.dataset.removeLang)
      renderList()
    })
  })
  document.getElementById('btn-add-lang').addEventListener('click', () => {
    const name = (
      prompt('Name for the new script quick filter (e.g. Ruby):') || ''
    ).trim()
    if (!name) return
    unhideFilter('scripts', name)
    const existing = getLangList().find((l) => sameText(l, name))
    if (existing) {
      if (!currentScriptLangs.includes(existing)) {
        currentScriptLangs.push(existing)
      }
    } else {
      saveCustomLangs([...getCustomLangs(), name])
      currentScriptLangs.push(name)
    }
    currentView = 'scripts'
    renderList()
    renderDetail()
  })

  document.getElementById('script-languages').innerHTML = getLangList(true)
    .map((l) => `<option value="${escapeHtml(l)}"></option>`)
    .join('')
}

const SCRIPT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'language', label: 'Language' },
  { key: 'tags', label: 'Tags' },
  { key: 'preview', label: 'Preview' },
]

const SCRIPT_CELLS = {
  name: (s) => `<td>${highlight(s.name, searchQuery)}</td>`,
  language: (s) =>
    `<td>${s.language ? renderBadge('scripts', s.language) : ''}</td>`,
  tags: (s) => `<td>${tagChips(s)}</td>`,
  preview: (s) =>
    `<td class="col-desc">${escapeHtml(getScriptPreview(s))}</td>`,
}

function getScriptPreview(script) {
  return (
    script.body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || ''
  )
}

function getFilteredScripts() {
  let list = scripts
  if (currentScriptLangs.length) {
    list = list.filter((s) =>
      currentScriptLangs.some((l) => sameText(l, s.language || '')),
    )
  }
  if (tagSelections.scripts.length) {
    list = list.filter((s) => hasAllTags(s, tagSelections.scripts))
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    list = list.filter((s) =>
      [s.name, s.language, (s.tags || []).join(' '), s.body, s.notes]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }
  return [...list].sort((a, b) => {
    const value = (s) =>
      scriptSortKey === 'preview'
        ? getScriptPreview(s)
        : String(s[scriptSortKey] || '')
    return (
      value(a).localeCompare(value(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      }) * scriptSortDir
    )
  })
}

function renderScriptTable() {
  const listEl = document.getElementById('cmd-list')
  const filtered = getFilteredScripts()
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="table-empty">${
      scripts.length ? 'No matches' : 'No saved scripts yet. Use + New Script.'
    }</div>`
    return
  }
  if (useListView()) {
    renderCardList('scripts', filtered)
    return
  }
  const head = visibleColumns('scripts', SCRIPT_COLUMNS)
    .map((col) => {
      const sorted = col.key === scriptSortKey
      const arrow = sorted ? (scriptSortDir === 1 ? '▲' : '▼') : ''
      return `<th data-sort="${col.key}" class="${
        sorted ? 'sorted' : ''
      }" aria-sort="${
        sorted ? (scriptSortDir === 1 ? 'ascending' : 'descending') : 'none'
      }">${col.label} <span class="sort-arrow">${arrow}</span></th>`
    })
    .join('')
  const rows = filtered
    .map(
      (s) => `
        <tr class="${s.id === selectedScriptId ? 'active' : ''}" data-id="${escapeHtml(
          s.id,
        )}">
          ${visibleColumns('scripts', SCRIPT_COLUMNS)
            .map((col) => SCRIPT_CELLS[col.key](s))
            .join('')}
        </tr>`,
    )
    .join('')
  listEl.innerHTML = `<table class="cmd-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
  applyColumnSizing(listEl, 'scripts')
  listEl.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      if (scriptSortKey === th.dataset.sort) scriptSortDir = -scriptSortDir
      else {
        scriptSortKey = th.dataset.sort
        scriptSortDir = 1
      }
      renderList()
    })
  })
  listEl.querySelectorAll('tbody tr').forEach((row) => {
    row.addEventListener('click', () => {
      selectedScriptId = row.dataset.id
      renderList()
      renderDetail()
    })
  })
}

function renderScriptDetail() {
  const el = document.getElementById('detail')
  const script = scripts.find((s) => s.id === selectedScriptId)
  if (!script) {
    el.innerHTML = `
      <div class="empty-state">
        Select a script from the list or use search.
      </div>
    `
    return
  }
  el.innerHTML = `
    <h2>${escapeHtml(script.name)}</h2>
    <div class="entry-labels">
      ${script.language ? renderBadge('scripts', script.language) : ''}
    </div>
    <div class="entry-tags" id="entry-tags"></div>
    <div class="section">
      <h3>Script</h3>
      <pre class="cmd"><button class="copy-btn">Copy</button><code id="script-code"></code></pre>
    </div>
    ${
      script.notes
        ? `<div class="section"><h3>Notes</h3><div class="notes" id="script-notes-text" style="white-space: pre-wrap"></div></div>`
        : ''
    }
    <div class="detail-actions">
      <button class="btn secondary sm" id="btn-script-edit">Edit</button>
      <button class="btn danger sm" id="btn-script-remove">Delete</button>
    </div>
  `
  // textContent keeps the script literal and safe.
  bindTagEditor(script, saveScripts)
  // Highlighted for display; Copy uses the script text itself.
  document.getElementById('script-code').innerHTML = highlightCode(
    script.body,
    script.language,
  )
  if (script.notes) {
    document.getElementById('script-notes-text').textContent = script.notes
  }
  const copyButton = el.querySelector('.copy-btn')
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(script.body).then(() => {
      copyButton.textContent = 'Copied!'
      setTimeout(() => {
        copyButton.textContent = 'Copy'
      }, 1200)
    })
  })
  document
    .getElementById('btn-script-edit')
    .addEventListener('click', () => openScriptModal(script))
  document
    .getElementById('btn-script-remove')
    .addEventListener('click', () => deleteScript(script.id))
}

function deleteScript(id) {
  const script = scripts.find((s) => s.id === id)
  if (!script || !confirm(`Delete script "${script.name}"?`)) return
  scripts = scripts.filter((s) => s.id !== id)
  if (selectedScriptId === id) selectedScriptId = null
  saveScripts()
  renderList()
  renderDetail()
  closeScriptModal()
}

function openScriptModal(existing = null) {
  document.getElementById('script-modal-title').textContent = existing
    ? 'Edit Script'
    : 'New Script'
  document.getElementById('script-id').value = existing ? existing.id : ''
  document.getElementById('script-name').value = existing ? existing.name : ''
  document.getElementById('script-language').value = existing
    ? existing.language || ''
    : ''
  tagInputs.scripts.set(existing ? existing.tags : [])
  document.getElementById('script-body').value = existing ? existing.body : ''
  document.getElementById('script-notes').value = existing
    ? existing.notes || ''
    : ''
  document.getElementById('btn-script-delete').hidden = !existing
  document.getElementById('script-modal').classList.add('open')
  fitResizableModal(document.getElementById('script-modal'))
  document.getElementById('script-name').focus()
}

function closeScriptModal() {
  document.getElementById('script-modal').classList.remove('open')
}

document
  .getElementById('btn-script-new')
  .addEventListener('click', () => openScriptModal())
document
  .getElementById('btn-script-cancel')
  .addEventListener('click', closeScriptModal)

document.getElementById('script-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const id = document.getElementById('script-id').value || newScriptId()
  if (!document.getElementById('script-language').value.trim()) return
  const entry = {
    id,
    name: document.getElementById('script-name').value.trim(),
    language: document.getElementById('script-language').value.trim(),
    tags: tagInputs.scripts.get(),
    body: document.getElementById('script-body').value,
    notes: document.getElementById('script-notes').value.trim(),
  }
  const index = scripts.findIndex((s) => s.id === id)
  if (index >= 0) scripts[index] = entry
  else scripts.push(entry)
  saveScripts()
  selectedScriptId = id
  currentView = 'scripts'
  if (
    currentScriptLangs.length &&
    !currentScriptLangs.some((l) => sameText(l, entry.language))
  ) {
    currentScriptLangs = []
  }
  renderList()
  renderDetail()
  closeScriptModal()
})

document
  .getElementById('btn-script-delete')
  .addEventListener('click', () =>
    deleteScript(document.getElementById('script-id').value),
  )

document.getElementById('btn-script-copy').addEventListener('click', (e) => {
  const button = e.currentTarget
  navigator.clipboard
    .writeText(document.getElementById('script-body').value)
    .then(() => {
      button.textContent = 'Copied!'
      setTimeout(() => {
        button.textContent = 'Copy'
      }, 1200)
    })
})

document.getElementById('btn-scripts-export').addEventListener('click', (e) => {
  showExportMenu(e.currentTarget, [
    {
      label: 'JSON (scripts.json)',
      run: () =>
        downloadFile(
          'scripts.json',
          JSON.stringify(scripts, null, 2) + '\n',
          'application/json;charset=utf-8',
        ),
    },
    {
      label: 'CSV (scripts.csv)',
      run: () =>
        downloadFile(
          'scripts.csv',
          scriptsToCsv(scripts),
          'text/csv;charset=utf-8',
        ),
    },
  ])
})

const scriptsImportFile = document.getElementById('scripts-import-file')
document.getElementById('btn-scripts-import').addEventListener('click', () => {
  scriptsImportFile.value = ''
  scriptsImportFile.click()
})
scriptsImportFile.addEventListener('change', async () => {
  const file = scriptsImportFile.files && scriptsImportFile.files[0]
  if (!file) return
  try {
    const text = await file.text()
    const imported = file.name.toLowerCase().endsWith('.csv')
      ? scriptsFromCsv(text)
      : JSON.parse(text)
    if (
      !Array.isArray(imported) ||
      !imported.every(
        (s) => s && typeof s.name === 'string' && typeof s.body === 'string',
      )
    ) {
      throw new Error('Expected an array of scripts with a name and body.')
    }
    openImportManager('scripts', file.name, imported.map(cleanImportedScript))
  } catch (err) {
    alert('Script import failed: ' + err.message)
  }
})

// ─── Terms (glossary) ─────────────────────────────────────────────────
const TERMS_KEY = 'spellbook_terms_v1'
const CUSTOM_CATEGORIES_KEY = 'spellbook_custom_categories_v1'
let terms = []
let currentTermCategories = [] // selected category quick filters; empty = All
let selectedTermId = null
let termSortKey = 'term'
let termSortDir = 1

function loadTerms() {
  try {
    const stored = JSON.parse(localStorage.getItem(TERMS_KEY) || '[]')
    terms = Array.isArray(stored)
      ? stored.filter(
          (t) =>
            t && typeof t.term === 'string' && typeof t.definition === 'string',
        )
      : []
  } catch {
    terms = []
  }
}

function saveTerms() {
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify(terms))
  } catch {
    alert('Could not save terms: browser storage is unavailable or full.')
  }
}

function newTermId() {
  return `term-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

function getCustomCategories() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CUSTOM_CATEGORIES_KEY) || '[]',
    )
    return Array.isArray(stored)
      ? stored.filter((c) => typeof c === 'string' && c.trim())
      : []
  } catch {
    return []
  }
}

function saveCustomCategories(list) {
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(list))
  } catch {}
}

// User-added categories plus any category found in saved terms.
function getCategoryList(includeHidden = false) {
  const list = []
  const add = (category) => {
    if (category && !list.some((c) => sameText(c, category)))
      list.push(category)
  }
  getCustomCategories().forEach(add)
  terms.forEach((t) => add(t.category))
  list.sort((a, b) => a.localeCompare(b))
  return includeHidden ? list : list.filter((c) => !isFilterHidden('terms', c))
}

function renderTermControls() {
  const categories = getCategoryList()
  currentTermCategories = currentTermCategories.filter((c) =>
    categories.includes(c),
  )
  const list = document.getElementById('terms-list')
  const editing = syncFilterEdit('terms', categories.length > 0, list)
  list.innerHTML =
    ['all', ...categories]
      .map((category) => {
        const removable = editing && category !== 'all'
        const active =
          currentView === 'terms' &&
          (category === 'all'
            ? currentTermCategories.length === 0
            : currentTermCategories.includes(category))
        return `<div class="filter-item"><button type="button" class="filter-btn ${
          active ? 'active' : ''
        }" data-category="${escapeHtml(category)}" ${category === 'all' ? '' : filterColorStyle('terms', category)}>${
          category === 'all' ? 'All' : escapeHtml(category)
        }</button>${
          removable
            ? `<button type="button" class="filter-rename" data-rename-category="${escapeHtml(
                category,
              )}" title="Rename this quick filter" aria-label="Rename ${escapeHtml(
                category,
              )} filter">✎</button><button type="button" class="filter-remove" data-remove-category="${escapeHtml(
                category,
              )}" title="Remove this quick filter (Restore removed brings it back)" aria-label="Remove ${escapeHtml(
                category,
              )} filter">×</button>`
            : ''
        }</div>`
      })
      .join('') +
    `<div class="filter-item"><button type="button" class="filter-btn filter-add" id="btn-add-category" title="Add a category quick filter">+ Add</button></div>`

  addRestoreButton(list, 'terms', editing)
  markFilterToggles(list, '[data-category]')
  list.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentView = 'terms'
      const value = btn.dataset.category
      currentTermCategories =
        value === 'all' ? [] : toggleSelection(currentTermCategories, value)
      renderList()
      renderDetail()
    })
  })
  list.querySelectorAll('[data-rename-category]').forEach((btn) => {
    btn.addEventListener('click', () =>
      promptRenameFilter('terms', btn.dataset.renameCategory),
    )
  })
  list.querySelectorAll('[data-remove-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hideFilter('terms', btn.dataset.removeCategory)
      renderList()
    })
  })
  document.getElementById('btn-add-category').addEventListener('click', () => {
    const name = (
      prompt('Name for the new terms category (e.g. Networking):') || ''
    ).trim()
    if (!name) return
    unhideFilter('terms', name)
    const existing = getCategoryList().find((c) => sameText(c, name))
    if (existing) {
      if (!currentTermCategories.includes(existing)) {
        currentTermCategories.push(existing)
      }
    } else {
      saveCustomCategories([...getCustomCategories(), name])
      currentTermCategories.push(name)
    }
    currentView = 'terms'
    renderList()
    renderDetail()
  })

  document.getElementById('term-categories').innerHTML = getCategoryList(true)
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join('')
}

const TERM_COLUMNS = [
  { key: 'term', label: 'Term' },
  { key: 'category', label: 'Category' },
  { key: 'tags', label: 'Tags' },
  { key: 'definition', label: 'Definition' },
]

const TERM_CELLS = {
  term: (t) => `<td>${highlight(t.term, searchQuery)}</td>`,
  category: (t) =>
    `<td>${t.category ? renderBadge('terms', t.category) : ''}</td>`,
  tags: (t) => `<td>${tagChips(t)}</td>`,
  definition: (t) =>
    `<td class="col-desc">${escapeHtml(flattenText(t.definition))}</td>`,
}

const flattenText = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim()

function getFilteredTerms() {
  let list = terms
  if (currentTermCategories.length) {
    list = list.filter((t) =>
      currentTermCategories.some((c) => sameText(c, t.category || '')),
    )
  }
  if (tagSelections.terms.length) {
    list = list.filter((t) => hasAllTags(t, tagSelections.terms))
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    list = list.filter((t) =>
      [t.term, t.category, (t.tags || []).join(' '), t.definition, t.notes]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }
  return [...list].sort((a, b) => {
    const value = (t) => String(t[termSortKey] || '')
    return (
      value(a).localeCompare(value(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      }) * termSortDir
    )
  })
}

function renderTermTable() {
  const listEl = document.getElementById('cmd-list')
  const filtered = getFilteredTerms()
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="table-empty">${
      terms.length ? 'No matches' : 'No saved terms yet. Use + New Term.'
    }</div>`
    return
  }
  if (useListView()) {
    renderCardList('terms', filtered)
    return
  }
  const head = visibleColumns('terms', TERM_COLUMNS)
    .map((col) => {
      const sorted = col.key === termSortKey
      const arrow = sorted ? (termSortDir === 1 ? '▲' : '▼') : ''
      return `<th data-sort="${col.key}" class="${
        sorted ? 'sorted' : ''
      }" aria-sort="${
        sorted ? (termSortDir === 1 ? 'ascending' : 'descending') : 'none'
      }">${col.label} <span class="sort-arrow">${arrow}</span></th>`
    })
    .join('')
  const rows = filtered
    .map(
      (t) => `
        <tr class="${t.id === selectedTermId ? 'active' : ''}" data-id="${escapeHtml(
          t.id,
        )}">
          ${visibleColumns('terms', TERM_COLUMNS)
            .map((col) => TERM_CELLS[col.key](t))
            .join('')}
        </tr>`,
    )
    .join('')
  listEl.innerHTML = `<table class="cmd-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
  applyColumnSizing(listEl, 'terms')
  listEl.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      if (termSortKey === th.dataset.sort) termSortDir = -termSortDir
      else {
        termSortKey = th.dataset.sort
        termSortDir = 1
      }
      renderList()
    })
  })
  listEl.querySelectorAll('tbody tr').forEach((row) => {
    row.addEventListener('click', () => {
      selectedTermId = row.dataset.id
      renderList()
      renderDetail()
    })
  })
}

function renderTermDetail() {
  const el = document.getElementById('detail')
  const term = terms.find((t) => t.id === selectedTermId)
  if (!term) {
    el.innerHTML = `
      <div class="empty-state">
        Select a term from the list or use search.
      </div>
    `
    return
  }
  el.innerHTML = `
    <h2>${escapeHtml(term.term)}</h2>
    <div class="entry-labels">
      ${term.category ? renderBadge('terms', term.category) : ''}
    </div>
    <div class="entry-tags" id="entry-tags"></div>
    <div class="section">
      <h3>Definition</h3>
      <div class="notes" id="term-text" style="white-space: pre-wrap"></div>
    </div>
    ${
      term.notes
        ? `<div class="section"><h3>Notes</h3><div class="notes" id="term-notes-text" style="white-space: pre-wrap"></div></div>`
        : ''
    }
    <div class="detail-actions">
      <button class="btn secondary sm" id="btn-term-copy-detail">Copy</button>
      <button class="btn secondary sm" id="btn-term-edit">Edit</button>
      <button class="btn danger sm" id="btn-term-remove">Delete</button>
    </div>
  `
  bindTagEditor(term, saveTerms)
  document.getElementById('term-text').textContent = term.definition
  if (term.notes) {
    document.getElementById('term-notes-text').textContent = term.notes
  }
  const copyButton = document.getElementById('btn-term-copy-detail')
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(term.definition).then(() => {
      copyButton.textContent = 'Copied!'
      setTimeout(() => {
        copyButton.textContent = 'Copy'
      }, 1200)
    })
  })
  document
    .getElementById('btn-term-edit')
    .addEventListener('click', () => openTermModal(term))
  document
    .getElementById('btn-term-remove')
    .addEventListener('click', () => deleteTerm(term.id))
}

function deleteTerm(id) {
  const term = terms.find((t) => t.id === id)
  if (!term || !confirm(`Delete term "${term.term}"?`)) return
  terms = terms.filter((t) => t.id !== id)
  if (selectedTermId === id) selectedTermId = null
  saveTerms()
  renderList()
  renderDetail()
  closeTermModal()
}

function openTermModal(existing = null) {
  document.getElementById('term-modal-title').textContent = existing
    ? 'Edit Term'
    : 'New Term'
  document.getElementById('term-id').value = existing ? existing.id : ''
  document.getElementById('term-name').value = existing ? existing.term : ''
  document.getElementById('term-category').value = existing
    ? existing.category || ''
    : ''
  tagInputs.terms.set(existing ? existing.tags : [])
  document.getElementById('term-definition').value = existing
    ? existing.definition
    : ''
  document.getElementById('term-notes').value = existing
    ? existing.notes || ''
    : ''
  document.getElementById('btn-term-delete').hidden = !existing
  document.getElementById('term-modal').classList.add('open')
  fitResizableModal(document.getElementById('term-modal'))
  document.getElementById('term-name').focus()
}

function closeTermModal() {
  document.getElementById('term-modal').classList.remove('open')
}

document
  .getElementById('btn-term-new')
  .addEventListener('click', () => openTermModal())
document
  .getElementById('btn-term-cancel')
  .addEventListener('click', closeTermModal)

document.getElementById('term-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const id = document.getElementById('term-id').value || newTermId()
  if (!document.getElementById('term-category').value.trim()) return
  const entry = {
    id,
    term: document.getElementById('term-name').value.trim(),
    category: document.getElementById('term-category').value.trim(),
    tags: tagInputs.terms.get(),
    definition: document.getElementById('term-definition').value.trim(),
    notes: document.getElementById('term-notes').value.trim(),
  }
  const index = terms.findIndex((t) => t.id === id)
  if (index >= 0) terms[index] = entry
  else terms.push(entry)
  saveTerms()
  selectedTermId = id
  currentView = 'terms'
  if (
    currentTermCategories.length &&
    !currentTermCategories.some((c) => sameText(c, entry.category))
  ) {
    currentTermCategories = []
  }
  renderList()
  renderDetail()
  closeTermModal()
})

document
  .getElementById('btn-term-delete')
  .addEventListener('click', () =>
    deleteTerm(document.getElementById('term-id').value),
  )

document.getElementById('btn-term-copy').addEventListener('click', (e) => {
  const button = e.currentTarget
  navigator.clipboard
    .writeText(document.getElementById('term-definition').value)
    .then(() => {
      button.textContent = 'Copied!'
      setTimeout(() => {
        button.textContent = 'Copy'
      }, 1200)
    })
})

// Columns: id (optional), term, category, definition, notes (optional).
function termsFromCsv(text) {
  return parseCsvRecords(text).map((record, index) => {
    if (!(record.term || '').trim() || !(record.definition || '').trim()) {
      throw new Error(
        `CSV row ${index + 2} needs a term and definition (columns: id, term, category, tags, definition, notes).`,
      )
    }
    return {
      id: (record.id || '').trim(),
      term: record.term.trim(),
      category: (record.category || '').trim(),
      tags: cleanTags(record.tags),
      definition: record.definition,
      notes: (record.notes || '').trim(),
      _cols: csvColumns(record),
    }
  })
}

function termsToCsv(list) {
  return toCsv(
    ['id', 'term', 'category', 'tags', 'definition', 'notes'],
    list.map((t) => [
      t.id,
      t.term,
      t.category,
      (t.tags || []).join('; '),
      t.definition,
      t.notes,
    ]),
  )
}

document.getElementById('btn-terms-export').addEventListener('click', (e) => {
  showExportMenu(e.currentTarget, [
    {
      label: 'JSON (terms.json)',
      run: () =>
        downloadFile(
          'terms.json',
          JSON.stringify(terms, null, 2) + '\n',
          'application/json;charset=utf-8',
        ),
    },
    {
      label: 'CSV (terms.csv)',
      run: () =>
        downloadFile('terms.csv', termsToCsv(terms), 'text/csv;charset=utf-8'),
    },
  ])
})

const termsImportFile = document.getElementById('terms-import-file')
document.getElementById('btn-terms-import').addEventListener('click', () => {
  termsImportFile.value = ''
  termsImportFile.click()
})
termsImportFile.addEventListener('change', async () => {
  const file = termsImportFile.files && termsImportFile.files[0]
  if (!file) return
  try {
    const text = await file.text()
    const imported = file.name.toLowerCase().endsWith('.csv')
      ? termsFromCsv(text)
      : JSON.parse(text)
    if (
      !Array.isArray(imported) ||
      !imported.every(
        (t) =>
          t && typeof t.term === 'string' && typeof t.definition === 'string',
      )
    ) {
      throw new Error('Expected an array of terms with a term and definition.')
    }
    openImportManager('terms', file.name, imported.map(cleanImportedTerm))
  } catch (err) {
    alert('Term import failed: ' + err.message)
  }
})

for (const kind of ['commands', 'scripts', 'terms']) {
  document
    .getElementById(`btn-filters-edit-${kind}`)
    .addEventListener('click', () => {
      filterEditing[kind] = !filterEditing[kind]
      renderList()
    })
}

// ─── Section names ────────────────────────────────────────────────────
// The Commands, Scripts and Terms headers can be renamed (double-click the
// name, or focus it and press F2). Leaving the name empty restores the default.
const SECTION_NAMES_KEY = 'spellbook_section_names_v1'
const SECTION_DEFAULTS = {
  commands: { title: 'Commands', one: 'command', many: 'commands' },
  scripts: { title: 'Scripts', one: 'script', many: 'scripts' },
  terms: { title: 'Terms', one: 'term', many: 'terms' },
}
let sectionNames = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(SECTION_NAMES_KEY) || '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
})()

function sectionName(kind) {
  const custom = String(sectionNames[kind] || '').trim()
  return custom || SECTION_DEFAULTS[kind].title
}

function saveSectionNames() {
  try {
    if (Object.keys(sectionNames).length) {
      localStorage.setItem(SECTION_NAMES_KEY, JSON.stringify(sectionNames))
    } else {
      localStorage.removeItem(SECTION_NAMES_KEY)
    }
  } catch {}
}

function renderSectionTitles() {
  for (const kind of Object.keys(SECTION_DEFAULTS)) {
    const el = document.getElementById(`title-${kind}`)
    if (el && !el.querySelector('input')) el.textContent = sectionName(kind)
  }
}

function setSectionName(kind, name) {
  const value = String(name).trim().slice(0, 30)
  if (value && value !== SECTION_DEFAULTS[kind].title)
    sectionNames[kind] = value
  else delete sectionNames[kind]
  saveSectionNames()
  renderSectionTitles()
  updateCounts()
}

function resetSectionNames() {
  sectionNames = {}
  saveSectionNames()
  renderSectionTitles()
  updateCounts()
}

// "12 commands", or "12 <your name>" once renamed.
function countText(kind, n) {
  const defaults = SECTION_DEFAULTS[kind]
  const custom = String(sectionNames[kind] || '').trim()
  if (custom) return `${n} ${custom}`
  return `${n} ${n === 1 ? defaults.one : defaults.many}`
}

function startRenameSection(kind) {
  const el = document.getElementById(`title-${kind}`)
  if (!el || el.querySelector('input')) return
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'section-title-input'
  input.maxLength = 30
  input.value = sectionName(kind)
  input.setAttribute('aria-label', `Rename the ${sectionName(kind)} section`)
  let finished = false
  const finish = (save) => {
    if (finished) return
    finished = true
    const value = input.value
    input.remove()
    if (save) setSectionName(kind, value)
    else renderSectionTitles()
    el.focus()
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true)
    else if (e.key === 'Escape') {
      e.stopPropagation()
      finish(false)
    }
  })
  input.addEventListener('blur', () => finish(true))
  el.replaceChildren(input)
  input.focus()
  input.select()
}

for (const kind of Object.keys(SECTION_DEFAULTS)) {
  const el = document.getElementById(`title-${kind}`)
  el.addEventListener('dblclick', () => startRenameSection(kind))
  el.addEventListener('keydown', (e) => {
    if (e.target === el && (e.key === 'F2' || e.key === 'Enter')) {
      e.preventDefault()
      startRenameSection(kind)
    }
  })
}

// ─── Showing and hiding table columns ─────────────────────────────────
// The Columns button (beside the search) lists the current table's columns;
// untick one to hide it, tick it again to bring it back. At least one column
// always stays. Hidden columns are remembered per table.
const HIDDEN_COLUMNS_KEY = 'spellbook_hidden_columns_v1'

function getHiddenColumns(kind) {
  try {
    const stored = JSON.parse(localStorage.getItem(HIDDEN_COLUMNS_KEY) || '{}')
    const list = stored && stored[kind]
    return Array.isArray(list) ? list.filter((k) => typeof k === 'string') : []
  } catch {
    return []
  }
}

function setHiddenColumns(kind, keys) {
  try {
    const stored = JSON.parse(localStorage.getItem(HIDDEN_COLUMNS_KEY) || '{}')
    const all = stored && typeof stored === 'object' ? stored : {}
    if (keys.length) all[kind] = keys
    else delete all[kind]
    if (Object.keys(all).length) {
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(all))
    } else {
      localStorage.removeItem(HIDDEN_COLUMNS_KEY)
    }
  } catch {}
}

// The columns to show; never empty.
function visibleColumns(kind, columns) {
  const hidden = getHiddenColumns(kind)
  const shown = columns.filter((col) => !hidden.includes(col.key))
  return shown.length ? shown : columns
}

const columnsFor = (kind) =>
  ({ commands: TABLE_COLUMNS, scripts: SCRIPT_COLUMNS, terms: TERM_COLUMNS })[
    kind
  ]

function setColumnHidden(kind, key, hide) {
  const hidden = getHiddenColumns(kind).filter((k) => k !== key)
  if (hide) hidden.push(key)
  // At least one column always stays.
  if (columnsFor(kind).every((col) => hidden.includes(col.key))) return
  setHiddenColumns(kind, hidden)
  // If the table was sorted by a column that is now hidden, sort by the
  // first column still showing instead.
  const first = visibleColumns(kind, columnsFor(kind))[0].key
  if (
    kind === 'commands' &&
    !visibleColumns(kind, TABLE_COLUMNS).some((c) => c.key === sortKey)
  ) {
    sortKey = first
    sortDir = 1
  } else if (
    kind === 'scripts' &&
    !visibleColumns(kind, SCRIPT_COLUMNS).some((c) => c.key === scriptSortKey)
  ) {
    scriptSortKey = first
    scriptSortDir = 1
  } else if (
    kind === 'terms' &&
    !visibleColumns(kind, TERM_COLUMNS).some((c) => c.key === termSortKey)
  ) {
    termSortKey = first
    termSortDir = 1
  }
  renderList()
}

function showColumnsMenu(anchor) {
  document.querySelectorAll('.columns-menu').forEach((m) => m.remove())
  const kind = currentView
  const menu = document.createElement('div')
  menu.className = 'columns-menu'
  const rect = anchor.getBoundingClientRect()
  menu.style.top = `${rect.bottom + 4}px`
  menu.style.right = `${Math.max(4, window.innerWidth - rect.right)}px`
  const heading = document.createElement('div')
  heading.className = 'columns-menu-title'
  heading.textContent = `${sectionName(kind)} columns`
  menu.append(heading)

  const refresh = () => {
    const shown = visibleColumns(kind, columnsFor(kind)).map((c) => c.key)
    menu.querySelectorAll('input[type=checkbox]').forEach((box) => {
      box.checked = shown.includes(box.dataset.key)
      // the last visible column cannot be hidden
      box.disabled = box.checked && shown.length === 1
    })
    showAll.disabled = getHiddenColumns(kind).length === 0
  }
  columnsFor(kind).forEach((col) => {
    const row = document.createElement('label')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.dataset.key = col.key
    box.addEventListener('change', () => {
      setColumnHidden(kind, col.key, !box.checked)
      refresh()
    })
    row.append(box, document.createTextNode(` ${col.label}`))
    menu.append(row)
  })
  const showAll = document.createElement('button')
  showAll.type = 'button'
  showAll.className = 'btn secondary sm'
  showAll.textContent = 'Show all'
  showAll.addEventListener('click', () => {
    setHiddenColumns(kind, [])
    renderList()
    refresh()
  })
  menu.append(showAll)

  const close = () => {
    menu.remove()
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
  }
  const onOutside = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) close()
  }
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  document.body.appendChild(menu)
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  refresh()
  menu.querySelector('input').focus()
}

document.getElementById('btn-columns').addEventListener('click', (e) => {
  if (document.querySelector('.columns-menu')) {
    document.querySelector('.columns-menu').remove()
    return
  }
  showColumnsMenu(e.currentTarget)
})

// ─── Folding sections away ────────────────────────────────────────────
// The ▾ / ▸ button beside each section name (Commands, Scripts, Terms) folds
// its quick filters and buttons away, and unfolds them again. The table and
// your data are not affected. The state is remembered.
const COLLAPSED_KEY = 'spellbook_collapsed_sections_v1'

function getCollapsedSections() {
  try {
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

function applyCollapsedSections() {
  const collapsed = getCollapsedSections()
  for (const kind of Object.keys(SECTION_DEFAULTS)) {
    const panel = document.getElementById(`${kind}-panel`)
    const button = document.getElementById(`toggle-${kind}`)
    if (!panel || !button) continue
    const on = collapsed[kind] === true
    panel.classList.toggle('collapsed', on)
    button.textContent = on ? '▸' : '▾'
    button.setAttribute('aria-expanded', String(!on))
    button.title = on ? 'Show this section' : 'Fold this section away'
  }
}

for (const kind of Object.keys(SECTION_DEFAULTS)) {
  document.getElementById(`toggle-${kind}`).addEventListener('click', () => {
    const collapsed = getCollapsedSections()
    if (collapsed[kind] === true) delete collapsed[kind]
    else collapsed[kind] = true
    try {
      if (Object.keys(collapsed).length) {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
      } else {
        localStorage.removeItem(COLLAPSED_KEY)
      }
    } catch {}
    applyCollapsedSections()
  })
}

// ─── Card list for a narrow table pane ────────────────────────────────
// When the table pane sits on the left (side by side with the details, or in
// the control bar) it is shown as a list of cards instead of a table: the
// title, then the platform / language / category with a small note, then the
// tags. A sort menu replaces the column headers.
function useListView() {
  const page = document.getElementById('page-spellbook')
  return page.dataset.tableDock === 'control' || page.dataset.panes === 'side'
}

const LIST_VIEWS = {
  commands: {
    columns: () => TABLE_COLUMNS,
    sort: {
      get key() {
        return sortKey
      },
      set key(v) {
        sortKey = v
      },
      get dir() {
        return sortDir
      },
      set dir(v) {
        sortDir = v
      },
    },
    selected: () => selectedId,
    select: (id) => {
      selectedId = id
    },
    title: (c) => c.title,
    badge: (c) => renderBadge('commands', c.platform),
    note: (c) => {
      const n = (c.variables || []).length
      return n ? `${n} var(s)` : 'no vars'
    },
  },
  scripts: {
    columns: () => SCRIPT_COLUMNS,
    sort: {
      get key() {
        return scriptSortKey
      },
      set key(v) {
        scriptSortKey = v
      },
      get dir() {
        return scriptSortDir
      },
      set dir(v) {
        scriptSortDir = v
      },
    },
    selected: () => selectedScriptId,
    select: (id) => {
      selectedScriptId = id
    },
    title: (s) => s.name,
    badge: (s) => (s.language ? renderBadge('scripts', s.language) : ''),
    note: (s) => {
      const lines = s.body.split(/\r?\n/).length
      return `${lines} line${lines === 1 ? '' : 's'}`
    },
  },
  terms: {
    columns: () => TERM_COLUMNS,
    sort: {
      get key() {
        return termSortKey
      },
      set key(v) {
        termSortKey = v
      },
      get dir() {
        return termSortDir
      },
      set dir(v) {
        termSortDir = v
      },
    },
    selected: () => selectedTermId,
    select: (id) => {
      selectedTermId = id
    },
    title: (t) => t.term,
    badge: (t) => (t.category ? renderBadge('terms', t.category) : ''),
    note: () => '',
  },
}

function renderCardList(kind, items) {
  const view = LIST_VIEWS[kind]
  const listEl = document.getElementById('cmd-list')

  const options = view
    .columns()
    .map(
      (col) =>
        `<option value="${col.key}" ${col.key === view.sort.key ? 'selected' : ''}>${escapeHtml(col.label)}</option>`,
    )
    .join('')
  const cards = items
    .map((item) => {
      const note = view.note(item)
      return `
        <div class="cmd-card ${item.id === view.selected() ? 'active' : ''}" data-id="${escapeHtml(item.id)}" tabindex="0">
          <div class="card-title">${highlight(view.title(item), searchQuery)}</div>
          <div class="card-meta">${view.badge(item)}${note ? `<span>${escapeHtml(note)}</span>` : ''}</div>
          ${
            (item.tags || []).length
              ? `<div class="card-tags">${tagChips(item)}</div>`
              : ''
          }
        </div>`
    })
    .join('')
  listEl.innerHTML = `
    <div class="list-toolbar">
      <label>Sort
        <select class="list-sort">${options}</select>
      </label>
      <button type="button" class="btn secondary sm list-sort-dir" title="Reverse the order">${view.sort.dir === 1 ? '▲' : '▼'}</button>
    </div>
    <div class="card-list">${cards}</div>`

  listEl.querySelector('.list-sort').addEventListener('change', (e) => {
    view.sort.key = e.target.value
    view.sort.dir = 1
    renderList()
  })
  listEl.querySelector('.list-sort-dir').addEventListener('click', () => {
    view.sort.dir = -view.sort.dir
    renderList()
  })
  const choose = (card) => {
    view.select(card.dataset.id)
    renderList()
    renderDetail()
  }
  listEl.querySelectorAll('.cmd-card').forEach((card) => {
    card.addEventListener('click', () => choose(card))
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        choose(card)
      }
    })
  })
}

// ─── Import Manager ───────────────────────────────────────────────────
// Every import (commands, scripts or terms) is first compared with your
// current data. Nothing changes until you press Apply, and you choose which new
// and changed items to bring in. Items you have that the file does not have are
// listed too; they are only removed if you tick them.
// The modal controls im-select-all, im-select-none, im-cancel, and im-apply
// are declared in index.html and wired near the end of this section.
const lowerText = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()

const IMPORT_KINDS = {
  commands: {
    name: 'Commands',
    list: () => commands,
    title: (c) => c.title,
    sub: (c) => c.platform,
    match: (c) => `${lowerText(c.title)}|${lowerText(c.platform)}`,
    fields: [
      ['title', 'Title'],
      ['platform', 'Platform'],
      ['tags', 'Tags', 'list'],
      ['description', 'Description'],
      ['command', 'Command template'],
      ['variables', 'Variables', 'list'],
      ['variableDetails', 'Variable details', 'json'],
      ['example', 'Example'],
      ['notes', 'Notes'],
    ],
  },
  scripts: {
    name: 'Scripts',
    list: () => scripts,
    title: (s) => s.name,
    sub: (s) => s.language,
    match: (s) => `${lowerText(s.name)}|${lowerText(s.language)}`,
    fields: [
      ['name', 'Name'],
      ['language', 'Language'],
      ['tags', 'Tags', 'list'],
      ['body', 'Script'],
      ['notes', 'Notes'],
    ],
  },
  terms: {
    name: 'Terms',
    list: () => terms,
    title: (t) => t.term,
    sub: (t) => t.category,
    match: (t) => lowerText(t.term),
    fields: [
      ['term', 'Term'],
      ['category', 'Category'],
      ['tags', 'Tags', 'list'],
      ['definition', 'Definition'],
      ['notes', 'Notes'],
    ],
  },
}

const asText = (v) => (typeof v === 'string' ? v : '')

// Incoming items, reduced to the fields Spell Book keeps.
function cleanImportedCommand(raw) {
  const c = withPlatform(raw)
  return {
    id: asText(c.id).trim(),
    title: asText(c.title).trim(),
    platform: asText(c.platform).trim(),
    tags: cleanTags(c.tags),
    description: asText(c.description),
    command: asText(c.command),
    variables: Array.isArray(c.variables) ? c.variables.map(String) : [],
    variableDetails: sanitizeVariableDetails(c.variableDetails),
    example: asText(c.example),
    notes: asText(c.notes),
    present: Array.isArray(c._cols) ? c._cols : null,
  }
}

const cleanImportedScript = (s) => ({
  id: asText(s.id).trim(),
  name: asText(s.name).trim(),
  language: asText(s.language).trim(),
  tags: cleanTags(s.tags),
  body: asText(s.body),
  notes: asText(s.notes),
  present: Array.isArray(s._cols) ? s._cols : null,
})

const cleanImportedTerm = (t) => ({
  id: asText(t.id).trim(),
  term: asText(t.term).trim(),
  category: asText(t.category).trim(),
  tags: cleanTags(t.tags),
  definition: asText(t.definition),
  notes: asText(t.notes),
  present: Array.isArray(t._cols) ? t._cols : null,
})

const importValue = (v, type) =>
  type === 'json'
    ? Array.isArray(v) && v.length
      ? JSON.stringify(v, null, 2)
      : ''
    : type === 'list'
      ? (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean)
      : String(v ?? '')
          .replace(/\r\n/g, '\n')
          .trim()

const sameImportValue = (a, b, type) =>
  type === 'list'
    ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
    : a === b

// Lines of text that were added or removed, with a little context around them.
function lineDiff(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length * b.length > 4_000_000) {
    return [
      ...a.map((text) => ({ type: 'del', text })),
      ...b.map((text) => ({ type: 'add', text })),
    ]
  }
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: 'del', text: a[i++] })
    } else {
      out.push({ type: 'add', text: b[j++] })
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] })
  while (j < b.length) out.push({ type: 'add', text: b[j++] })
  return out
}

function renderLineDiff(before, after) {
  const lines = lineDiff(before, after)
  const near = lines.map((_line, index) =>
    lines
      .slice(Math.max(0, index - 2), index + 3)
      .some((other) => other.type !== 'same'),
  )
  let html = ''
  let skipped = 0
  lines.forEach((line, index) => {
    if (line.type === 'same' && !near[index]) {
      skipped++
      return
    }
    if (skipped) {
      html += `<div class="im-line gap">… ${skipped} unchanged line${skipped === 1 ? '' : 's'} …</div>`
      skipped = 0
    }
    const mark = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
    html += `<div class="im-line ${line.type}"><span>${mark}</span>${escapeHtml(line.text) || '&nbsp;'}</div>`
  })
  if (skipped) {
    html += `<div class="im-line gap">… ${skipped} unchanged line${skipped === 1 ? '' : 's'} …</div>`
  }
  return `<div class="im-lines">${html}</div>`
}

// How one field changed: tag chips for lists, a line diff for longer text.
function renderFieldChange(diff) {
  if (diff.type === 'list') {
    const had = new Set(diff.before)
    const has = new Set(diff.after)
    const chips = [
      ...diff.before.filter((x) => !has.has(x)).map((x) => ['del', x]),
      ...diff.after.filter((x) => !had.has(x)).map((x) => ['add', x]),
      ...diff.after.filter((x) => had.has(x)).map((x) => ['same', x]),
    ]
      .map(
        ([kind, x]) =>
          `<span class="tag-chip im-chip ${kind}">${kind === 'add' ? '+' : kind === 'del' ? '−' : ''}${escapeHtml(x)}</span>`,
      )
      .join('')
    return `<div class="im-chips">${chips}</div>`
  }
  const long =
    diff.before.includes('\n') ||
    diff.after.includes('\n') ||
    diff.before.length > 80 ||
    diff.after.length > 80
  if (long) return renderLineDiff(diff.before, diff.after)
  return `<div class="im-inline"><del>${escapeHtml(diff.before) || '(empty)'}</del> → <ins>${escapeHtml(diff.after) || '(empty)'}</ins></div>`
}

let importSession = null

// Compares the incoming items with what is saved. Items are matched by id
// first, then by name (title + platform, name + language, or term).
function buildImportSession(kind, fileName, incoming) {
  const config = IMPORT_KINDS[kind]
  const current = config.list()
  const byId = new Map(current.map((item) => [item.id, item]))
  const byName = new Map()
  current.forEach((item) => {
    const key = config.match(item)
    if (!byName.has(key)) byName.set(key, item)
  })
  const used = new Set()
  const rows = incoming.map((item, index) => {
    let match = item.id ? byId.get(item.id) : null
    let by = 'id'
    if (!match || used.has(match)) {
      match = byName.get(config.match(item))
      by = 'name'
    }
    if (match && used.has(match)) match = null
    if (!match)
      return { uid: index, status: 'new', incoming: item, checked: true }
    used.add(match)
    const diffs = config.fields
      .filter(([field]) => !item.present || item.present.includes(field))
      .map(([field, label, type]) => ({
        field,
        label,
        type: type || 'text',
        before: importValue(match[field], type),
        after: importValue(item[field], type),
      }))
      .filter((d) => !sameImportValue(d.before, d.after, d.type))
    return {
      uid: index,
      status: diffs.length ? 'changed' : 'same',
      incoming: item,
      current: match,
      by,
      diffs,
      checked: diffs.length > 0,
    }
  })
  const removed = current
    .filter((item) => !used.has(item))
    .map((item, index) => ({
      uid: `r${index}`,
      status: 'removed',
      current: item,
      checked: false,
    }))
  return { kind, fileName, rows, removed, tab: 'changes', open: new Set() }
}

const importStatusLabel = {
  new: 'New',
  changed: 'Changed',
  same: 'Same',
  removed: 'Not in file',
}

function importTabRows(session) {
  const { rows, removed, tab } = session
  if (tab === 'new') return rows.filter((r) => r.status === 'new')
  if (tab === 'changed') return rows.filter((r) => r.status === 'changed')
  if (tab === 'unchanged') return rows.filter((r) => r.status === 'same')
  if (tab === 'removed') return removed
  return rows.filter((r) => r.status === 'new' || r.status === 'changed')
}

function importRowDetail(config, row) {
  if (row.status === 'changed') {
    return row.diffs
      .map(
        (d) =>
          `<div class="im-field"><div class="im-field-name">${escapeHtml(d.label)}</div>${renderFieldChange(d)}</div>`,
      )
      .join('')
  }
  const item = row.status === 'removed' ? row.current : row.incoming
  return config.fields
    .map(([field, label, type]) => {
      const value = importValue(item[field], type)
      if (!value || (Array.isArray(value) && !value.length)) return ''
      const shown = Array.isArray(value)
        ? value
            .map((x) => `<span class="tag-chip">${escapeHtml(x)}</span>`)
            .join('')
        : `<pre class="im-text">${escapeHtml(value)}</pre>`
      return `<div class="im-field"><div class="im-field-name">${escapeHtml(label)}</div>${shown}</div>`
    })
    .join('')
}

function renderImportManager() {
  const session = importSession
  if (!session) return
  const config = IMPORT_KINDS[session.kind]
  const count = (status) =>
    session.rows.filter((r) => r.status === status).length
  const counts = {
    changes: count('new') + count('changed'),
    new: count('new'),
    changed: count('changed'),
    unchanged: count('same'),
    removed: session.removed.length,
  }
  document.getElementById('im-title').textContent =
    `Import Manager: ${config.name}`
  document.getElementById('im-file').textContent =
    `${session.fileName}: ${session.rows.length} item${session.rows.length === 1 ? '' : 's'} in the file, ${config.list().length} in your data`
  const tabs = [
    ['changes', 'All changes'],
    ['new', 'New'],
    ['changed', 'Changed'],
    ['unchanged', 'Unchanged'],
    ['removed', 'Not in file'],
  ]
  document.getElementById('im-tabs').innerHTML = tabs
    .map(
      ([key, label]) =>
        `<button type="button" class="im-tab ${session.tab === key ? 'active' : ''}" role="tab" aria-selected="${session.tab === key}" data-tab="${key}">${label} <span class="im-count">${counts[key]}</span></button>`,
    )
    .join('')

  const rows = importTabRows(session)
  const selectable = session.tab !== 'unchanged'
  document.getElementById('im-tools').hidden = !selectable || !rows.length
  const hints = {
    changes: 'Tick the new and changed items to bring in.',
    new: 'Items in the file that you do not have yet.',
    changed: 'Items you have whose content differs from the file.',
    unchanged: 'Identical in both. Nothing to do.',
    removed:
      'Items you have that the file does not. They stay unless you tick them to be removed.',
  }
  document.getElementById('im-hint').textContent = hints[session.tab]

  document.getElementById('im-list').innerHTML = rows.length
    ? rows
        .map((row) => {
          const item = row.status === 'removed' ? row.current : row.incoming
          const open = session.open.has(row.uid)
          const sub = [
            config.sub(item),
            row.status === 'changed'
              ? `${row.diffs.length} difference${row.diffs.length === 1 ? '' : 's'} (${row.diffs.map((d) => d.label.toLowerCase()).join(', ')})`
              : '',
            row.by === 'name' ? 'matched by name' : '',
          ]
            .filter(Boolean)
            .join(' · ')
          return `
            <div class="im-row ${row.status}" data-uid="${escapeHtml(String(row.uid))}">
              <div class="im-row-head">
                ${selectable ? `<input type="checkbox" class="im-check" ${row.checked ? 'checked' : ''} aria-label="Include ${escapeHtml(config.title(item))}" />` : '<span class="im-check-gap"></span>'}
                <span class="badge im-status ${row.status}">${importStatusLabel[row.status]}</span>
                <div class="im-main">
                  <div class="im-title">${escapeHtml(config.title(item))}</div>
                  <div class="im-sub">${escapeHtml(sub)}</div>
                </div>
                ${row.status === 'same' ? '' : `<button type="button" class="btn secondary sm im-toggle" aria-expanded="${open}">${open ? 'Hide' : 'Details'}</button>`}
              </div>
              ${open ? `<div class="im-detail">${importRowDetail(config, row)}</div>` : ''}
            </div>`
        })
        .join('')
    : `<div class="im-empty">${
        session.tab === 'changes' ||
        session.tab === 'new' ||
        session.tab === 'changed'
          ? 'Nothing here: your data already matches the file.'
          : 'Nothing here.'
      }</div>`
  updateImportApply()
}

function importSelection() {
  const s = importSession
  return {
    added: s.rows.filter((r) => r.status === 'new' && r.checked),
    changed: s.rows.filter((r) => r.status === 'changed' && r.checked),
    removed: s.removed.filter((r) => r.checked),
  }
}

function updateImportApply() {
  const { added, changed, removed } = importSelection()
  const total = added.length + changed.length + removed.length
  const parts = [
    added.length ? `${added.length} added` : '',
    changed.length ? `${changed.length} updated` : '',
    removed.length ? `${removed.length} removed` : '',
  ].filter(Boolean)
  document.getElementById('im-note').textContent = parts.length
    ? parts.join(', ')
    : 'No changes selected'
  const apply = document.getElementById('im-apply')
  apply.disabled = total === 0
  apply.textContent = total
    ? `Apply ${total} change${total === 1 ? '' : 's'}`
    : 'Apply'
}

function openImportManager(kind, fileName, incoming) {
  importSession = buildImportSession(kind, fileName, incoming)
  if (!importTabRows(importSession).length) importSession.tab = 'unchanged'
  renderImportManager()
  document.getElementById('import-manager').classList.add('open')
}

function closeImportManager() {
  document.getElementById('import-manager').classList.remove('open')
  importSession = null
}

// Brings the ticked items into your data.
function applyImportSession() {
  const session = importSession
  if (!session) return
  const config = IMPORT_KINDS[session.kind]
  const { added, changed, removed } = importSelection()
  if (
    removed.length &&
    session.kind !== 'commands' &&
    !confirm(
      `Remove ${removed.length} ${config.name.toLowerCase()} that are not in the file? This cannot be undone.`,
    )
  ) {
    return
  }
  changed.forEach(({ current, incoming, diffs }) => {
    diffs.forEach(({ field, type }) => {
      current[field] = type === 'list' ? [...incoming[field]] : incoming[field]
    })
    if (session.kind === 'commands' && !(current.variables || []).length) {
      current.variables = extractPlaceholders(current.command)
    }
  })

  if (session.kind === 'commands') {
    removed.forEach(({ current }) => {
      commands = commands.filter((c) => c !== current)
      trashedCommands.push(current)
    })
    const taken = new Set([...commands, ...trashedCommands].map((c) => c.id))
    const idPattern = /^[a-z0-9-]+-\d{4}$/i
    const fresh = []
    added.forEach(({ incoming }) => {
      const keep = idPattern.test(incoming.id) && !taken.has(incoming.id)
      const id = keep
        ? incoming.id
        : generateCommandId(incoming.platform, [
            ...commands,
            ...trashedCommands,
            ...fresh,
          ])
      taken.add(id)
      const { present, ...fields } = incoming
      fresh.push({
        ...fields,
        id,
        variables: incoming.variables.length
          ? incoming.variables
          : extractPlaceholders(incoming.command),
      })
    })
    commands = [...commands, ...fresh]
    baselineCommandIds = new Set(commands.map((c) => c.id))
    saveBaseline()
    save()
    saveTrash()
    renderTrash()
  } else {
    const key = session.kind
    const list = key === 'scripts' ? scripts : terms
    const makeId = key === 'scripts' ? newScriptId : newTermId
    const gone = new Set(removed.map((r) => r.current))
    const next = list.filter((item) => !gone.has(item))
    const taken = new Set(next.map((item) => item.id))
    added.forEach(({ incoming }) => {
      let id = incoming.id
      if (!id || taken.has(id)) id = makeId()
      taken.add(id)
      const { present, ...fields } = incoming
      next.push({ ...fields, id })
    })
    if (key === 'scripts') {
      scripts = next
      saveScripts()
    } else {
      terms = next
      saveTerms()
    }
    resetItemBaseline(key)
  }
  closeImportManager()
  renderList()
  renderDetail()
}

{
  const manager = document.getElementById('import-manager')
  document
    .getElementById('im-cancel')
    .addEventListener('click', closeImportManager)
  document
    .getElementById('im-apply')
    .addEventListener('click', applyImportSession)
  document.getElementById('im-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]')
    if (!tab || !importSession) return
    importSession.tab = tab.dataset.tab
    renderImportManager()
  })
  const setVisible = (checked) => {
    if (!importSession) return
    importTabRows(importSession).forEach((row) => {
      row.checked = checked
    })
    renderImportManager()
  }
  document
    .getElementById('im-select-all')
    .addEventListener('click', () => setVisible(true))
  document
    .getElementById('im-select-none')
    .addEventListener('click', () => setVisible(false))
  const find = (row) => {
    const uid = row.dataset.uid
    return [...importSession.rows, ...importSession.removed].find(
      (r) => String(r.uid) === uid,
    )
  }
  document.getElementById('im-list').addEventListener('click', (e) => {
    const toggle = e.target.closest('.im-toggle')
    if (!toggle || !importSession) return
    const entry = find(toggle.closest('.im-row'))
    if (importSession.open.has(entry.uid)) importSession.open.delete(entry.uid)
    else importSession.open.add(entry.uid)
    renderImportManager()
  })
  document.getElementById('im-list').addEventListener('change', (e) => {
    if (!e.target.classList.contains('im-check') || !importSession) return
    find(e.target.closest('.im-row')).checked = e.target.checked
    updateImportApply()
  })
  manager.addEventListener('click', (e) => {
    if (e.target === manager) closeImportManager()
  })
}

// ─── Tag input (chips + suggestions) for the Add / Edit windows ───────
// Works like the tag filter in the search bar: chosen tags are chips you can
// remove, existing tags are suggested as you type, and Enter or a comma adds
// what you typed (a new tag if it does not exist yet).
function knownTagsFor(kind) {
  const items =
    kind === 'commands' ? commands : kind === 'scripts' ? scripts : terms
  return [...new Set(items.flatMap((item) => item.tags || []))].sort((a, b) =>
    a.localeCompare(b),
  )
}

function createTagInput(host, kind) {
  let tags = []
  let matches = []
  let active = -1
  let open = false

  host.classList.add('tag-input')
  const box = document.createElement('div')
  box.className = 'tag-input-box'
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tag-input-field'
  input.id = host.dataset.inputId || ''
  input.placeholder = 'Add tags…'
  input.autocomplete = 'off'
  const panel = document.createElement('div')
  panel.className = 'tag-input-panel'
  panel.hidden = true
  box.append(input)
  host.append(box, panel)
  // Clicking the empty part of the box focuses the typing area.
  box.addEventListener('click', (e) => {
    if (e.target === box) input.focus()
  })
  // Keep focus in the box while a suggestion is pressed.
  panel.addEventListener('mousedown', (e) => e.preventDefault())

  const paintActive = () => {
    panel.querySelectorAll('.tag-pick').forEach((button, i) => {
      button.classList.toggle('active', i === active)
      if (i === active) button.scrollIntoView?.({ block: 'nearest' })
    })
  }

  function drawChips() {
    box.querySelectorAll('.tag-chip').forEach((chip) => chip.remove())
    tags.forEach((tag) => {
      const chip = document.createElement('span')
      chip.className = 'tag-chip editable'
      chip.append(document.createTextNode(tag))
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'tag-x'
      remove.textContent = '×'
      remove.title = `Remove the tag "${tag}"`
      remove.setAttribute('aria-label', `Remove the tag ${tag}`)
      remove.addEventListener('click', () => {
        tags = tags.filter((t) => t !== tag)
        drawChips()
        refresh()
        input.focus()
      })
      chip.append(remove)
      box.insertBefore(chip, input)
    })
  }

  function refresh() {
    const piece = input.value.split(',').pop().trim().toLowerCase()
    matches = knownTagsFor(kind)
      .filter((t) => !tags.includes(t) && t.toLowerCase().includes(piece))
      .sort(
        (a, b) =>
          Number(b.startsWith(piece)) - Number(a.startsWith(piece)) ||
          a.localeCompare(b),
      )
      .slice(0, 40)
    active = -1
    panel.replaceChildren()
    matches.forEach((tag) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'tag-chip tag-pick'
      button.textContent = tag
      button.addEventListener('click', () => {
        const before = input.value.split(',').slice(0, -1).join(',')
        input.value = ''
        addTags(before ? `${before},${tag}` : tag)
        input.focus()
      })
      panel.append(button)
    })
    const exact = tags.includes(piece) || matches.includes(piece)
    if (piece && !exact) {
      const hint = document.createElement('span')
      hint.className = 'tag-suggest-hint'
      hint.textContent = matches.length
        ? `Enter adds "${piece}" as a new tag`
        : `No existing tag matches. Enter adds "${piece}".`
      panel.append(hint)
    }
    panel.hidden = !open || !panel.children.length
  }

  function addTags(text) {
    cleanTags(text).forEach((tag) => {
      if (!tags.includes(tag)) tags.push(tag)
    })
    drawChips()
    refresh()
  }

  // Anything typed but not yet added becomes a tag.
  const flush = () => {
    if (input.value.trim()) {
      const text = input.value
      input.value = ''
      addTags(text)
    }
  }

  input.addEventListener('focus', () => {
    open = true
    refresh()
  })
  input.addEventListener('blur', () => {
    flush()
    open = false
    refresh()
  })
  input.addEventListener('input', () => {
    open = true
    refresh()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!matches.length) return
      e.preventDefault()
      open = true
      panel.hidden = false
      const step = e.key === 'ArrowDown' ? 1 : -1
      active = (active + step + matches.length + 1) % (matches.length + 1)
      if (active === matches.length) active = -1
      paintActive()
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      const before = input.value.split(',').slice(0, -1).join(',')
      input.value = ''
      addTags(before ? `${before},${matches[active]}` : matches[active])
    } else if (e.key === 'Enter' || e.key === ',') {
      // An empty box lets Enter save the form as usual.
      if (e.key === ',' || input.value.trim()) {
        e.preventDefault()
        flush()
      }
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      tags = tags.slice(0, -1)
      drawChips()
      refresh()
    } else if (e.key === 'Escape' && !panel.hidden) {
      // Close the suggestions first; a second Esc closes the window.
      e.stopPropagation()
      open = false
      refresh()
    }
  })

  return {
    set(list) {
      tags = cleanTags(list || [])
      input.value = ''
      open = false
      drawChips()
      refresh()
    },
    get() {
      flush()
      return [...tags]
    },
    focus: () => input.focus(),
  }
}

// Single-value tool/language/category picker: shares tag suggestion styling and navigation.
function attachCategorySuggestions(inputId, options) {
  const input = document.getElementById(inputId)
  const wrapper = document.createElement('div')
  wrapper.className = 'category-input-wrap'
  input.parentNode.insertBefore(wrapper, input)
  wrapper.append(input)
  const panel = document.createElement('div')
  panel.className = 'tag-input-panel category-input-panel'
  panel.hidden = true
  wrapper.append(panel)
  let matches = []
  let active = -1
  let open = false
  function refresh() {
    const typed = input.value.trim().toLowerCase()
    matches = options().filter((name) => name.toLowerCase().includes(typed))
      .sort((a,b) => Number(b.toLowerCase().startsWith(typed)) -
        Number(a.toLowerCase().startsWith(typed)) || a.localeCompare(b)).slice(0,40)
    active = -1
    panel.replaceChildren()
    matches.forEach((name) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'tag-chip tag-pick'
      button.textContent = name
      button.addEventListener('click', () => {
        input.value = name
        input.dispatchEvent(new Event('input', { bubbles: true }))
        open = false
        refresh()
        input.focus()
      })
      panel.append(button)
    })
    if (typed && !options().some((name) => name.toLowerCase() === typed)) {
      const hint = document.createElement('span')
      hint.className = 'tag-suggest-hint'
      hint.textContent = `Enter accepts "${input.value.trim()}" as a new category`
      panel.append(hint)
    }
    panel.hidden = !open || !panel.children.length
    panel.querySelectorAll('.tag-pick').forEach((b,i) => b.classList.toggle('active', i === active))
  }
  panel.addEventListener('mousedown', (event) => event.preventDefault())
  input.addEventListener('focus', () => { open = true; refresh() })
  input.addEventListener('input', () => { open = true; refresh() })
  input.addEventListener('blur', () => { open = false; refresh() })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!matches.length) return
      event.preventDefault()
      active = active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length-1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length
      panel.querySelectorAll('.tag-pick').forEach((b,i) => b.classList.toggle('active', i === active))
    } else if (event.key === 'Enter' && open && (input.value.trim() || active >= 0)) {
      event.preventDefault()
      if (active >= 0) input.value = matches[active]
      open = false
      refresh()
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation()
      open = false
      refresh()
    }
  })
}
attachCategorySuggestions('f-platform', () => getPlatformList(true))
attachCategorySuggestions('script-language', () => getLangList(true))
attachCategorySuggestions('term-category', () => getCategoryList(true))

const tagInputs = {
  commands: createTagInput(document.getElementById('f-tags-box'), 'commands'),
  scripts: createTagInput(
    document.getElementById('script-tags-box'),
    'scripts',
  ),
  terms: createTagInput(document.getElementById('term-tags-box'), 'terms'),
}

// ─── Resizable Add / Edit windows ─────────────────────────────────────
// The Add and Edit windows for commands, scripts and terms open wide and can be
// resized by dragging the grip in their bottom-right corner. The size you leave
// them at is remembered and shared by all three.
const MODAL_SIZE_KEY = 'spellbook_modal_size_v1'

function fitResizableModal(overlay) {
  const modal = overlay.querySelector('.resizable-modal')
  if (!modal) return
  modal.style.width = ''
  modal.style.height = ''
  try {
    const saved = JSON.parse(localStorage.getItem(MODAL_SIZE_KEY) || '{}')
    if (saved.w > 0)
      modal.style.width = `${Math.min(saved.w, window.innerWidth - 32)}px`
    if (saved.h > 0)
      modal.style.height = `${Math.min(saved.h, window.innerHeight - 32)}px`
  } catch {}
  // Centre it. It is positioned from its top-left corner so dragging the
  // bottom-right grip follows the pointer.
  const rect = modal.getBoundingClientRect()
  modal.style.left = `${Math.max(16, (window.innerWidth - rect.width) / 2)}px`
  modal.style.top = `${Math.max(16, (window.innerHeight - rect.height) / 2)}px`
}

{
  let startSize = null
  document.addEventListener(
    'pointerdown',
    (e) => {
      const modal = e.target.closest && e.target.closest('.resizable-modal')
      startSize = modal
        ? { modal, w: modal.offsetWidth, h: modal.offsetHeight }
        : null
    },
    true,
  )
  document.addEventListener(
    'pointerup',
    () => {
      if (!startSize) return
      const { modal, w, h } = startSize
      startSize = null
      // Only a drag of the grip changes the size.
      if (modal.offsetWidth === w && modal.offsetHeight === h) return
      try {
        localStorage.setItem(
          MODAL_SIZE_KEY,
          JSON.stringify({ w: modal.offsetWidth, h: modal.offsetHeight }),
        )
      } catch {}
    },
    true,
  )
}

// ─── Variables and options: details and the editor in the Edit window ─
// A command's `variables` list holds the names of its value variables (in
// order). `variableDetails` describes them, and also holds options in the style
// of a Linux man page (-a, --all, --width=COLS), each with its own description.
const VARIABLE_INFO_LABELS = [
  'Required?',
  'Position?',
  'Default value',
  'Accept pipeline input?',
  'Accept wildcard characters?',
]

const placeholderName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '_')
const trimText = (v) => (typeof v === 'string' ? v.trim() : '')

// A value variable has a name and type; an option has a short and/or long flag
// and optionally the name of the argument it takes.
function sanitizeVariableDetails(list) {
  if (!Array.isArray(list)) return []
  const out = []
  list.forEach((v) => {
    if (!v || typeof v !== 'object') return
    const info = (Array.isArray(v.info) ? v.info : [])
      .filter((i) => i && typeof i.label === 'string' && i.label.trim())
      .map((i) => ({
        label: i.label.trim(),
        value: typeof i.value === 'string' ? i.value : '',
      }))
    const description = typeof v.description === 'string' ? v.description : ''
    const details = typeof v.details === 'string' ? v.details : ''
    if (v.kind === 'option') {
      const short = trimText(v.short)
      const long = trimText(v.long)
      if (!short && !long) return
      out.push({
        kind: 'option',
        name: trimText(v.name) || long || short,
        short,
        long,
        argument: trimText(v.argument),
        description,
        details,
        info,
      })
      return
    }
    if (typeof v.name !== 'string' || !v.name.trim()) return
    const detail = {
      name: placeholderName(v.name),
      type: trimText(v.type),
      description,
      info,
    }
    if (detail.type || detail.description.trim() || detail.info.length) {
      out.push(detail)
    }
  })
  return out
}

const isOption = (detail) => detail.kind === 'option'

// Details for a value variable (options are separate).
const variableDetailFor = (cmd, name) =>
  (cmd.variableDetails || []).find((d) => !isOption(d) && d.name === name)

// How an option is written in a man page: "-w, --width=COLS".
// "--width=COLS", but "-size n" (find-style single-dash words)
const flagJoiner = (flag) => (flag.startsWith('--') ? '=' : ' ')

function optionHeading(option) {
  const arg = option.argument ? option.argument : ''
  return [
    option.short &&
      (arg && !option.long ? `${option.short} ${arg}` : option.short),
    option.long &&
      (arg ? `${option.long}${flagJoiner(option.long)}${arg}` : option.long),
  ]
    .filter(Boolean)
    .join(', ')
}

// The text put into the command template for an option. Options are optional
// groups, so they are left out unless used: a switch becomes a checkbox, and
// one with an argument becomes a field.
function optionTemplateText(option, which) {
  const flag = which === 'short' ? option.short : option.long
  if (!flag) return ''
  if (!option.argument) return `[${flag}]`
  const arg = `<${placeholderName(option.argument.replace(/[<>\[\]]/g, '')).toLowerCase()}>`
  return which === 'short'
    ? `[${flag} ${arg}]`
    : `[${flag}${flagJoiner(flag)}${arg}]`
}

// Splits an option's text into its first sentence (the synopsis) and the rest
// (the details). A period after e.g. / i.e. / etc. does not end a sentence.
function splitSynopsis(text) {
  const body = String(text).trim()
  const ends = /[.!?](?=\s|$)/g
  let m
  while ((m = ends.exec(body))) {
    const before = body.slice(0, m.index + 1)
    if (/(?:^|[\s(])(?:e\.g|i\.e|etc|vs|cf|approx)\.$/i.test(before)) continue
    return {
      synopsis: before.replace(/\s+/g, ' ').trim(),
      details: body.slice(m.index + 1).trim(),
    }
  }
  return { synopsis: body.replace(/\s+/g, ' '), details: '' }
}

// Reads the OPTIONS section of a man page (or --help output) and returns one
// option per entry:   -a, --all   /   -w, --width=COLS   /   --color[=WHEN]
function parseManOptions(text) {
  const tokenPattern =
    /^(--[A-Za-z0-9][\w-]*|-[A-Za-z0-9?][\w-]*)(?:\s*(?:\[=|=|\[|\s)\s*([<\[]?[A-Za-z_][\w.|-]*)(?:\[[^\]\s]*\])?[>\]]*\]?)?$/
  const parseHeader = (spec) => {
    const tokens = spec
      .split(/\s*,\s*/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (!tokens.length) return null
    const result = { short: '', long: '', argument: '' }
    for (const token of tokens) {
      const m = token.match(tokenPattern)
      if (!m) return null
      if (m[1].startsWith('--') || m[1].length > 2)
        result.long = result.long || m[1]
      else result.short = result.short || m[1]
      if (m[2] && !result.argument)
        result.argument = m[2].replace(/[<>\[\]]/g, '')
    }
    return result
  }
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const options = []
  let current = null
  const finish = () => {
    if (current) {
      current.description = current.lines.join('\n')
      options.push(current)
    }
    current = null
  }
  lines.forEach((raw) => {
    const trimmed = raw.trim()
    const startsFlag = /^-{1,2}[A-Za-z0-9?]/.test(trimmed)
    if (startsFlag) {
      // "-a, --all  description" (two or more spaces) or the flags alone
      const [spec, ...rest] = trimmed.split(/\s{2,}/)
      const header = parseHeader(spec)
      if (header) {
        finish()
        current = { kind: 'option', ...header, lines: [] }
        const inline = rest.join(' ').trim()
        if (inline) current.lines.push(inline)
        return
      }
      // "--help display this help": the flags, then a one-space description
      const flagsThenText = trimmed.match(
        /^(-{1,2}[A-Za-z0-9?][\w-]*(?:(?:\[=|=)\S+)?(?:\s*,\s*-{1,2}[A-Za-z0-9?][\w-]*(?:(?:\[=|=)\S+)?)*)\s+(\S.*)$/,
      )
      const inlineHeader = flagsThenText && parseHeader(flagsThenText[1])
      if (inlineHeader) {
        finish()
        current = { kind: 'option', ...inlineHeader, lines: [flagsThenText[2]] }
        return
      }
    }
    if (current) current.lines.push(trimmed)
  })
  finish()
  return options.map(({ lines: _lines, description, ...option }) => {
    // Wrapped lines of one paragraph become one line; blank lines separate
    // paragraphs.
    const paragraphs = description
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
    const { synopsis, details } = splitSynopsis(paragraphs.join('\n\n'))
    return { ...option, description: synopsis, details, info: [] }
  })
}

// Inserts text into the command template at the cursor (or replaces the
// selection).
function insertIntoTemplate(text) {
  const area = document.getElementById('f-cmd')
  const start = area.selectionStart ?? area.value.length
  const end = area.selectionEnd ?? start
  area.value = area.value.slice(0, start) + text + area.value.slice(end)
  const position = start + text.length
  area.focus()
  area.setSelectionRange(position, position)
}

const variableEditor = (() => {
  const host = document.getElementById('var-editor')
  let rows = []

  const field = (className, placeholder, value, onInput, tag = 'input') => {
    const el = document.createElement(tag)
    if (tag === 'input') el.type = 'text'
    else el.rows = 3
    el.className = className
    el.placeholder = placeholder
    el.value = value
    el.autocomplete = 'off'
    el.spellcheck = false
    el.addEventListener('input', () => onInput(el.value))
    return el
  }
  const button = (text, title, onClick, className = 'btn secondary sm') => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = className
    b.textContent = text
    if (title) b.title = title
    b.addEventListener('click', onClick)
    return b
  }

  function infoBlock(row) {
    const info = document.createElement('div')
    info.className = 'var-info'
    const drawInfo = () => {
      info.replaceChildren()
      row.info.forEach((item) => {
        const line = document.createElement('div')
        line.className = 'var-info-row'
        const label = field(
          'var-info-label',
          'Label',
          item.label,
          (v) => (item.label = v),
        )
        label.setAttribute('list', 'var-info-labels')
        const value = field(
          'var-info-value',
          'Value',
          item.value,
          (v) => (item.value = v),
        )
        const drop = button(
          '×',
          'Remove this line',
          () => {
            row.info = row.info.filter((i) => i !== item)
            drawInfo()
          },
          'tag-x',
        )
        line.append(label, value, drop)
        info.append(line)
      })
    }
    drawInfo()
    const actions = document.createElement('div')
    actions.className = 'var-info-actions'
    actions.append(
      button(
        '+ Add info',
        'Add a label and value, such as Required? true',
        () => {
          row.info.push({ label: '', value: '' })
          drawInfo()
          info
            .querySelector('.var-info-row:last-child .var-info-label')
            ?.focus()
        },
      ),
      button(
        'Add PowerShell info',
        'Add Required?, Position?, Default value, Accept pipeline input? and Accept wildcard characters?',
        () => {
          VARIABLE_INFO_LABELS.forEach((label) => {
            if (!row.info.some((i) => i.label === label))
              row.info.push({ label, value: '' })
          })
          drawInfo()
        },
      ),
    )
    const wrap = document.createElement('div')
    wrap.append(info, actions)
    return wrap
  }

  function valueCard(row) {
    const card = document.createElement('div')
    card.className = 'var-card'
    const head = document.createElement('div')
    head.className = 'var-card-head'
    const name = field(
      'var-name',
      'Name (e.g. ComputerName)',
      row.name,
      (v) => (row.name = v),
    )
    const type = field(
      'var-type',
      'Type (e.g. System.String[])',
      row.type,
      (v) => (row.type = v),
    )
    const insert = (open, close) => () => {
      const clean = placeholderName(row.name)
      if (!clean) return name.focus()
      insertIntoTemplate(`${open}${clean}${close}`)
    }
    head.append(
      name,
      type,
      button(
        'Insert <name>',
        'Put <name> into the command template at the cursor',
        insert('<', '>'),
      ),
      button(
        'Insert [name]',
        'Put the optional [name] into the command template at the cursor',
        insert('[', ']'),
      ),
      button(
        'Remove',
        'Remove this variable',
        () => {
          rows = rows.filter((r) => r !== row)
          render()
        },
        'btn danger sm',
      ),
    )
    card.append(
      head,
      field(
        'var-description',
        'What this variable is for…',
        row.description,
        (v) => (row.description = v),
        'textarea',
      ),
      infoBlock(row),
    )
    return card
  }

  function optionCard(row) {
    const card = document.createElement('div')
    card.className = 'var-card option'
    const head = document.createElement('div')
    head.className = 'var-card-head'
    const heading = document.createElement('div')
    heading.className = 'option-heading'
    const refreshHeading = () => {
      heading.textContent = optionHeading(row) || 'Option'
    }
    refreshHeading()
    const short = field('var-short', 'Short (e.g. -w)', row.short, (v) => {
      row.short = v.trim()
      refreshHeading()
    })
    const long = field('var-long', 'Long (e.g. --width)', row.long, (v) => {
      row.long = v.trim()
      refreshHeading()
    })
    const argument = field(
      'var-argument',
      'Argument (e.g. COLS), if it takes one',
      row.argument,
      (v) => {
        row.argument = v.trim()
        refreshHeading()
      },
    )
    const insertShort = button(
      'Insert short',
      'Put the short form into the command template at the cursor',
      () => {
        const text = optionTemplateText(row, 'short')
        if (!text) return short.focus()
        insertIntoTemplate(text)
      },
    )
    const insertLong = button(
      'Insert long',
      'Put the long form into the command template at the cursor',
      () => {
        const text = optionTemplateText(row, 'long')
        if (!text) return long.focus()
        insertIntoTemplate(text)
      },
    )
    const remove = button(
      'Remove',
      'Remove this option',
      () => {
        rows = rows.filter((r) => r !== row)
        render()
      },
      'btn danger sm',
    )
    head.append(short, long, argument, insertShort, insertLong, remove)
    card.append(
      heading,
      head,
      field(
        'var-description',
        'Synopsis: one sentence on what this option does…',
        row.description,
        (v) => (row.description = v),
        'textarea',
      ),
      field(
        'var-description var-details',
        'Details: everything beyond the first sentence…',
        row.details || '',
        (v) => (row.details = v),
        'textarea',
      ),
      infoBlock(row),
    )
    return card
  }

  function render() {
    host.replaceChildren()
    if (!rows.length) {
      const empty = document.createElement('div')
      empty.className = 'var-empty'
      empty.textContent =
        'No variables or options yet. Add one, paste a man page\'s options, or use "Add from template".'
      host.append(empty)
      return
    }
    rows.forEach((row) =>
      host.append(isOption(row) ? optionCard(row) : valueCard(row)),
    )
  }

  const blankValue = () => ({ name: '', type: '', description: '', info: [] })
  const blankOption = () => ({
    kind: 'option',
    short: '',
    long: '',
    argument: '',
    description: '',
    details: '',
    info: [],
  })
  const clone = (v) => JSON.parse(JSON.stringify(v))

  return {
    // names: the command's variable list; details: its variableDetails
    set(names, details) {
      const known = sanitizeVariableDetails(details)
      rows = []
      ;(names || []).forEach((name) => {
        const clean = placeholderName(name)
        if (!clean || rows.some((r) => !isOption(r) && r.name === clean)) return
        const detail = known.find((d) => !isOption(d) && d.name === clean)
        rows.push(detail ? clone(detail) : { ...blankValue(), name: clean })
      })
      known.filter(isOption).forEach((option) => rows.push(clone(option)))
      render()
    },
    get() {
      const names = []
      const seen = new Set()
      rows.forEach((row) => {
        if (isOption(row)) return
        const clean = placeholderName(row.name)
        if (clean && !seen.has(clean)) {
          seen.add(clean)
          names.push(clean)
        }
      })
      const details = sanitizeVariableDetails(
        rows.map((r) =>
          isOption(r) ? r : { ...r, name: placeholderName(r.name) },
        ),
      ).filter((d) => isOption(d) || seen.has(d.name))
      return { names, details }
    },
    add() {
      rows.push(blankValue())
      render()
      host.querySelector('.var-card:last-child .var-name')?.focus()
    },
    addOption() {
      rows.push(blankOption())
      render()
      host.querySelector('.var-card:last-child .var-short')?.focus()
    },
    // Adds the options found in pasted man page / --help text; returns how many.
    addFromManText(text) {
      const found = parseManOptions(text)
      let added = 0
      found.forEach((option) => {
        const duplicate = rows.some(
          (r) =>
            isOption(r) &&
            ((option.long && r.long === option.long) ||
              (!option.long && option.short && r.short === option.short)),
        )
        if (!duplicate) {
          rows.push(option)
          added += 1
        }
      })
      render()
      return added
    },
    // One variable per placeholder in the template that is not listed yet.
    detect(command) {
      getTemplateFields(command)
        .filter(
          (f) =>
            f.type !== 'choice' &&
            f.type !== 'conditionalChoice' &&
            f.type !== 'toggle',
        )
        .forEach((f) => {
          if (
            !rows.some(
              (r) => !isOption(r) && placeholderName(r.name) === f.name,
            )
          ) {
            rows.push({ ...blankValue(), name: f.name })
          }
        })
      render()
    },
  }
})()

document
  .getElementById('btn-var-add')
  .addEventListener('click', () => variableEditor.add())
document
  .getElementById('btn-var-add-option')
  .addEventListener('click', () => variableEditor.addOption())
document
  .getElementById('btn-var-detect')
  .addEventListener('click', () =>
    variableEditor.detect(document.getElementById('f-cmd').value),
  )

// Pasting a man page: the OPTIONS text becomes one option card per entry.
{
  const panel = document.getElementById('var-paste')
  const text = document.getElementById('var-paste-text')
  const message = document.getElementById('var-paste-message')
  const close = () => {
    panel.hidden = true
    text.value = ''
    message.textContent = ''
  }
  document.getElementById('btn-var-paste').addEventListener('click', () => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) text.focus()
  })
  document
    .getElementById('btn-var-paste-cancel')
    .addEventListener('click', close)
  document.getElementById('btn-var-paste-add').addEventListener('click', () => {
    const count = parseManOptions(text.value).length
    if (!count) {
      message.textContent =
        'No options found. Paste lines like "-a, --all" or "-w, --width=COLS" followed by their description.'
      return
    }
    const added = variableEditor.addFromManText(text.value)
    close()
    message.textContent = ''
    const note = document.getElementById('var-paste-note')
    note.textContent = `Added ${added} option${added === 1 ? '' : 's'}${count > added ? ` (${count - added} already listed)` : ''}.`
  })
}

// Whether the Options section starts expanded (Settings > Appearance).
const OPTIONS_OPEN_KEY = 'spellbook_options_open_v1'
function optionsDefaultOpen() {
  try {
    return localStorage.getItem(OPTIONS_OPEN_KEY) !== 'collapsed'
  } catch {
    return true
  }
}

// The detail pane's reference lists: variables, then options as in a man page.
function variableReferenceHtml(cmd) {
  const details = cmd.variableDetails || []
  const values = details.filter((d) => !isOption(d))
  const options = details.filter(isOption)
  const infoHtml = (d) => {
    const info = d.info
      .filter((i) => i.value || i.label)
      .map(
        (i) =>
          `<dt>${escapeHtml(i.label)}</dt><dd>${escapeHtml(i.value) || '&nbsp;'}</dd>`,
      )
      .join('')
    return info
      ? `<details class="var-ref-details"><summary>Info</summary><dl class="var-ref-info">${info}</dl></details>`
      : ''
  }
  const valueItems = values
    .map(
      (d) => `
        <div class="var-ref">
          <div class="var-ref-head"><code>${escapeHtml(d.name)}</code>${d.type ? ` <span class="var-ref-type">&lt;${escapeHtml(d.type)}&gt;</span>` : ''}</div>
          ${d.description ? `<div class="var-ref-desc">${escapeHtml(d.description)}</div>` : ''}
          ${infoHtml(d)}
        </div>`,
    )
    .join('')
  const optionItems = options
    .map(
      (d) => `
        <div class="var-ref">
          <div class="var-ref-head"><code>${escapeHtml(optionHeading(d))}</code></div>
          ${d.description ? `<div class="var-ref-desc">${escapeHtml(d.description)}</div>` : ''}
          ${d.details ? `<details class="var-ref-details"><summary>Details</summary><div class="var-ref-desc">${escapeHtml(d.details)}</div></details>` : ''}
          ${infoHtml(d)}
        </div>`,
    )
    .join('')
  return (
    (valueItems
      ? `<div class="section"><h3>Variable reference</h3>${valueItems}</div>`
      : '') +
    (optionItems
      ? `<details class="section options-section"${optionsDefaultOpen() ? ' open' : ''}><summary><h3>Options</h3></summary>${optionItems}</details>`
      : '')
  )
}

// The Edit / Delete buttons sit in the top right corner of the detail pane;
// this adds a second set at the bottom that press the originals.
{
  const detail = document.getElementById('detail')
  const addBottomActions = () => {
    const top = detail.querySelector(':scope > .detail-actions')
    if (!top || detail.querySelector(':scope > .detail-actions-bottom')) return
    const bottom = document.createElement('div')
    bottom.className = 'detail-actions-bottom'
    top.querySelectorAll('button').forEach((original) => {
      const copy = document.createElement('button')
      copy.type = 'button'
      copy.className = original.className
      copy.textContent = original.textContent
      copy.addEventListener('click', () => original.click())
      bottom.append(copy)
    })
    detail.append(bottom)
  }
  new MutationObserver(addBottomActions).observe(detail, { childList: true })
  addBottomActions()
}

// ─── Init ─────────────────────────────────────────────────────────────
load()
loadScripts()
loadTerms()
loadItemBaselines()
renderTrash()
renderTagFilter()
renderList()

// ─── Pages (navigation bar) ───────────────────────────────────────────
const PAGE_TITLES = {
  spellbook: 'Spell Book',
  guides: 'Guides',
  templates: 'Templates',
}

function showPage() {
  const requested = location.hash.replace(/^#\/?/, '')
  currentPage = Object.hasOwn(PAGE_TITLES, requested) ? requested : 'spellbook'
  Object.keys(PAGE_TITLES).forEach((page) => {
    document.getElementById(`page-${page}`).hidden = page !== currentPage
  })
  document.querySelectorAll('.nav-link').forEach((link) => {
    const active = link.dataset.page === currentPage
    link.classList.toggle('active', active)
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  document.title =
    currentPage === 'spellbook'
      ? 'Spell Book'
      : `${PAGE_TITLES[currentPage]} – Spell Book`
  if (currentPage === 'spellbook') {
    if (window.restoreSplitHeight) window.restoreSplitHeight()
    if (window.restoreControlsWidth) window.restoreControlsWidth()
  }
}

window.addEventListener('hashchange', showPage)
showPage()
renderSectionTitles()
applyCollapsedSections()
