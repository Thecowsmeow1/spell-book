/*
 * "Auto" language for code blocks in the Compendium.
 *
 * Loaded BEFORE notes.js, which calls window.NoteCodeLang.resolve() whenever it
 * colors a code block (and js/sealed-tomes.js does the same in Sealed Tomes). A
 * block whose language is "auto" is colored with a guess made from its text:
 * PowerShell, bash, batch, Python, SQL, or generic when nothing matches. Any
 * other language is returned unchanged, so a block you set by hand stays put.
 * The block stores data-lang="auto"; the guess is made fresh each time, so it
 * follows edits.
 */
;(() => {
  function guess(text) {
    if (/^#!.*\b(ba|z)?sh\b/.test(text)) return 'bash'
    if (
      /\b(Get|Set|New|Remove|Invoke|Write|Install|Import|Start|Stop)-[A-Z]\w+|\$\w+\s*=|\bparam\s*\(|\$_\b|\|\s*%\s*\{/.test(
        text,
      )
    ) {
      return 'powershell'
    }
    if (/^\s*(def|import|from|class)\s.+/m.test(text) && /:\s*$/m.test(text)) return 'python'
    if (/^\s*@?echo\s|%\w+%|^\s*rem\s|^\s*set\s+\w+=/im.test(text)) return 'batch'
    if (/\bselect\b[\s\S]+\bfrom\b/i.test(text)) return 'sql'
    if (
      /^\s*(sudo|apt|apt-get|echo|export|cd|ls|cat|grep|kubectl|systemctl|curl|chmod|docker)\b|\$\(|^\s*(if|for|while)\b.*;\s*(then|do)\b/m.test(
        text,
      )
    ) {
      return 'bash'
    }
    return 'generic'
  }

  window.NoteCodeLang = {
    guess,
    resolve: (lang, text) => (lang === 'auto' ? guess(String(text)) : lang),
  }
})()
