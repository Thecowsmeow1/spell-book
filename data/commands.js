// Optional fallback when commands.json cannot be read (including file://).
window.SPELLBOOK_COMMANDS = [
  {
    "id": "bash-0001",
    "title": "List files",
    "platform": "Bash",
    "tags": [
      "filesystem",
      "listing"
    ],
    "description": "List files including hidden entries.",
    "command": "ls -la",
    "variables": [],
    "variableDetails": [],
    "example": "ls -la /tmp",
    "notes": "Use -h for human-readable sizes."
  },
  {
    "id": "bash-0002",
    "title": "Find text in files",
    "platform": "Bash",
    "tags": [
      "search"
    ],
    "description": "Search recursively for text.",
    "command": "grep -R \"<pattern>\" <directory>",
    "variables": [
      "pattern",
      "directory"
    ],
    "variableDetails": [],
    "example": "grep -R \"TODO\" .",
    "notes": "Quote search patterns."
  },
  {
    "id": "powershell-0001",
    "title": "List processes",
    "platform": "PowerShell",
    "tags": [
      "processes"
    ],
    "description": "Display running processes.",
    "command": "Get-Process",
    "variables": [],
    "variableDetails": [],
    "example": "Get-Process | Sort-Object CPU -Descending",
    "notes": ""
  }
];
