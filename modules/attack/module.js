/*
 * The ATT&CK page: the MITRE ATT&CK Enterprise matrix (attack-data.js, built
 * by attack.py from the MITRE STIX bundle), ported from spell-book-hk. Click a
 * technique to see its description, detection strategies and log sources,
 * add indicators and notes of your own, and see the commands, scripts, terms
 * and notes of this book tagged with its id (or naming it in their text).
 * Only your indicators and notes are stored (spellbook_attack_notes_v1, the
 * same key as spell-book-hk), so a newer attack-data.js keeps them. See
 * js/core/pages.js for how modules work.
 */
SpellBook.module({
  id: 'attack',
  title: 'ATT&CK',
  tooltip: 'MITRE ATT&CK Enterprise matrix: tactics and techniques, with the entries of this book tied to them',
  routes: ['attack'],
  css: ['attack.css'],
  scripts: ['attack-data.js', 'attack.js', 'attack-tour.js'],
  html: `
    <div class="attack-tools">
      <input type="search" id="attack-search" placeholder="Search techniques: id, name, description, your indicators…" aria-label="Search techniques" autocomplete="off" />
      <label title="Show the sub-techniques under each technique"><input type="checkbox" id="attack-subs" /> sub-techniques</label>
      <label title="Only techniques that commands, scripts, terms or notes of this book are tied to"><input type="checkbox" id="attack-linked" /> only with entries</label>
      <span class="attack-muted" id="attack-version"></span>
    </div>
    <div class="attack-body">
      <div class="attack-matrix" id="attack-matrix"></div>
      <aside class="attack-detail" id="attack-detail" hidden aria-label="Technique"></aside>
    </div>`,
})
