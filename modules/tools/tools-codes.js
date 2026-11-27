/*
 * Code reference tools: FTP, HTTP and SMTP reply codes, syslog codes, Windows
 * event IDs and Security log codes, each a table with a search box and a group
 * filter. Reference only. Loaded after tools.js and before tools-layout.js.
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

  function codeTable({ title, blurb, columns, rows, placeholder }) {
    const card = tool(title, blurb)
    card.classList.add('tool-codes')
    const search = input(placeholder)
    search.type = 'search'
    const groups = [...new Set(rows.map((r) => r.group))]
    const select = el('select')
    select.append(new Option('All', ''), ...groups.map((g) => new Option(g, g)))
    const controls = el('div', 'tool-row codes-controls')
    controls.append(labelled('Search', search), labelled('Group', select))
    const count = el('p', 'codes-count')
    count.setAttribute('role', 'status')

    const table = el('table', 'codes-table')
    const head = el('tr')
    ;[...columns, 'Group'].forEach((name) => {
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
      tr.append(el('td', 'codes-group', row.group))
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

  // ─── Syslog (RFC 5424) ──────────────────────────────────────────────
  codeTable({
    title: 'Windows syslog codes',
    blurb: 'Syslog severities and facilities (RFC 5424), for Windows logs sent to a syslog server. Windows has no syslog of its own: the level mapping shown is a common one, and each forwarder can differ. Priority = facility × 8 + severity.',
    columns: ['Code', 'Name', 'Meaning'],
    placeholder: 'code or words, such as local0 or warning',
    rows: read(`
      # Severity
      0 | Emergency (emerg) | The system is unusable
      1 | Alert (alert) | Action must be taken immediately
      2 | Critical (crit) | Critical conditions
      3 | Error (err) | Error conditions
      4 | Warning (warning) | Warning conditions
      5 | Notice (notice) | Normal but significant
      6 | Informational (info) | Informational messages
      7 | Debug (debug) | Debugging messages
      # Facility
      0 | kern | Kernel messages
      1 | user | User-level messages
      2 | mail | Mail system
      3 | daemon | System daemons
      4 | auth | Security and authorization
      5 | syslog | The syslog server itself
      6 | lpr | Printing
      7 | news | Network news
      8 | uucp | UUCP
      9 | cron | Scheduled jobs
      10 | authpriv | Private security and authorization
      11 | ftp | FTP daemon
      12 | ntp | Time service
      13 | audit | Log audit
      14 | alert | Log alert
      15 | clock | Clock daemon
      16 | local0 | Local use 0
      17 | local1 | Local use 1
      18 | local2 | Local use 2
      19 | local3 | Local use 3
      20 | local4 | Local use 4
      21 | local5 | Local use 5
      22 | local6 | Local use 6
      23 | local7 | Local use 7
      # Windows level to syslog severity
      1 | Windows Critical | Usually sent as severity 2 (Critical)
      2 | Windows Error | Usually sent as severity 3 (Error)
      3 | Windows Warning | Usually sent as severity 4 (Warning)
      4 | Windows Information | Usually sent as severity 6 (Informational)
      5 | Windows Verbose | Usually sent as severity 7 (Debug)
      0 | Windows LogAlways (and audit events) | Usually sent as severity 6 (Informational)
    `),
  })

  // ─── Windows event IDs ──────────────────────────────────────────────
  codeTable({
    title: 'Windows event IDs',
    blurb: 'Common events from the System, Application and service logs. An ID only means something together with its source. Security log events are in their own tool.',
    columns: ['ID', 'Log', 'Source', 'Meaning'],
    placeholder: 'ID or words, such as 7045 or shutdown',
    rows: read(`
      # Startup, shutdown and power
      12 | System | Kernel-General | The operating system started
      13 | System | Kernel-General | The operating system is shutting down
      41 | System | Kernel-Power | Restarted without shutting down cleanly first
      42 | System | Kernel-Power | The system is entering sleep
      107 | System | Kernel-Power | The system resumed from sleep
      1 | System | Power-Troubleshooter | Returned from a low-power state
      1074 | System | User32 | A user or program started a shutdown or restart
      1076 | System | User32 | The reason given for an unexpected shutdown
      6005 | System | EventLog | The Event Log service started (marks a boot)
      6006 | System | EventLog | The Event Log service stopped (marks a clean shutdown)
      6008 | System | EventLog | The previous shutdown was unexpected
      6009 | System | EventLog | Operating system version, logged at boot
      6013 | System | EventLog | System uptime
      # Crashes and applications
      1001 | System | BugCheck (WER-SystemErrorReporting) | The computer restarted from a bugcheck (blue screen)
      1000 | Application | Application Error | A program crashed
      1001 | Application | Windows Error Reporting | Details of a crash or hang report
      1002 | Application | Application Hang | A program stopped responding
      1026 | Application | .NET Runtime | A .NET program ended with an unhandled exception
      1033 | Application | MsiInstaller | An installer finished installing a product
      1034 | Application | MsiInstaller | An installer finished removing a product
      11707 | Application | MsiInstaller | Installation succeeded
      11724 | Application | MsiInstaller | Removal succeeded
      # Services
      7000 | System | Service Control Manager | A service failed to start
      7001 | System | Service Control Manager | A service failed because one it depends on failed
      7009 | System | Service Control Manager | Timed out waiting for a service to connect
      7011 | System | Service Control Manager | Timed out waiting for a service to respond
      7022 | System | Service Control Manager | A service hung while starting
      7023 | System | Service Control Manager | A service ended with an error
      7024 | System | Service Control Manager | A service ended with its own error code
      7031 | System | Service Control Manager | A service ended unexpectedly; a recovery action will run
      7034 | System | Service Control Manager | A service ended unexpectedly
      7036 | System | Service Control Manager | A service started or stopped
      7040 | System | Service Control Manager | A service’s start type was changed
      7045 | System | Service Control Manager | A new service was installed
      # Disks, drivers and hardware
      7 | System | disk | A device has a bad block
      11 | System | disk | The driver detected a controller error
      51 | System | disk | An error during a paging operation
      55 | System | Ntfs | File system corruption was found
      129 | System | storage driver | A reset was sent to a device
      153 | System | disk | A disk operation had to be retried
      157 | System | disk | A disk was removed unexpectedly
      219 | System | Kernel-PnP | A driver failed to load for a device
      37 | System | Kernel-Processor-Power | Processor speed is limited by firmware
      4101 | System | Display | The display driver stopped responding and recovered
      # Network, domain and updates
      1014 | System | DNS Client Events | A name lookup timed out
      5719 | System | NETLOGON | No domain controller could be reached
      1058 | System | GroupPolicy | A Group Policy file could not be read
      1129 | System | GroupPolicy | Group Policy failed: no connection to a domain controller
      36874 | System | Schannel | TLS connection failed: no cipher suite in common
      36887 | System | Schannel | A fatal TLS alert was received
      10010 | System | DistributedCOM | A server did not register with DCOM in time
      10016 | System | DistributedCOM | A program lacked DCOM permission (often harmless)
      19 | System | WindowsUpdateClient | An update installed successfully
      20 | System | WindowsUpdateClient | An update failed to install
      43 | System | WindowsUpdateClient | An update installation started
      104 | System | Eventlog | A log was cleared
      # PowerShell, Defender and Remote Desktop
      400 | Windows PowerShell | PowerShell | The PowerShell engine started
      403 | Windows PowerShell | PowerShell | The PowerShell engine stopped
      4103 | PowerShell/Operational | PowerShell | Module logging: pipeline details
      4104 | PowerShell/Operational | PowerShell | Script block logging: the code that ran
      1116 | Defender/Operational | Windows Defender | Malware or unwanted software was detected
      1117 | Defender/Operational | Windows Defender | Action was taken on detected malware
      5001 | Defender/Operational | Windows Defender | Real-time protection was turned off
      1149 | RemoteConnectionManager/Operational | TerminalServices | A Remote Desktop connection passed network authentication
      21 | LocalSessionManager/Operational | TerminalServices | Remote Desktop session logon succeeded
      23 | LocalSessionManager/Operational | TerminalServices | Remote Desktop session logoff succeeded
      24 | LocalSessionManager/Operational | TerminalServices | Remote Desktop session disconnected
      25 | LocalSessionManager/Operational | TerminalServices | Remote Desktop session reconnected
    `),
  })

  // ─── Windows Security log ───────────────────────────────────────────
  codeTable({
    title: 'Windows Security log codes',
    blurb: 'Security log event IDs, logon types, and the status codes of failed logons. Many events appear only when the matching audit policy is on.',
    columns: ['Code', 'Meaning'],
    placeholder: 'code or words, such as 4625 or 0xC000006A',
    rows: read(`
      # Logons
      4624 | An account logged on successfully
      4625 | An account failed to log on
      4634 | An account was logged off
      4647 | A user started a logoff
      4648 | A logon was attempted using explicit credentials
      4672 | Special privileges were assigned to a new logon
      4778 | A session was reconnected
      4779 | A session was disconnected
      4800 | The workstation was locked
      4801 | The workstation was unlocked
      4802 | The screen saver started
      4964 | Special groups were assigned to a new logon
      # Kerberos and NTLM
      4768 | A Kerberos ticket (TGT) was requested
      4769 | A Kerberos service ticket was requested
      4770 | A Kerberos service ticket was renewed
      4771 | Kerberos pre-authentication failed
      4776 | Credentials were checked (NTLM)
      # User accounts
      4720 | A user account was created
      4722 | A user account was enabled
      4723 | A user tried to change a password
      4724 | A password reset was attempted
      4725 | A user account was disabled
      4726 | A user account was deleted
      4738 | A user account was changed
      4740 | A user account was locked out
      4767 | A user account was unlocked
      4781 | An account’s name was changed
      4741 | A computer account was created
      4742 | A computer account was changed
      4743 | A computer account was deleted
      # Groups
      4727 | A global security group was created
      4728 | A member was added to a global security group
      4729 | A member was removed from a global security group
      4730 | A global security group was deleted
      4731 | A local security group was created
      4732 | A member was added to a local security group
      4733 | A member was removed from a local security group
      4734 | A local security group was deleted
      4735 | A local security group was changed
      4737 | A global security group was changed
      4756 | A member was added to a universal security group
      4757 | A member was removed from a universal security group
      4798 | A user’s local group membership was listed
      4799 | A local group’s membership was listed
      # Processes, services and tasks
      4688 | A new process was created
      4689 | A process ended
      4697 | A service was installed
      4698 | A scheduled task was created
      4699 | A scheduled task was deleted
      4700 | A scheduled task was enabled
      4701 | A scheduled task was disabled
      4702 | A scheduled task was updated
      # Objects, shares and directory
      4656 | A handle to an object was requested
      4657 | A registry value was changed
      4663 | An attempt was made to access an object
      4670 | Permissions on an object were changed
      5136 | A directory service object was changed
      5137 | A directory service object was created
      5141 | A directory service object was deleted
      5140 | A network share was accessed
      5142 | A network share was added
      5143 | A network share was changed
      5144 | A network share was deleted
      5145 | A network share object was checked for access
      # Policy, system and logs
      1100 | The event logging service shut down
      1102 | The audit log was cleared
      4608 | Windows is starting up
      4616 | The system time was changed
      4673 | A privileged service was called
      4703 | A token right was adjusted
      4704 | A user right was assigned
      4705 | A user right was removed
      4719 | The system audit policy was changed
      4739 | The domain policy was changed
      4907 | Auditing settings on an object were changed
      5038 | Code integrity: a file’s hash is not valid
      6416 | A new external device was recognized
      # Firewall and network filtering
      4946 | A firewall exception rule was added
      4947 | A firewall exception rule was changed
      4948 | A firewall exception rule was deleted
      4950 | A firewall setting was changed
      5024 | The Windows Firewall service started
      5025 | The Windows Firewall service stopped
      5152 | The filtering platform blocked a packet
      5156 | The filtering platform allowed a connection
      5157 | The filtering platform blocked a connection
      # Logon types (4624, 4625)
      2 | Interactive: at the keyboard
      3 | Network: such as a shared folder
      4 | Batch: a scheduled task
      5 | Service: a service starting
      7 | Unlock: unlocking the workstation
      8 | NetworkCleartext: network logon with the password in clear text
      9 | NewCredentials: such as runas /netonly
      10 | RemoteInteractive: Remote Desktop
      11 | CachedInteractive: cached domain credentials
      # Failed logon status (4625, 4776)
      0xC000005E | No logon server was available
      0xC0000064 | The user name does not exist
      0xC000006A | The password is wrong
      0xC000006D | Bad user name or authentication information
      0xC000006E | An account restriction prevented the logon
      0xC000006F | Logon outside the allowed hours
      0xC0000070 | Logon from a workstation that isn’t allowed
      0xC0000071 | The password has expired
      0xC0000072 | The account is disabled
      0xC0000133 | Clocks are too far apart
      0xC000015B | This logon type isn’t granted to the user
      0xC0000193 | The account has expired
      0xC0000224 | The password must be changed at next logon
      0xC0000234 | The account is locked out
      # Kerberos failure codes (4768, 4771)
      0x6 | The user name was not found
      0x12 | Credentials revoked (disabled, expired or locked)
      0x17 | The password has expired
      0x18 | Pre-authentication failed (usually a wrong password)
      0x25 | Clocks are too far apart
    `),
  })
})()
