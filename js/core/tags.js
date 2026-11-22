/*
 * Tags (core): the tag editor used under a command, script, term or note, and
 * the list of every tag in use, for suggestions. Classic-script globals:
 * bindTagEditor(item, persist, { host, onChange }) and allTagsEverywhere().
 */

// Every tag in use anywhere: each tab offers its tags with
//   SpellBook.tagSource({ id, tags: () => ['tag', …] })
// (Spells: commands, scripts and terms; the Compendium: notes). Suggestions
// while adding a tag come from here, so the same words get reused everywhere.
function allTagsEverywhere() {
  const all = []
  window.SpellBook.contributions('tags').forEach((source) => {
    try {
      all.push(...(source.tags() || []))
    } catch (error) {
      console.error(error)
    }
  })
  return [...new Set(all)].sort((a, b) => a.localeCompare(b))
}

// ─── Editing tags in the detail view ──────────────────────────────────
// Tags sit on their own row under the platform / language / category. Click a
// tag's × to remove it; type in the box and press Enter or a comma to add one.
// Changes are saved straight away. `persist` saves the item's collection;
// `onChange` redraws whatever shows the tags. Used for commands, scripts and
// terms (modules/spells/spells.js) and a note's tags (modules/compendium/notes.js).
function bindTagEditor(item, persist, { host = document.getElementById('entry-tags'), onChange } = {}) {
  if (!host) return

  const commit = (tags, refocus = true) => {
    // Noted before redrawing: removing the focused box fires focusout.
    const typing = host.contains(document.activeElement)
    item.tags = tags
    persist()
    if (onChange) onChange()
    if (typing) host.dataset.focus = 'input'
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

    // As you type, tags that already exist (on any command, script, term or
    // note) and match are listed; click one, or use the arrow keys and Enter,
    // to add it.
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
        ? allTagsEverywhere()
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
