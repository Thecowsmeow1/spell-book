// ─── Seed data (generalized from notes) ───────────────────────────────
    const SEED = window.SPELLBOOK_COMMANDS || [];

    // ─── State ────────────────────────────────────────────────────────────
    let commands = [];
    let currentFilter = "all";
    let currentTag = "all";
    let selectedId = null;
    let searchQuery = "";

    const STORAGE_KEY = "spellbook_commands_v1";
    const TRASH_STORAGE_KEY = "spellbook_trash_v1";
    const BASELINE_STORAGE_KEY = "spellbook_import_baseline_v1";
    let trashedCommands = [];
    let baselineCommandIds = new Set();
    let pendingImport = null;
    const OS_ID_PREFIXES = {
      Windows: "windows",
      Linux: "linux",
      Wireshark: "wireshark",
      "Routers+Switches": "routers-switches",
      Kibana: "kibana",
      Arkime: "arkime"
    };

    function osIdPrefix(os) {
      return OS_ID_PREFIXES[os] || "windows";
    }

    function normalizeCommandIds(commandList) {
      const usedByPrefix = {};
      return commandList.map(cmd => {
        const os = cmd && cmd.os ? cmd.os : "Windows";
        const prefix = osIdPrefix(os);
        const rawId = typeof cmd?.id === "string" ? cmd.id : "";
        const match = rawId.match(new RegExp(`^${prefix}-(\\d{4})$`, "i"));

        let nextNumber;
        if (match) {
          nextNumber = Number.parseInt(match[1], 10);
        } else {
          const used = usedByPrefix[prefix] || new Set();
          let candidate = 0;
          while (used.has(candidate)) candidate += 1;
          nextNumber = candidate;
          usedByPrefix[prefix] = used;
          used.add(nextNumber);
        }

        const used = usedByPrefix[prefix] || new Set();
        while (used.has(nextNumber)) {
          nextNumber += 1;
        }
        used.add(nextNumber);
        usedByPrefix[prefix] = used;

        return { ...cmd, id: `${prefix}-${String(nextNumber).padStart(4, "0")}` };
      });
    }

    function generateCommandId(os, existingCommands = commands) {
      const prefix = osIdPrefix(os);
      const used = new Set();
      existingCommands.forEach(cmd => {
        if (!cmd || cmd.os !== os) return;
        const match = String(cmd.id || "").match(new RegExp(`^${prefix}-(\\d{4})$`, "i"));
        if (match) used.add(Number.parseInt(match[1], 10));
      });

      let next = 0;
      while (used.has(next)) next += 1;
      return `${prefix}-${String(next).padStart(4, "0")}`;
    }

    // ─── Persistence ──────────────────────────────────────────────────────
    function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          commands = Array.isArray(stored) ? normalizeCommandIds(stored) : normalizeCommandIds([...SEED]);
        } else {
          commands = normalizeCommandIds([...SEED]);
        }
      } catch {
        commands = normalizeCommandIds([...SEED]);
      }

      try {
        const storedTrash = JSON.parse(localStorage.getItem(TRASH_STORAGE_KEY) || "[]");
        trashedCommands = Array.isArray(storedTrash) ? storedTrash.filter(cmd => cmd && typeof cmd === "object") : [];
      } catch {
        trashedCommands = [];
      }

      try {
        const storedBaseline = localStorage.getItem(BASELINE_STORAGE_KEY);
        baselineCommandIds = storedBaseline === null
          ? new Set(normalizeCommandIds([...SEED]).map(cmd => cmd.id))
          : new Set(JSON.parse(storedBaseline).filter(id => typeof id === "string"));
        if (storedBaseline === null) saveBaseline();
      } catch {
        baselineCommandIds = new Set(normalizeCommandIds([...SEED]).map(cmd => cmd.id));
        saveBaseline();
      }
    }

    function save() {
      // Persist only user-added / edited items that differ from pure seed,
      // but simplest reliable approach: store everything and on load prefer seed for known ids.
      // For "live add" we store the full list; seed is always the baseline.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
    }

    function saveTrash() {
      localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(trashedCommands));
    }

    function saveBaseline() {
      localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify([...baselineCommandIds]));
    }

    function getCommandChangeCounts() {
      const activeIds = new Set(commands.map(cmd => cmd.id));
      return {
        added: commands.filter(cmd => !baselineCommandIds.has(cmd.id)).length,
        deleted: [...baselineCommandIds].filter(id => !activeIds.has(id)).length
      };
    }

    // ─── Helpers ──────────────────────────────────────────────────────────
    function extractPlaceholders(cmd) {
      const matches = [...String(cmd).matchAll(/<([A-Za-z0-9_.-]+)>/g)];
      return [...new Set(matches.map(match => match[1]))];
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderReadmeMarkdown(markdown) {
      const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
      let html = "";
      let inList = false;
      let listType = "ul";
      let inCode = false;
      let paragraph = [];

      const inline = value => escapeHtml(value)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1</a>");

      const flushParagraph = () => {
        if (paragraph.length) {
          html += `<p>${inline(paragraph.join(" "))}</p>`;
          paragraph = [];
        }
      };

      const closeList = () => {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
      };

      lines.forEach(line => {
        if (line.trim().startsWith("````")) return;
        if (line.trim().startsWith("```")) {
          flushParagraph();
          closeList();
          html += inCode ? "</pre>" : "<pre>";
          inCode = !inCode;
          return;
        }
        if (inCode) {
          html += escapeHtml(line) + "\n";
          return;
        }
        if (!line.trim()) {
          flushParagraph();
          closeList();
          return;
        }

        const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
        const bullet = line.match(/^\s*[*-]\s+(.+)$/);
        const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
        const quote = line.match(/^\s*>\s?(.+)$/);
        if (heading) {
          flushParagraph();
          closeList();
          const level = heading[1].length;
          html += `<h${level}>${inline(heading[2])}</h${level}>`;
        } else if (bullet || numbered) {
          flushParagraph();
          const nextListType = numbered ? "ol" : "ul";
          if (inList && listType !== nextListType) closeList();
          if (!inList) {
            listType = nextListType;
            html += `<${listType}>`;
            inList = true;
          }
          html += `<li>${inline((bullet || numbered)[1])}</li>`;
        } else if (quote) {
          flushParagraph();
          closeList();
          html += `<blockquote>${inline(quote[1])}</blockquote>`;
        } else {
          paragraph.push(line.trim());
        }
      });

      flushParagraph();
      closeList();
      if (inCode) html += "</pre>";
      return html;
    }

    async function openReadme() {
      const modal = document.getElementById("readme-modal");
      const content = document.getElementById("readme-content");
      modal.classList.add("open");
      content.innerHTML = `<p class="readme-loading">Loading README…</p>`;
      try {
        const response = await fetch("README.md");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        content.innerHTML = renderReadmeMarkdown(await response.text());
      } catch {
        content.innerHTML = `<p>README.md could not be loaded in this browser context.</p><p><a href="README.md" target="_blank" rel="noreferrer">Open README.md separately</a> or run the Spell Book through a local web server.</p>`;
      }
    }

    function closeReadme() {
      document.getElementById("readme-modal").classList.remove("open");
    }

    function getOsBadgeClass(os) {
      return {
        Windows: "win",
        Linux: "lin",
        Wireshark: "ws",
        "Routers+Switches": "rs",
        Kibana: "kb",
        Arkime: "ar"
      }[os] || "lin";
    }

    function highlight(text, q) {
      if (!q) return escapeHtml(text);
      const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      return escapeHtml(text).replace(re, "<mark style='background:#3b82f6;color:#fff;padding:0 2px;border-radius:2px'>$1</mark>");
    }

    // ─── Render list ──────────────────────────────────────────────────────
    function getFiltered() {
      let list = commands;
      if (currentFilter !== "all") {
        list = list.filter(c => c.os === currentFilter);
      }
      if (currentTag !== "all") {
        list = list.filter(c => (c.tags || []).includes(currentTag));
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter(c => {
          const blob = [
            c.title, c.description, c.command, c.example, c.notes,
            (c.variables || []).join(" "), (c.tags || []).join(" "), c.os
          ].join(" ").toLowerCase();
          return blob.includes(q);
        });
      }
      return list;
    }

    function renderTagFilter() {
      const select = document.getElementById("tag-filter");
      const tags = [...new Set(commands.flatMap(c => c.tags || []))].sort((a,b) => a.localeCompare(b));
      const previous = currentTag;
      select.innerHTML = `<option value="all">All Tags</option>` + tags.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
      select.value = tags.includes(previous) ? previous : "all";
      currentTag = select.value;
    }

    function renderList() {
      const listEl = document.getElementById("cmd-list");
      const countEl = document.getElementById("sidebar-count");
      const filtered = getFiltered();

      if (countEl) {
        document.getElementById("command-total").textContent = `${filtered.length} command${filtered.length === 1 ? "" : "s"}`;
        const changes = getCommandChangeCounts();
        document.getElementById("added-command-count").textContent = `+${changes.added}`;
        document.getElementById("deleted-command-count").textContent = `-${changes.deleted}`;
      }

      if (filtered.length === 0) {
        listEl.innerHTML = `<div style="padding:1rem;color:var(--muted);font-size:0.85rem;text-align:center">No matches</div>`;
        return;
      }
      listEl.innerHTML = filtered.map(c => `
        <div class="cmd-item ${c.id === selectedId ? "active" : ""}" data-id="${c.id}">
          <div class="title">${highlight(c.title, searchQuery)}</div>
          <div class="meta">
            <span class="badge ${getOsBadgeClass(c.os)}">${c.os}</span>
            <span>${(c.variables && c.variables.length) ? c.variables.length + " var(s)" : "no vars"}</span>
          </div>
          ${(c.tags || []).length ? `<div class="item-tags">${c.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
        </div>
      `).join("");

      listEl.querySelectorAll(".cmd-item").forEach(el => {
        el.addEventListener("click", () => {
          selectedId = el.dataset.id;
          renderList();
          renderDetail();
        });
      });
    }

    // ─── Render detail ────────────────────────────────────────────────────
    function renderDetail() {
      const el = document.getElementById("detail");
      const cmd = commands.find(c => c.id === selectedId);
      if (!cmd) {
        el.innerHTML = `<div class="empty-state">Select a command from the list or use search.</div>`;
        return;
      }

      const vars = (cmd.variables && cmd.variables.length)
        ? cmd.variables
        : extractPlaceholders(cmd.command);

      let varsHtml = "";
      if (vars.length) {
        varsHtml = `
          <div class="section">
            <h3>Variables – fill to generate ready-to-run command</h3>
            <div class="vars-grid" id="vars-grid">
              ${vars.map(v => `
                <div class="var-field">
                  <label for="var-${escapeHtml(v)}">&lt;${escapeHtml(v)}&gt;</label>
                  <input type="text" id="var-${escapeHtml(v)}" data-var="${escapeHtml(v)}" placeholder="${escapeHtml(v)}" />
                </div>
              `).join("")}
            </div>
            <div class="filled-cmd">
              <h3 style="margin-top:1rem">Generated Command</h3>
              <pre class="cmd" id="generated-cmd"><button class="copy-btn" data-target="generated-cmd">Copy</button><code id="generated-code">${escapeHtml(cmd.command)}</code></pre>
            </div>
          </div>
        `;
      }

      el.innerHTML = `
        <h2>${escapeHtml(cmd.title)}</h2>
        <div class="entry-labels">
          <span class="badge ${getOsBadgeClass(cmd.os)}">${cmd.os}</span>
          ${(cmd.tags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}
        </div>

        ${cmd.description ? `
          <div class="section">
            <h3>Description / Use Case</h3>
            <p class="desc">${escapeHtml(cmd.description)}</p>
          </div>
        ` : ""}

        <div class="section">
          <h3>Command Template</h3>
          <pre class="cmd"><button class="copy-btn" data-target="template-cmd">Copy</button><code id="template-cmd">${escapeHtml(cmd.command)}</code></pre>
        </div>

        ${varsHtml}

        ${cmd.example ? `
          <div class="section">
            <h3>Example</h3>
            <pre class="cmd"><button class="copy-btn" data-target="example-cmd">Copy</button><code id="example-cmd">${escapeHtml(cmd.example)}</code></pre>
          </div>
        ` : ""}

        ${cmd.notes ? `
          <div class="section">
            <h3>Notes</h3>
            <div class="notes">${escapeHtml(cmd.notes)}</div>
          </div>
        ` : ""}

        <div class="detail-actions">
          <button class="btn secondary sm" id="btn-edit">Edit</button>
          <button class="btn danger sm" id="btn-delete">Delete</button>
        </div>
      `;

      // Variable live substitution
      if (vars.length) {
        const inputs = el.querySelectorAll("#vars-grid input");
        const update = () => {
          let filled = cmd.command;
          inputs.forEach(inp => {
            const val = inp.value.trim();
            const placeholder = "<" + inp.dataset.var + ">";
            if (val) {
              filled = filled.split(placeholder).join(val);
            }
          });
          document.getElementById("generated-code").textContent = filled;
        };
        inputs.forEach(inp => inp.addEventListener("input", update));
      }

      // Copy buttons
      el.querySelectorAll(".copy-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const targetId = btn.dataset.target;
          const codeEl = document.getElementById(targetId === "generated-cmd" ? "generated-code" : targetId);
          const text = codeEl ? codeEl.textContent : "";
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = "Copied!";
            setTimeout(() => btn.textContent = "Copy", 1200);
          });
        });
      });

      document.getElementById("btn-edit").addEventListener("click", () => openModal(cmd));
      document.getElementById("btn-delete").addEventListener("click", () => {
        if (confirm(`Delete "${cmd.title}"?`)) {
          commands = commands.filter(c => c.id !== cmd.id);
          trashedCommands.push(cmd);
          selectedId = null;
          save();
          saveTrash();
          renderTrash();
          renderList();
          renderDetail();
        }
      });
    }

    // ─── Modal ────────────────────────────────────────────────────────────
    function openModal(existing = null) {
      document.getElementById("modal-title").textContent = existing ? "Edit Command" : "Add Command";
      document.getElementById("edit-id").value = existing ? existing.id : "";
      document.getElementById("f-title").value = existing ? existing.title : "";
      document.getElementById("f-os").value = existing ? existing.os : "Windows";
      document.getElementById("f-tags").value = existing && existing.tags ? existing.tags.join(", ") : "";
      document.getElementById("f-desc").value = existing ? (existing.description || "") : "";
      document.getElementById("f-cmd").value = existing ? existing.command : "";
      document.getElementById("f-vars").value = existing && existing.variables ? existing.variables.join(", ") : "";
      document.getElementById("f-example").value = existing ? (existing.example || "") : "";
      document.getElementById("f-notes").value = existing ? (existing.notes || "") : "";
      document.getElementById("modal").classList.add("open");
      document.getElementById("f-title").focus();
    }

    function closeModal() {
      document.getElementById("modal").classList.remove("open");
    }

    function renderTrash() {
      const list = document.getElementById("trash-list");
      document.getElementById("trash-count").textContent = trashedCommands.length;
      document.getElementById("btn-empty-trash").disabled = trashedCommands.length === 0;

      if (trashedCommands.length === 0) {
        list.innerHTML = `<div class="empty-state">Trash is empty.</div>`;
        return;
      }

      list.innerHTML = trashedCommands.map(cmd => `
        <div class="trash-item">
          <div class="trash-item-info">
            <strong>${escapeHtml(cmd.title || "Untitled command")}</strong>
            <span class="badge ${getOsBadgeClass(cmd.os)}">${escapeHtml(cmd.os || "Unknown")}</span>
          </div>
          <div class="trash-item-actions">
            <button type="button" class="btn secondary sm" data-restore-id="${escapeHtml(cmd.id)}">Restore</button>
            <button type="button" class="btn danger sm" data-delete-id="${escapeHtml(cmd.id)}">Delete forever</button>
          </div>
        </div>
      `).join("");

      list.querySelectorAll("[data-restore-id]").forEach(button => {
        button.addEventListener("click", () => {
          const index = trashedCommands.findIndex(cmd => cmd.id === button.dataset.restoreId);
          if (index < 0) return;
          const [command] = trashedCommands.splice(index, 1);
          if (commands.some(cmd => cmd.id === command.id)) {
            command.id = generateCommandId(command.os, [...commands, ...trashedCommands]);
          }
          commands.push(command);
          selectedId = command.id;
          save();
          saveTrash();
          renderTrash();
          renderList();
          renderDetail();
        });
      });

      list.querySelectorAll("[data-delete-id]").forEach(button => {
        button.addEventListener("click", () => {
          const command = trashedCommands.find(cmd => cmd.id === button.dataset.deleteId);
          if (!command || !confirm(`Permanently delete "${command.title}"?`)) return;
          trashedCommands = trashedCommands.filter(cmd => cmd.id !== command.id);
          saveTrash();
          renderTrash();
        });
      });
    }

    function openTrash() {
      renderTrash();
      document.getElementById("trash-modal").classList.add("open");
    }

    function closeTrash() {
      document.getElementById("trash-modal").classList.remove("open");
    }

    // ─── Events ───────────────────────────────────────────────────────────
    document.getElementById("search").addEventListener("input", e => {
      searchQuery = e.target.value.trim();
      renderList();
    });

    document.querySelectorAll(".filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        renderList();
      });
    });

    document.getElementById("tag-filter").addEventListener("change", e => {
      currentTag = e.target.value;
      renderList();
    });

    document.getElementById("btn-add").addEventListener("click", () => openModal());
    document.getElementById("btn-trash").addEventListener("click", openTrash);
    document.getElementById("btn-trash-close").addEventListener("click", closeTrash);
    document.getElementById("trash-modal").addEventListener("click", e => {
      if (e.target === document.getElementById("trash-modal")) closeTrash();
    });
    document.getElementById("btn-empty-trash").addEventListener("click", () => {
      if (trashedCommands.length && confirm(`Permanently delete all ${trashedCommands.length} trashed commands?`)) {
        trashedCommands = [];
        saveTrash();
        renderTrash();
      }
    });
    document.getElementById("btn-readme").addEventListener("click", openReadme);
    document.getElementById("btn-readme-close").addEventListener("click", closeReadme);
    document.getElementById("readme-modal").addEventListener("click", e => {
      if (e.target === document.getElementById("readme-modal")) closeReadme();
    });
    document.getElementById("btn-cancel").addEventListener("click", closeModal);

    function getImportPreview(mode) {
      if (!pendingImport) return;
      const importedIds = new Set(pendingImport.commands.map(command => command.id));
      const currentIds = new Set(commands.map(command => command.id));
      const updates = pendingImport.commands.filter(command => currentIds.has(command.id)).length;
      const additions = pendingImport.commands.length - updates;
      const removed = commands.filter(command => !importedIds.has(command.id)).length;
      const resultCount = mode === "merge" ? commands.length + additions : pendingImport.commands.length;

      document.getElementById("import-impact").textContent = mode === "merge"
        ? `Merge will add ${additions}, update ${updates} matching IDs, and keep ${removed} current commands not in this file. Result: ${resultCount} commands.`
        : `Replace will add ${additions}, update ${updates} matching IDs, and remove ${removed} current commands not in this file. Result: ${resultCount} commands.`;
      document.getElementById("btn-import-apply").textContent = mode === "merge" ? "Merge Commands" : "Replace Commands";
    }

    function openImportPreview(fileName, importedCommands) {
      pendingImport = { fileName, commands: normalizeCommandIds(importedCommands) };
      document.getElementById("import-preview-file").textContent = fileName;
      document.getElementById("import-preview-count").textContent = `${pendingImport.commands.length} command${pendingImport.commands.length === 1 ? "" : "s"}`;
      document.getElementById("import-mode").value = "replace";
      getImportPreview("replace");
      document.getElementById("import-preview-modal").classList.add("open");
    }

    function closeImportPreview() {
      document.getElementById("import-preview-modal").classList.remove("open");
      pendingImport = null;
    }

    function applyImport() {
      if (!pendingImport) return;
      const mode = document.getElementById("import-mode").value;
      if (mode === "merge") {
        const merged = new Map(commands.map(command => [command.id, command]));
        pendingImport.commands.forEach(command => merged.set(command.id, command));
        commands = normalizeCommandIds([...merged.values()]);
      } else {
        commands = pendingImport.commands;
      }

      baselineCommandIds = new Set(commands.map(command => command.id));
      saveBaseline();
      selectedId = null;
      save();
      renderTagFilter();
      renderList();
      renderDetail();
      closeImportPreview();
    }

    document.getElementById("import-mode").addEventListener("change", event => getImportPreview(event.target.value));
    document.getElementById("btn-import-preview-cancel").addEventListener("click", closeImportPreview);
    document.getElementById("btn-import-apply").addEventListener("click", applyImport);

    document.getElementById("cmd-form").addEventListener("submit", e => {
      e.preventDefault();
      const title = document.getElementById("f-title").value.trim();
      const os = document.getElementById("f-os").value;
      const existingId = document.getElementById("edit-id").value;
      const id = existingId || generateCommandId(os, [...commands, ...trashedCommands]);
      const tags = [...new Set(document.getElementById("f-tags").value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean))];
      const description = document.getElementById("f-desc").value.trim();
      const command = document.getElementById("f-cmd").value.trim();
      const varsRaw = document.getElementById("f-vars").value.trim();
      const variables = varsRaw
        ? varsRaw.split(",").map(v => v.trim()).filter(Boolean)
        : extractPlaceholders(command);
      const example = document.getElementById("f-example").value.trim();
      const notes = document.getElementById("f-notes").value.trim();

      const entry = { id, title, os, tags, description, command, variables, example, notes };

      const idx = commands.findIndex(c => c.id === id);
      if (idx >= 0) {
        commands[idx] = entry;
      } else {
        commands.push(entry);
      }
      selectedId = id;
      save();
      closeModal();
      renderList();
      renderDetail();
    });

    // ─── Import / Export ─────────────────────────────────────────────────
    // Browsers cannot silently overwrite data/commands.js on disk. Import replaces
    // the active Spell Book dataset in this browser; Export produces a replacement
    // commands.txt with the same assignment syntax as data/commands.js.
    const importFile = document.getElementById("import-file");

    document.getElementById("btn-import").addEventListener("click", () => {
      importFile.value = "";
      importFile.click();
    });

    importFile.addEventListener("change", async () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        let imported;

        if (file.name.toLowerCase().endsWith(".json")) {
          imported = JSON.parse(text);
        } else {
          // Accept the exact TXT format exported by this Spell Book:
          // window.SPELLBOOK_COMMANDS = [ ... ];
          const match = text.match(/window\.SPELLBOOK_COMMANDS\s*=\s*([\s\S]*?)\s*;?\s*$/);
          if (!match) throw new Error("This .txt file does not define window.SPELLBOOK_COMMANDS.");
          imported = JSON.parse(match[1]);
        }

        if (!Array.isArray(imported)) throw new Error("Imported data must be an array of commands.");
        if (!imported.every(c => c && typeof c === "object" && c.id && c.title && c.os && typeof c.command === "string")) {
          throw new Error("One or more command entries are missing required fields.");
        }

        openImportPreview(file.name, imported);
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    });

    document.getElementById("btn-export").addEventListener("click", () => {
      const contents = "// Spell Book command data\nwindow.SPELLBOOK_COMMANDS = " + JSON.stringify(commands, null, 2) + ";\n";
      const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "commands.txt";
      a.click();
      URL.revokeObjectURL(url);
    });

    // Keyboard: Esc closes open dialogs
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closeModal();
        closeSettings();
        closeReadme();
        closeTrash();
        closeImportPreview();
        return;
      }

      if (document.querySelector(".modal-overlay.open")) return;
      const key = e.key.toLowerCase();
      const targetIsEditable = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']");

      if (key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !targetIsEditable) {
        e.preventDefault();
        document.getElementById("search").focus();
      } else if (key === "a" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !targetIsEditable) {
        e.preventDefault();
        openModal();
      }
    });



    // ─── Init ─────────────────────────────────────────────────────────────
    load();
    renderTrash();
    renderTagFilter();
    renderList();
