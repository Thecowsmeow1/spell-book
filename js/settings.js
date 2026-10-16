    // ─── Settings ─────────────────────────────────────────────────────────
    const SETTINGS_KEY = "cmdref_settings_v1";
    const DEFAULT_THEME = {
      bg: "#0f1419", surface: "#1a2332", surface2: "#243044", border: "#2d3a4f",
      text: "#e7ecf3", muted: "#8b9bb4", accent: "#3b82f6", win: "#60a5fa", lin: "#34d399", ws: "#f97316", rs: "#fffb00", kb: "#00bfb3", ar: "#a855f7"
    };

    function applyTheme(theme) {
      Object.entries(theme).forEach(([key, value]) => document.documentElement.style.setProperty(`--${key}`, value));
    }

    function loadSettings() {
      try { return { ...DEFAULT_THEME, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
      catch { return { ...DEFAULT_THEME }; }
    }

    function saveSettings(theme) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(theme)); }

    function openSettings() {
      const theme = loadSettings();
      Object.keys(DEFAULT_THEME).forEach(key => document.getElementById(`color-${key}`).value = theme[key]);
      document.getElementById("settings-modal").classList.add("open");
    }

    function closeSettings() { document.getElementById("settings-modal").classList.remove("open"); }

    document.getElementById("btn-settings").addEventListener("click", openSettings);
    document.getElementById("btn-settings-close").addEventListener("click", closeSettings);
    document.getElementById("btn-settings-reset").addEventListener("click", () => {
      applyTheme(DEFAULT_THEME); saveSettings(DEFAULT_THEME);
      Object.keys(DEFAULT_THEME).forEach(key => document.getElementById(`color-${key}`).value = DEFAULT_THEME[key]);
    });
    document.getElementById("settings-modal").addEventListener("click", e => { if (e.target.id === "settings-modal") closeSettings(); });
    document.querySelectorAll(".color-setting").forEach(input => input.addEventListener("input", () => {
      const theme = loadSettings();
      theme[input.dataset.key] = input.value;
      applyTheme(theme); saveSettings(theme);
    }));


    // ─── Local data controls ─────────────────────────────────────────────
    document.getElementById("btn-clear-commands").addEventListener("click", () => {
      if (!confirm("Clear the browser's saved Spell Book commands?\n\nYour data/commands.txt baseline and data/commands.js backup will not be changed. The page will reload from TXT when available, otherwise from JS.")) return;
      localStorage.removeItem("spellbook_commands_v1");
      localStorage.removeItem("spellbook_trash_v1");
      localStorage.removeItem("spellbook_import_baseline_v1");
      location.reload();
    });

    document.getElementById("btn-clear-settings").addEventListener("click", () => {
      if (!confirm("Clear saved appearance settings and restore the default theme?\n\nYour commands will not be changed.")) return;
      localStorage.removeItem(SETTINGS_KEY);
      applyTheme(DEFAULT_THEME);
      Object.keys(DEFAULT_THEME).forEach(key => document.getElementById(`color-${key}`).value = DEFAULT_THEME[key]);
    });

    document.getElementById("btn-clear-all").addEventListener("click", () => {
      if (!confirm("Reset ALL local Spell Book data?\n\nThis clears browser-saved commands and appearance settings. Your data/commands.txt baseline and data/commands.js backup will not be changed.")) return;
      localStorage.removeItem("spellbook_commands_v1");
      localStorage.removeItem("spellbook_trash_v1");
      localStorage.removeItem("spellbook_import_baseline_v1");
      localStorage.removeItem(SETTINGS_KEY);
      location.reload();
    });

    applyTheme(loadSettings());


