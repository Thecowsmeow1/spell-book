/*
 * Code reference tools: FTP, HTTP and SMTP reply codes and Microsoft's Windows
 * events to monitor, each a table with a search box and a group filter. Reference only. Loaded after tools.js and before tools-layout.js.
 *
 * Column widths: drag the divider at a heading's right edge (or focus it and
 * use ← →); double-click it, or press Home, to reset that table. Saved under
 * spellbook_code_columns_v1 as { "table title": [pixels] }. A table that was
 * never resized fits each column to its contents.
 *
 * Rows are written one per line as "cell | cell | …"; a line starting with #
 * names the group of the rows under it.
 */
;(() => {
  const T = window.SpellBookTools
  if (!T) return
  const { el, labelled, input, tool } = T

  const read = (text) => {
    let group = ''
    const rows = []
    text.split('\n').forEach((line) => {
      const t = line.trim()
      if (!t) return
      if (t.startsWith('#')) group = t.slice(1).trim()
      else rows.push({ group, cells: t.split(' | ') })
    })
    return rows
  }

  // ─── Column widths ──────────────────────────────────────────────────
  const WIDTHS_KEY = 'spellbook_code_columns_v1'
  const MIN_WIDTH = 60
  const resets = []
  function readWidths() {
    try {
      const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}')
      return saved && typeof saved === 'object' ? saved : {}
    } catch {
      return {}
    }
  }
  function saveWidths(title, widths) {
    const all = readWidths()
    if (widths) all[title] = widths
    else delete all[title]
    try {
      if (Object.keys(all).length) localStorage.setItem(WIDTHS_KEY, JSON.stringify(all))
      else localStorage.removeItem(WIDTHS_KEY)
    } catch {}
  }

  function resizable(table, title) {
    const headers = [...table.querySelectorAll('th')]
    const group = el('colgroup')
    const cols = headers.map(() => group.appendChild(el('col')))
    table.prepend(group)
    let widths = null // pixels; null while the columns size themselves

    const apply = () => {
      table.classList.toggle('sized', Boolean(widths))
      cols.forEach((col, i) => (col.style.width = widths ? `${widths[i]}px` : ''))
      table.style.width = widths ? `${widths.reduce((a, b) => a + b, 0)}px` : ''
    }
    // The widths on screen, as the start of a resize.
    const measure = () => {
      if (!widths) widths = headers.map((th) => Math.round(th.getBoundingClientRect().width))
    }
    const resize = (i, width) => {
      widths[i] = Math.max(MIN_WIDTH, Math.round(width))
      apply()
    }
    const reset = () => {
      widths = null
      apply()
      saveWidths(title, null)
    }
    resets.push(() => {
      widths = null
      apply()
    })

    headers.forEach((th, i) => {
      const handle = el('span', 'codes-resizer')
      handle.tabIndex = 0
      handle.setAttribute('role', 'separator')
      handle.setAttribute('aria-orientation', 'vertical')
      handle.setAttribute('aria-label', `Width of the ${th.textContent} column`)
      handle.title = 'Drag to resize (double-click to fit the contents again)'
      th.append(handle)
      handle.addEventListener('dblclick', reset)
      handle.addEventListener('keydown', (e) => {
        const step = { ArrowLeft: -20, ArrowRight: 20 }[e.key]
        if (!step && e.key !== 'Home') return
        e.preventDefault()
        if (!step) return reset()
        measure()
        resize(i, widths[i] + step)
        saveWidths(title, widths)
      })
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        handle.setPointerCapture(e.pointerId)
        handle.classList.add('dragging')
        const from = e.clientX
        let start = null
        const move = (event) => {
          // A click, or the first of a double-click, changes nothing.
          if (start === null && Math.abs(event.clientX - from) < 3) return
          if (start === null) {
            measure()
            start = widths[i]
          }
          resize(i, start + event.clientX - from)
        }
        const end = () => {
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', end)
          handle.removeEventListener('pointercancel', end)
          handle.classList.remove('dragging')
          if (start !== null) saveWidths(title, widths)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', end)
        handle.addEventListener('pointercancel', end)
      })
    })

    const saved = readWidths()[title]
    if (Array.isArray(saved) && saved.length === headers.length && saved.every((w) => w >= MIN_WIDTH)) widths = [...saved]
    apply()
  }

  window.SpellBook.settingGroup({
    id: 'codeColumns',
    title: 'Code table columns',
    sub: 'the column widths of the code tables on Tools',
    order: 93,
    keys: [WIDTHS_KEY],
  })
  // Clear Settings: columns size themselves again.
  document.addEventListener('spellbook:settings-reset', () => {
    try {
      localStorage.removeItem(WIDTHS_KEY)
    } catch {}
    resets.forEach((reset) => reset())
  })

  // filterName: what the groups are called; groupColumn: false when a column
  // already shows them; source: { label, url } for a table taken from elsewhere.
  function codeTable({ title, blurb, columns, rows, placeholder, source, filterName = 'Group', groupColumn = true }) {
    const card = tool(title, blurb)
    card.classList.add('tool-codes')
    if (source) {
      const line = el('p', 'codes-source', 'Source: ')
      const link = el('a', '', source.label)
      link.href = source.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      line.append(link)
      card.append(line)
    }
    const search = input(placeholder)
    search.type = 'search'
    const groups = [...new Set(rows.map((r) => r.group))]
    const select = el('select')
    select.append(new Option('All', ''), ...groups.map((g) => new Option(g, g)))
    const controls = el('div', 'tool-row codes-controls')
    controls.append(labelled('Search', search), labelled(filterName, select))
    const count = el('p', 'codes-count')
    count.setAttribute('role', 'status')

    const table = el('table', 'codes-table')
    const head = el('tr')
    ;[...columns, ...(groupColumn ? [filterName] : [])].forEach((name) => {
      const th = el('th', '', name)
      th.scope = 'col'
      head.append(th)
    })
    const thead = el('thead')
    thead.append(head)
    const body = el('tbody')
    const lines = rows.map((row) => {
      const tr = el('tr')
      columns.forEach((_, i) => tr.append(el('td', i ? '' : 'codes-code', row.cells[i] || '')))
      if (groupColumn) tr.append(el('td', 'codes-group', row.group))
      body.append(tr)
      return { tr, group: row.group, code: row.cells[0].toLowerCase(), text: [...row.cells, row.group].join(' ').toLowerCase() }
    })
    table.append(thead, body)
    resizable(table, title)
    const scroll = el('div', 'codes-scroll')
    scroll.append(table)
    card.append(controls, count, scroll)

    const filter = () => {
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean)
      // A number looks up codes: the rows whose code starts with it.
      const number = words.length === 1 && /^(\d|0x)[\d.x a-f]*$/.test(words[0]) ? words[0] : ''
      const byCode = number && lines.some((l) => l.code.startsWith(number))
      let shown = 0
      lines.forEach((line) => {
        const match =
          (!select.value || line.group === select.value) &&
          (byCode ? line.code.startsWith(number) : words.every((w) => line.text.includes(w)))
        line.tr.hidden = !match
        if (match) shown += 1
      })
      count.textContent = shown === lines.length ? `${shown} entries` : shown ? `${shown} of ${lines.length} entries` : 'Nothing matches.'
    }
    search.addEventListener('input', filter)
    select.addEventListener('change', filter)
    filter()
  }

  // ─── FTP (RFC 959, 2228, 2428) ──────────────────────────────────────
  codeTable({
    title: 'FTP codes',
    blurb: 'FTP server reply codes (RFC 959, with the security and IPv6 extensions of RFC 2228 and 2428). Servers word the text their own way.',
    columns: ['Code', 'Meaning'],
    placeholder: 'code or words, such as 530 or passive',
    rows: read(`
      # 1xx Preliminary
      110 | Restart marker reply
      120 | Service ready in a few minutes
      125 | Data connection already open; transfer starting
      150 | File status okay; about to open the data connection
      # 2xx Success
      200 | Command okay
      202 | Command not implemented, not needed at this site
      211 | System status, or help reply
      212 | Directory status
      213 | File status
      214 | Help message
      215 | System type
      220 | Service ready for new user
      221 | Service closing the control connection
      225 | Data connection open; no transfer in progress
      226 | Closing data connection; the file action succeeded
      227 | Entering passive mode
      228 | Entering long passive mode
      229 | Entering extended passive mode
      230 | User logged in
      232 | User logged in, authorized by the security data exchange
      234 | Security mechanism accepted (AUTH)
      235 | Security data exchange completed
      250 | Requested file action completed
      257 | Path name created, or the current directory
      # 3xx More needed
      331 | User name okay; password needed
      332 | Account needed for login
      334 | Security mechanism accepted; security data needed
      335 | Security data acceptable; more needed
      350 | File action waiting for further information
      # 4xx Temporary failure
      421 | Service not available; closing the control connection
      425 | Cannot open the data connection
      426 | Connection closed; transfer aborted
      430 | Invalid user name or password (used by some servers)
      434 | Requested host unavailable
      450 | File action not taken; file unavailable (such as busy)
      451 | Action aborted: local error in processing
      452 | Action not taken: not enough storage
      # 5xx Permanent failure
      500 | Syntax error; command not recognized
      501 | Syntax error in parameters
      502 | Command not implemented
      503 | Bad sequence of commands
      504 | Command not implemented for that parameter
      522 | Network protocol not supported
      530 | Not logged in
      532 | Account needed for storing files
      533 | Protection level denied for policy reasons
      534 | Request denied for policy reasons
      535 | Security check failed
      536 | Protection level not supported by the security mechanism
      550 | Action not taken; file unavailable (such as not found or no access)
      551 | Action aborted: page type unknown
      552 | File action aborted: storage allocation exceeded
      553 | Action not taken: file name not allowed
    `),
  })

  // ─── HTTP (IANA status code registry) ───────────────────────────────
  codeTable({
    title: 'HTTP codes',
    blurb: 'HTTP response status codes from the standard registry. Codes that single vendors add are not listed.',
    columns: ['Code', 'Name', 'Meaning'],
    placeholder: 'code or words, such as 404 or redirect',
    rows: read(`
      # 1xx Informational
      100 | Continue | Send the rest of the request
      101 | Switching Protocols | The server is changing protocol, such as to WebSocket
      102 | Processing | Still working on it (WebDAV)
      103 | Early Hints | Headers to preload before the final response
      # 2xx Success
      200 | OK | The request succeeded
      201 | Created | A new resource was created
      202 | Accepted | Accepted, not yet processed
      203 | Non-Authoritative Information | Changed by a proxy
      204 | No Content | Succeeded, nothing to send back
      205 | Reset Content | Clear the form or view
      206 | Partial Content | Part of the resource, for a range request
      207 | Multi-Status | Several results in one response (WebDAV)
      208 | Already Reported | Listed earlier in the response (WebDAV)
      226 | IM Used | The result of changes applied to the resource
      # 3xx Redirection
      300 | Multiple Choices | More than one possible response
      301 | Moved Permanently | Use the new address from now on
      302 | Found | Temporarily at another address
      303 | See Other | Fetch the result with GET from another address
      304 | Not Modified | The cached copy is still good
      305 | Use Proxy | Deprecated
      307 | Temporary Redirect | Like 302, keeping the method
      308 | Permanent Redirect | Like 301, keeping the method
      # 4xx Client error
      400 | Bad Request | The request is malformed
      401 | Unauthorized | Sign-in is needed or failed
      402 | Payment Required | Reserved
      403 | Forbidden | Not allowed, even if signed in
      404 | Not Found | No such resource
      405 | Method Not Allowed | The method isn’t accepted here
      406 | Not Acceptable | No response matches the Accept headers
      407 | Proxy Authentication Required | Sign in to the proxy
      408 | Request Timeout | The request took too long to arrive
      409 | Conflict | Clashes with the resource’s current state
      410 | Gone | Removed for good
      411 | Length Required | Content-Length is needed
      412 | Precondition Failed | A condition in the headers wasn’t met
      413 | Content Too Large | The request body is too big
      414 | URI Too Long | The address is too long
      415 | Unsupported Media Type | The body’s format isn’t accepted
      416 | Range Not Satisfiable | The requested range is outside the resource
      417 | Expectation Failed | The Expect header can’t be met
      418 | (Unused) | Reserved; known as the “I’m a teapot” joke
      421 | Misdirected Request | Sent to a server that can’t answer for it
      422 | Unprocessable Content | Well formed but not valid
      423 | Locked | The resource is locked (WebDAV)
      424 | Failed Dependency | An earlier action failed (WebDAV)
      425 | Too Early | Might be a replayed request
      426 | Upgrade Required | Switch to another protocol
      428 | Precondition Required | The request must be conditional
      429 | Too Many Requests | Rate limited
      431 | Request Header Fields Too Large | Headers are too big
      451 | Unavailable For Legal Reasons | Blocked for legal reasons
      # 5xx Server error
      500 | Internal Server Error | The server hit an unexpected error
      501 | Not Implemented | The method isn’t supported
      502 | Bad Gateway | A proxy got a bad reply from upstream
      503 | Service Unavailable | Overloaded or down for now
      504 | Gateway Timeout | A proxy got no reply from upstream in time
      505 | HTTP Version Not Supported | That HTTP version isn’t supported
      506 | Variant Also Negotiates | Content negotiation is misconfigured
      507 | Insufficient Storage | Not enough space (WebDAV)
      508 | Loop Detected | An endless loop (WebDAV)
      510 | Not Extended | Obsolete
      511 | Network Authentication Required | Sign in to the network first (captive portal)
    `),
  })

  // ─── SMTP (RFC 5321, 4954, 7504; enhanced codes RFC 3463) ───────────
  codeTable({
    title: 'SMTP codes',
    blurb: 'Mail server reply codes, and common enhanced status codes (the x.y.z numbers in bounce messages). 4xx is temporary; 5xx is permanent.',
    columns: ['Code', 'Meaning'],
    placeholder: 'code or words, such as 550 or 5.7.1',
    rows: read(`
      # 2xx Success
      211 | System status, or help reply
      214 | Help message
      220 | Service ready
      221 | Service closing the connection
      235 | Authentication succeeded
      250 | Requested action completed
      251 | User not local; the server will forward it
      252 | Cannot verify the user, but will accept the message and try
      # 3xx More needed
      334 | Authentication challenge: send the next part
      354 | Start sending the message; end with a line holding only a dot
      # 4xx Temporary failure
      421 | Service not available; closing the connection
      432 | A password transition is needed
      450 | Mailbox unavailable for now (busy or blocked temporarily)
      451 | Action aborted: local error in processing
      452 | Not enough system storage, or too many recipients
      454 | Temporary authentication failure
      455 | Server cannot accommodate the parameters right now
      # 5xx Permanent failure
      500 | Syntax error; command not recognized
      501 | Syntax error in parameters
      502 | Command not implemented
      503 | Bad sequence of commands
      504 | Command parameter not implemented
      521 | This host does not accept mail
      530 | Authentication required
      534 | Authentication mechanism is too weak
      535 | Authentication credentials invalid
      538 | Encryption required for this authentication mechanism
      550 | Mailbox unavailable (not found, or rejected by policy)
      551 | User not local; try the address given
      552 | Storage allocation exceeded
      553 | Mailbox name not allowed
      554 | Transaction failed
      555 | MAIL FROM or RCPT TO parameters not recognized
      556 | The domain does not accept mail
      # Enhanced status codes
      4.2.2 | Mailbox full (temporary)
      4.4.1 | No answer from the receiving host
      4.4.7 | Delivery time expired
      4.7.0 | Temporary security or policy problem
      5.1.1 | Bad destination mailbox address (no such user)
      5.1.2 | Bad destination system address (domain problem)
      5.2.1 | Mailbox disabled, not accepting messages
      5.2.2 | Mailbox full
      5.2.3 | Message too long for the mailbox
      5.3.4 | Message too big for the system
      5.4.4 | Unable to route
      5.5.1 | Invalid command
      5.7.1 | Delivery not authorized; message refused
      5.7.8 | Authentication credentials invalid
      5.7.26 | Several authentication checks failed (such as SPF and DKIM)
    `),
  })

  // ─── Windows events to monitor ──────────────────────────────────────
  // The table of Microsoft's "Appendix L: Events to Monitor", row for row
  // (page dated 2025-05-30, copied 2026-11-27).
  codeTable({
    title: 'Windows events to monitor',
    blurb: 'Microsoft’s recommended Active Directory and Windows security events. High: investigate a single occurrence. Medium or Low: investigate if unexpected or well above normal. Test in your own environment; some events need audit policy turned on.',
    source: { label: 'Appendix L: Events to Monitor, Microsoft Learn', url: 'https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/appendix-l--events-to-monitor' },
    columns: ['Current event ID', 'Legacy event ID', 'Potential criticality', 'Event summary'],
    filterName: 'Criticality',
    groupColumn: false, // the criticality column already shows it
    placeholder: 'ID or words, such as 4719 or replay',
    rows: read(`
      # High
      4618 | N/A | High | A monitored security event pattern has occurred.
      4649 | N/A | High | A replay attack was detected. May be a harmless false positive due to misconfiguration error.
      4719 | 612 | High | System audit policy was changed.
      4765 | N/A | High | SID History was added to an account.
      4766 | N/A | High | An attempt to add SID History to an account failed.
      4794 | N/A | High | An attempt was made to set the Directory Services Restore Mode.
      4897 | 801 | High | Role separation enabled.
      4964 | N/A | High | Special groups have been assigned to a new logon.
      5124 | N/A | High | A security setting was updated on the OCSP Responder Service.
      # Medium to High
      N/A | 550 | Medium to High | Possible denial-of-service (DoS) attack.
      1102 | 517 | Medium to High | The audit log was cleared.
      # Medium
      4621 | N/A | Medium | Administrator recovered system from CrashOnAuditFail. Users who are not administrators will now be allowed to log on. Some auditable activity might not have been recorded.
      4675 | N/A | Medium | SIDs were filtered.
      4692 | N/A | Medium | Backup of data protection master key was attempted.
      4693 | N/A | Medium | Recovery of data protection master key was attempted.
      4706 | 610 | Medium | A new trust was created to a domain.
      4713 | 617 | Medium | Kerberos policy was changed.
      4714 | 618 | Medium | Encrypted data recovery policy was changed.
      4715 | N/A | Medium | The audit policy (SACL) on an object was changed.
      4716 | 620 | Medium | Trusted domain information was modified.
      4724 | 628 | Medium | An attempt was made to reset an account's password.
      4727 | 631 | Medium | A security-enabled global group was created.
      4735 | 639 | Medium | A security-enabled local group was changed.
      4737 | 641 | Medium | A security-enabled global group was changed.
      4739 | 643 | Medium | Domain Policy was changed.
      4754 | 658 | Medium | A security-enabled universal group was created.
      4755 | 659 | Medium | A security-enabled universal group was changed.
      4764 | 667 | Medium | A security-disabled group was deleted.
      4764 | 668 | Medium | A group's type was changed.
      4780 | 684 | Medium | The ACL was set on accounts which are members of administrators groups.
      4816 | N/A | Medium | RPC detected an integrity violation while decrypting an incoming message.
      4865 | N/A | Medium | A trusted forest information entry was added.
      4866 | N/A | Medium | A trusted forest information entry was removed.
      4867 | N/A | Medium | A trusted forest information entry was modified.
      4868 | 772 | Medium | The certificate manager denied a pending certificate request.
      4870 | 774 | Medium | Certificate Services revoked a certificate.
      4882 | 786 | Medium | The security permissions for Certificate Services changed.
      4885 | 789 | Medium | The audit filter for Certificate Services changed.
      4890 | 794 | Medium | The certificate manager settings for Certificate Services changed.
      4892 | 796 | Medium | A property of Certificate Services changed.
      4896 | 800 | Medium | One or more rows have been deleted from the certificate database.
      4906 | N/A | Medium | The CrashOnAuditFail value has changed.
      4907 | N/A | Medium | Auditing settings on object were changed.
      4908 | N/A | Medium | Special Groups Logon table modified.
      4912 | 807 | Medium | Per User Audit Policy was changed.
      4960 | N/A | Medium | IPsec dropped an inbound packet that failed an integrity check. If this problem persists, it could indicate a network issue or that packets are being modified in transit to this computer. Verify that the packets sent from the remote computer are the same as those received by this computer. This error might also indicate interoperability problems with other IPsec implementations.
      4961 | N/A | Medium | IPsec dropped an inbound packet that failed a replay check. If this problem persists, it could indicate a replay attack against this computer.
      4962 | N/A | Medium | IPsec dropped an inbound packet that failed a replay check. The inbound packet had too low a sequence number to ensure it was not a replay.
      4963 | N/A | Medium | IPsec dropped an inbound clear text packet that should have been secured. This is usually due to the remote computer changing its IPsec policy without informing this computer. This could also be a spoofing attack attempt.
      4965 | N/A | Medium | IPsec received a packet from a remote computer with an incorrect Security Parameter Index (SPI). This is usually caused by malfunctioning hardware that is corrupting packets. If these errors persist, verify that the packets sent from the remote computer are the same as those received by this computer. This error may also indicate interoperability problems with other IPsec implementations. In that case, if connectivity is not impeded, then these events can be ignored.
      4976 | N/A | Medium | During Main Mode negotiation, IPsec received an invalid negotiation packet. If this problem persists, it could indicate a network issue or an attempt to modify or replay this negotiation.
      4977 | N/A | Medium | During Quick Mode negotiation, IPsec received an invalid negotiation packet. If this problem persists, it could indicate a network issue or an attempt to modify or replay this negotiation.
      4978 | N/A | Medium | During Extended Mode negotiation, IPsec received an invalid negotiation packet. If this problem persists, it could indicate a network issue or an attempt to modify or replay this negotiation.
      4983 | N/A | Medium | An IPsec Extended Mode negotiation failed. The corresponding Main Mode security association has been deleted.
      4984 | N/A | Medium | An IPsec Extended Mode negotiation failed. The corresponding Main Mode security association has been deleted.
      5027 | N/A | Medium | The Windows Firewall Service was unable to retrieve the security policy from the local storage. The service will continue enforcing the current policy.
      5028 | N/A | Medium | The Windows Firewall Service was unable to parse the new security policy. The service will continue with currently enforced policy.
      5029 | N/A | Medium | The Windows Firewall Service failed to initialize the driver. The service will continue to enforce the current policy.
      5030 | N/A | Medium | The Windows Firewall Service failed to start.
      5035 | N/A | Medium | The Windows Firewall Driver failed to start.
      5037 | N/A | Medium | The Windows Firewall Driver detected critical runtime error. Terminating.
      5038 | N/A | Medium | Code integrity determined that the image hash of a file is not valid. The file could be corrupt due to unauthorized modification or the invalid hash could indicate a potential disk device error.
      5120 | N/A | Medium | OCSP Responder Service Started.
      5121 | N/A | Medium | OCSP Responder Service Stopped.
      5122 | N/A | Medium | A configuration entry changed in OCSP Responder Service.
      5123 | N/A | Medium | A configuration entry changed in OCSP Responder Service.
      5376 | N/A | Medium | Credential Manager credentials were backed up.
      5377 | N/A | Medium | Credential Manager credentials were restored from a backup.
      5453 | N/A | Medium | An IPsec negotiation with a remote computer failed because the IKE and AuthIP IPsec Keying Modules (IKEEXT) service is not started.
      5480 | N/A | Medium | IPsec Services failed to get the complete list of network interfaces on the computer. This poses a potential security risk because some of the network interfaces may not get the protection provided by the applied IPsec filters. Use the IP Security Monitor snap-in to diagnose the problem.
      5483 | N/A | Medium | IPsec Services failed to initialize RPC server. IPsec Services could not be started.
      5484 | N/A | Medium | IPsec Services has experienced a critical failure and has been shut down. The shutdown of IPsec Services can put the computer at greater risk of network attack or expose the computer to potential security risks.
      5485 | N/A | Medium | IPsec Services failed to process some IPsec filters on a plug-and-play event for network interfaces. This poses a potential security risk because some of the network interfaces may not get the protection provided by the applied IPsec filters. Use the IP Security Monitor snap-in to diagnose the problem.
      5827 | N/A | Medium | The Netlogon service denied a vulnerable Netlogon secure channel connection from a machine account.
      5828 | N/A | Medium | The Netlogon service denied a vulnerable Netlogon secure channel connection using a trust account.
      6145 | N/A | Medium | One or more errors occurred while processing security policy in the Group Policy objects.
      6273 | N/A | Medium | Network Policy Server denied access to a user.
      6274 | N/A | Medium | Network Policy Server discarded the request for a user.
      6275 | N/A | Medium | Network Policy Server discarded the accounting request for a user.
      6276 | N/A | Medium | Network Policy Server quarantined a user.
      6277 | N/A | Medium | Network Policy Server granted access to a user but put it on probation because the host did not meet the defined health policy.
      6278 | N/A | Medium | Network Policy Server granted full access to a user because the host met the defined health policy.
      6279 | N/A | Medium | Network Policy Server locked the user account due to repeated failed authentication attempts.
      6280 | N/A | Medium | Network Policy Server unlocked the user account.
      - | 640 | Medium | General account database changed.
      - | 619 | Medium | Quality of Service Policy changed.
      24586 | N/A | Medium | An error was encountered converting volume.
      24592 | N/A | Medium | An attempt to automatically restart conversion on volume %2 failed.
      24593 | N/A | Medium | Metadata write: Volume %2 returning errors while trying to modify metadata. If failures continue, decrypt volume.
      24594 | N/A | Medium | Metadata rebuild: An attempt to write a copy of metadata on volume %2 failed and may appear as disk corruption. If failures continue, decrypt volume.
      # Low
      4608 | 512 | Low | Windows is starting up.
      4609 | 513 | Low | Windows is shutting down.
      4610 | 514 | Low | An authentication package has been loaded by the Local Security Authority.
      4611 | 515 | Low | A trusted logon process has been registered with the Local Security Authority.
      4612 | 516 | Low | Internal resources allocated for the queuing of audit messages have been exhausted, leading to the loss of some audits.
      4614 | 518 | Low | A notification package has been loaded by the Security Account Manager.
      4615 | 519 | Low | Invalid use of LPC port.
      4616 | 520 | Low | The system time was changed.
      4622 | N/A | Low | A security package has been loaded by the Local Security Authority.
      4624 | 528,540 | Low | An account was successfully logged on.
      4625 | 529-537,539 | Low | An account failed to log on.
      4634 | 538 | Low | An account was logged off.
      4646 | N/A | Low | IKE DoS-prevention mode started.
      4647 | 551 | Low | User initiated logoff.
      4648 | 552 | Low | A logon was attempted using explicit credentials.
      4650 | N/A | Low | An IPsec Main Mode security association was established. Extended Mode was not enabled. Certificate authentication was not used.
      4651 | N/A | Low | An IPsec Main Mode security association was established. Extended Mode was not enabled. A certificate was used for authentication.
      4652 | N/A | Low | An IPsec Main Mode negotiation failed.
      4653 | N/A | Low | An IPsec Main Mode negotiation failed.
      4654 | N/A | Low | An IPsec Quick Mode negotiation failed.
      4655 | N/A | Low | An IPsec Main Mode security association ended.
      4656 | 560 | Low | A handle to an object was requested.
      4657 | 567 | Low | A registry value was modified.
      4658 | 562 | Low | The handle to an object was closed.
      4659 | N/A | Low | A handle to an object was requested with intent to delete.
      4660 | 564 | Low | An object was deleted.
      4661 | 565 | Low | A handle to an object was requested.
      4662 | 566 | Low | An operation was performed on an object.
      4663 | 567 | Low | An attempt was made to access an object.
      4664 | N/A | Low | An attempt was made to create a hard link.
      4665 | N/A | Low | An attempt was made to create an application client context.
      4666 | N/A | Low | An application attempted an operation.
      4667 | N/A | Low | An application client context was deleted.
      4668 | N/A | Low | An application was initialized.
      4670 | N/A | Low | Permissions on an object were changed.
      4671 | N/A | Low | An application attempted to access a blocked ordinal through the TBS.
      4672 | 576 | Low | Special privileges assigned to new logon.
      4673 | 577 | Low | A privileged service was called.
      4674 | 578 | Low | An operation was attempted on a privileged object.
      4688 | 592 | Low | A new process has been created.
      4689 | 593 | Low | A process has exited.
      4690 | 594 | Low | An attempt was made to duplicate a handle to an object.
      4691 | 595 | Low | Indirect access to an object was requested.
      4694 | N/A | Low | Protection of auditable protected data was attempted.
      4695 | N/A | Low | Unprotection of auditable protected data was attempted.
      4696 | 600 | Low | A primary token was assigned to process.
      4697 | 601 | Low | Attempt to install a service.
      4698 | 602 | Low | A scheduled task was created.
      4699 | 602 | Low | A scheduled task was deleted.
      4700 | 602 | Low | A scheduled task was enabled.
      4701 | 602 | Low | A scheduled task was disabled.
      4702 | 602 | Low | A scheduled task was updated.
      4704 | 608 | Low | A user right was assigned.
      4705 | 609 | Low | A user right was removed.
      4707 | 611 | Low | A trust to a domain was removed.
      4709 | N/A | Low | IPsec Services was started.
      4710 | N/A | Low | IPsec Services was disabled.
      4711 | N/A | Low | May contain any one of the following: PAStore Engine applied locally cached copy of Active Directory storage IPsec policy on the computer. PAStore Engine applied Active Directory storage IPsec policy on the computer. PAStore Engine applied local registry storage IPsec policy on the computer. PAStore Engine failed to apply locally cached copy of Active Directory storage IPsec policy on the computer. PAStore Engine failed to apply Active Directory storage IPsec policy on the computer. PAStore Engine failed to apply local registry storage IPsec policy on the computer. PAStore Engine failed to apply some rules of the active IPsec policy on the computer. PAStore Engine failed to load directory storage IPsec policy on the computer. PAStore Engine loaded directory storage IPsec policy on the computer. PAStore Engine failed to load local storage IPsec policy on the computer. PAStore Engine loaded local storage IPsec policy on the computer.PAStore Engine polled for changes to the active IPsec policy and detected no changes.
      4712 | N/A | Low | IPsec Services encountered a potentially serious failure.
      4717 | 621 | Low | System security access was granted to an account.
      4718 | 622 | Low | System security access was removed from an account.
      4720 | 624 | Low | A user account was created.
      4722 | 626 | Low | A user account was enabled.
      4723 | 627 | Low | An attempt was made to change an account's password.
      4725 | 629 | Low | A user account was disabled.
      4726 | 630 | Low | A user account was deleted.
      4728 | 632 | Low | A member was added to a security-enabled global group.
      4729 | 633 | Low | A member was removed from a security-enabled global group.
      4730 | 634 | Low | A security-enabled global group was deleted.
      4731 | 635 | Low | A security-enabled local group was created.
      4732 | 636 | Low | A member was added to a security-enabled local group.
      4733 | 637 | Low | A member was removed from a security-enabled local group.
      4734 | 638 | Low | A security-enabled local group was deleted.
      4738 | 642 | Low | A user account was changed.
      4740 | 644 | Low | A user account was locked out.
      4741 | 645 | Low | A computer account was changed.
      4742 | 646 | Low | A computer account was changed.
      4743 | 647 | Low | A computer account was deleted.
      4744 | 648 | Low | A security-disabled local group was created.
      4745 | 649 | Low | A security-disabled local group was changed.
      4746 | 650 | Low | A member was added to a security-disabled local group.
      4747 | 651 | Low | A member was removed from a security-disabled local group.
      4748 | 652 | Low | A security-disabled local group was deleted.
      4749 | 653 | Low | A security-disabled global group was created.
      4750 | 654 | Low | A security-disabled global group was changed.
      4751 | 655 | Low | A member was added to a security-disabled global group.
      4752 | 656 | Low | A member was removed from a security-disabled global group.
      4753 | 657 | Low | A security-disabled global group was deleted.
      4756 | 660 | Low | A member was added to a security-enabled universal group.
      4757 | 661 | Low | A member was removed from a security-enabled universal group.
      4758 | 662 | Low | A security-enabled universal group was deleted.
      4759 | 663 | Low | A security-disabled universal group was created.
      4760 | 664 | Low | A security-disabled universal group was changed.
      4761 | 665 | Low | A member was added to a security-disabled universal group.
      4762 | 666 | Low | A member was removed from a security-disabled universal group.
      4767 | 671 | Low | A user account was unlocked.
      4768 | 672,676 | Low | A Kerberos authentication ticket (TGT) was requested.
      4769 | 673 | Low | A Kerberos service ticket was requested.
      4770 | 674 | Low | A Kerberos service ticket was renewed.
      4771 | 675 | Low | Kerberos pre-authentication failed.
      4772 | 672 | Low | A Kerberos authentication ticket request failed.
      4774 | 678 | Low | An account was mapped for logon.
      4775 | 679 | Low | An account could not be mapped for logon.
      4776 | 680,681 | Low | The domain controller attempted to validate the credentials for an account.
      4777 | N/A | Low | The domain controller failed to validate the credentials for an account.
      4778 | 682 | Low | A session was reconnected to a Window Station.
      4779 | 683 | Low | A session was disconnected from a Window Station.
      4781 | 685 | Low | The name of an account was changed.
      4782 | N/A | Low | The password hash an account was accessed.
      4783 | 667 | Low | A basic application group was created.
      4784 | N/A | Low | A basic application group was changed.
      4785 | 689 | Low | A member was added to a basic application group.
      4786 | 690 | Low | A member was removed from a basic application group.
      4787 | 691 | Low | A nonmember was added to a basic application group.
      4788 | 692 | Low | A nonmember was removed from a basic application group.
      4789 | 693 | Low | A basic application group was deleted.
      4790 | 694 | Low | An LDAP query group was created.
      4793 | N/A | Low | The Password Policy Checking API was called.
      4800 | N/A | Low | The workstation was locked.
      4801 | N/A | Low | The workstation was unlocked.
      4802 | N/A | Low | The screen saver was invoked.
      4803 | N/A | Low | The screen saver was dismissed.
      4864 | N/A | Low | A namespace collision was detected.
      4869 | 773 | Low | Certificate Services received a resubmitted certificate request.
      4871 | 775 | Low | Certificate Services received a request to publish the certificate revocation list (CRL).
      4872 | 776 | Low | Certificate Services published the certificate revocation list (CRL).
      4873 | 777 | Low | A certificate request extension changed.
      4874 | 778 | Low | One or more certificate request attributes changed.
      4875 | 779 | Low | Certificate Services received a request to shut down.
      4876 | 780 | Low | Certificate Services backup started.
      4877 | 781 | Low | Certificate Services backup completed.
      4878 | 782 | Low | Certificate Services restore started.
      4879 | 783 | Low | Certificate Services restore completed.
      4880 | 784 | Low | Certificate Services started.
      4881 | 785 | Low | Certificate Services stopped.
      4883 | 787 | Low | Certificate Services retrieved an archived key.
      4884 | 788 | Low | Certificate Services imported a certificate into its database.
      4886 | 790 | Low | Certificate Services received a certificate request.
      4887 | 791 | Low | Certificate Services approved a certificate request and issued a certificate.
      4888 | 792 | Low | Certificate Services denied a certificate request.
      4889 | 793 | Low | Certificate Services set the status of a certificate request to pending.
      4891 | 795 | Low | A configuration entry changed in Certificate Services.
      4893 | 797 | Low | Certificate Services archived a key.
      4894 | 798 | Low | Certificate Services imported and archived a key.
      4895 | 799 | Low | Certificate Services published the CA certificate to Active Directory Domain Services.
      4898 | 802 | Low | Certificate Services loaded a template.
      4902 | N/A | Low | The Per-user audit policy table was created.
      4904 | N/A | Low | An attempt was made to register a security event source.
      4905 | N/A | Low | An attempt was made to unregister a security event source.
      4909 | N/A | Low | The local policy settings for the TBS were changed.
      4910 | N/A | Low | The Group Policy settings for the TBS were changed.
      4928 | N/A | Low | An Active Directory replica source naming context was established.
      4929 | N/A | Low | An Active Directory replica source naming context was removed.
      4930 | N/A | Low | An Active Directory replica source naming context was modified.
      4931 | N/A | Low | An Active Directory replica destination naming context was modified.
      4932 | N/A | Low | Synchronization of a replica of an Active Directory naming context has begun.
      4933 | N/A | Low | Synchronization of a replica of an Active Directory naming context has ended.
      4934 | N/A | Low | Attributes of an Active Directory object were replicated.
      4935 | N/A | Low | Replication failure begins.
      4936 | N/A | Low | Replication failure ends.
      4937 | N/A | Low | A lingering object was removed from a replica.
      4944 | N/A | Low | The following policy was active when the Windows Firewall started.
      4945 | N/A | Low | A rule was listed when the Windows Firewall started.
      4946 | N/A | Low | A change has been made to Windows Firewall exception list. A rule was added.
      4947 | N/A | Low | A change has been made to Windows Firewall exception list. A rule was modified.
      4948 | N/A | Low | A change has been made to Windows Firewall exception list. A rule was deleted.
      4949 | N/A | Low | Windows Firewall settings were restored to the default values.
      4950 | N/A | Low | A Windows Firewall setting has changed.
      4951 | N/A | Low | A rule has been ignored because its major version number was not recognized by Windows Firewall.
      4952 | N/A | Low | Parts of a rule have been ignored because its minor version number was not recognized by Windows Firewall. The other parts of the rule will be enforced.
      4953 | N/A | Low | A rule has been ignored by Windows Firewall because it could not parse the rule.
      4954 | N/A | Low | Windows Firewall Group Policy settings have changed. The new settings have been applied.
      4956 | N/A | Low | Windows Firewall has changed the active profile.
      4957 | N/A | Low | Windows Firewall did not apply the following rule.
      4958 | N/A | Low | Windows Firewall did not apply the following rule because the rule referred to items not configured on this computer.
      4979 | N/A | Low | IPsec Main Mode and Extended Mode security associations were established.
      4980 | N/A | Low | IPsec Main Mode and Extended Mode security associations were established.
      4981 | N/A | Low | IPsec Main Mode and Extended Mode security associations were established.
      4982 | N/A | Low | IPsec Main Mode and Extended Mode security associations were established.
      4985 | N/A | Low | The state of a transaction has changed.
      5024 | N/A | Low | The Windows Firewall Service has started successfully.
      5025 | N/A | Low | The Windows Firewall Service has been stopped.
      5031 | N/A | Low | The Windows Firewall Service blocked an application from accepting incoming connections on the network.
      5032 | N/A | Low | Windows Firewall was unable to notify the user that it blocked an application from accepting incoming connections on the network.
      5033 | N/A | Low | The Windows Firewall Driver has started successfully.
      5034 | N/A | Low | The Windows Firewall Driver has been stopped.
      5039 | N/A | Low | A registry key was virtualized.
      5040 | N/A | Low | A change has been made to IPsec settings. An Authentication Set was added.
      5041 | N/A | Low | A change has been made to IPsec settings. An Authentication Set was modified.
      5042 | N/A | Low | A change has been made to IPsec settings. An Authentication Set was deleted.
      5043 | N/A | Low | A change has been made to IPsec settings. A Connection Security Rule was added.
      5044 | N/A | Low | A change has been made to IPsec settings. A Connection Security Rule was modified.
      5045 | N/A | Low | A change has been made to IPsec settings. A Connection Security Rule was deleted.
      5046 | N/A | Low | A change has been made to IPsec settings. A Crypto Set was added.
      5047 | N/A | Low | A change has been made to IPsec settings. A Crypto Set was modified.
      5048 | N/A | Low | A change has been made to IPsec settings. A Crypto Set was deleted.
      5050 | N/A | Low | An attempt to programmatically disable the Windows Firewall using a call to InetFwProfile.FirewallEnabled(False).
      5051 | N/A | Low | A file was virtualized.
      5056 | N/A | Low | A cryptographic self test was performed.
      5057 | N/A | Low | A cryptographic primitive operation failed.
      5058 | N/A | Low | Key file operation.
      5059 | N/A | Low | Key migration operation.
      5060 | N/A | Low | Verification operation failed.
      5061 | N/A | Low | Cryptographic operation.
      5062 | N/A | Low | A kernel-mode cryptographic self test was performed.
      5063 | N/A | Low | A cryptographic provider operation was attempted.
      5064 | N/A | Low | A cryptographic context operation was attempted.
      5065 | N/A | Low | A cryptographic context modification was attempted.
      5066 | N/A | Low | A cryptographic function operation was attempted.
      5067 | N/A | Low | A cryptographic function modification was attempted.
      5068 | N/A | Low | A cryptographic function provider operation was attempted.
      5069 | N/A | Low | A cryptographic function property operation was attempted.
      5070 | N/A | Low | A cryptographic function property modification was attempted.
      5125 | N/A | Low | A request was submitted to the OCSP Responder Service.
      5126 | N/A | Low | Signing Certificate was automatically updated by the OCSP Responder Service.
      5127 | N/A | Low | The OCSP Revocation Provider successfully updated the revocation information.
      5136 | 566 | Low | A directory service object was modified.
      5137 | 566 | Low | A directory service object was created.
      5138 | N/A | Low | A directory service object was undeleted.
      5139 | N/A | Low | A directory service object was moved.
      5140 | N/A | Low | A network share object was accessed.
      5141 | N/A | Low | A directory service object was deleted.
      5152 | N/A | Low | The Windows Filtering Platform blocked a packet.
      5153 | N/A | Low | A more restrictive Windows Filtering Platform filter has blocked a packet.
      5154 | N/A | Low | The Windows Filtering Platform has permitted an application or service to listen on a port for incoming connections.
      5155 | N/A | Low | The Windows Filtering Platform has blocked an application or service from listening on a port for incoming connections.
      5156 | N/A | Low | The Windows Filtering Platform has allowed a connection.
      5157 | N/A | Low | The Windows Filtering Platform has blocked a connection.
      5158 | N/A | Low | The Windows Filtering Platform has permitted a bind to a local port.
      5159 | N/A | Low | The Windows Filtering Platform has blocked a bind to a local port.
      5378 | N/A | Low | The requested credentials delegation was disallowed by policy.
      5440 | N/A | Low | The following callout was present when the Windows Filtering Platform Base Filtering Engine started.
      5441 | N/A | Low | The following filter was present when the Windows Filtering Platform Base Filtering Engine started.
      5442 | N/A | Low | The following provider was present when the Windows Filtering Platform Base Filtering Engine started.
      5443 | N/A | Low | The following provider context was present when the Windows Filtering Platform Base Filtering Engine started.
      5444 | N/A | Low | The following sublayer was present when the Windows Filtering Platform Base Filtering Engine started.
      5446 | N/A | Low | A Windows Filtering Platform callout has been changed.
      5447 | N/A | Low | A Windows Filtering Platform filter has been changed.
      5448 | N/A | Low | A Windows Filtering Platform provider has been changed.
      5449 | N/A | Low | A Windows Filtering Platform provider context has been changed.
      5450 | N/A | Low | A Windows Filtering Platform sublayer has been changed.
      5451 | N/A | Low | An IPsec Quick Mode security association was established.
      5452 | N/A | Low | An IPsec Quick Mode security association ended.
      5456 | N/A | Low | PAStore Engine applied Active Directory storage IPsec policy on the computer.
      5457 | N/A | Low | PAStore Engine failed to apply Active Directory storage IPsec policy on the computer.
      5458 | N/A | Low | PAStore Engine applied locally cached copy of Active Directory storage IPsec policy on the computer.
      5459 | N/A | Low | PAStore Engine failed to apply locally cached copy of Active Directory storage IPsec policy on the computer.
      5460 | N/A | Low | PAStore Engine applied local registry storage IPsec policy on the computer.
      5461 | N/A | Low | PAStore Engine failed to apply local registry storage IPsec policy on the computer.
      5462 | N/A | Low | PAStore Engine failed to apply some rules of the active IPsec policy on the computer. Use the IP Security Monitor snap-in to diagnose the problem.
      5463 | N/A | Low | PAStore Engine polled for changes to the active IPsec policy and detected no changes.
      5464 | N/A | Low | PAStore Engine polled for changes to the active IPsec policy, detected changes, and applied them to IPsec Services.
      5465 | N/A | Low | PAStore Engine received a control for forced reloading of IPsec policy and processed the control successfully.
      5466 | N/A | Low | PAStore Engine polled for changes to the Active Directory IPsec policy, determined that Active Directory cannot be reached, and will use the cached copy of the Active Directory IPsec policy instead. Any changes made to the Active Directory IPsec policy since the last poll could not be applied.
      5467 | N/A | Low | PAStore Engine polled for changes to the Active Directory IPsec policy, determined that Active Directory can be reached, and found no changes to the policy. The cached copy of the Active Directory IPsec policy is no longer being used.
      5468 | N/A | Low | PAStore Engine polled for changes to the Active Directory IPsec policy, determined that Active Directory can be reached, found changes to the policy, and applied those changes. The cached copy of the Active Directory IPsec policy is no longer being used.
      5471 | N/A | Low | PAStore Engine loaded local storage IPsec policy on the computer.
      5472 | N/A | Low | PAStore Engine failed to load local storage IPsec policy on the computer.
      5473 | N/A | Low | PAStore Engine loaded directory storage IPsec policy on the computer.
      5474 | N/A | Low | PAStore Engine failed to load directory storage IPsec policy on the computer.
      5477 | N/A | Low | PAStore Engine failed to add quick mode filter.
      5479 | N/A | Low | IPsec Services has been shut down successfully. The shutdown of IPsec Services can put the computer at greater risk of network attack or expose the computer to potential security risks.
      5632 | N/A | Low | A request was made to authenticate to a wireless network.
      5633 | N/A | Low | A request was made to authenticate to a wired network.
      5712 | N/A | Low | A Remote Procedure Call (RPC) was attempted.
      5888 | N/A | Low | An object in the COM+ Catalog was modified.
      5889 | N/A | Low | An object was deleted from the COM+ Catalog.
      5890 | N/A | Low | An object was added to the COM+ Catalog.
      6008 | N/A | Low | The previous system shutdown was unexpected.
      6144 | N/A | Low | Security policy in the Group Policy objects has been applied successfully.
      6272 | N/A | Low | Network Policy Server granted access to a user.
      N/A | 561 | Low | A handle to an object was requested.
      N/A | 563 | Low | Object open for delete.
      N/A | 625 | Low | User Account Type Changed.
      N/A | 613 | Low | IPsec policy agent started.
      N/A | 614 | Low | IPsec policy agent disabled.
      N/A | 615 | Low | IPsec policy agent.
      N/A | 616 | Low | IPsec policy agent encountered a potential serious failure.
      24577 | N/A | Low | Encryption of volume started.
      24578 | N/A | Low | Encryption of volume stopped.
      24579 | N/A | Low | Encryption of volume completed.
      24580 | N/A | Low | Decryption of volume started.
      24581 | N/A | Low | Decryption of volume stopped.
      24582 | N/A | Low | Decryption of volume completed.
      24583 | N/A | Low | Conversion worker thread for volume started.
      24584 | N/A | Low | Conversion worker thread for volume temporarily stopped.
      24588 | N/A | Low | The conversion operation on volume %2 encountered a bad sector error. Please validate the data on this volume.
      24595 | N/A | Low | Volume %2 contains bad clusters. These clusters will be skipped during conversion.
      24621 | N/A | Low | Initial state check: Rolling volume conversion transaction on %2.
      5049 | N/A | Low | An IPsec Security Association was deleted.
      5478 | N/A | Low | IPsec Services has started successfully.
    `),
  })
})()
