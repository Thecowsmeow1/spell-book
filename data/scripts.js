// Optional fallback when scripts.json cannot be read (including file://).
window.SPELLBOOK_SCRIPTS = [
  {
    "id": "python-0001",
    "name": "Hello World",
    "language": "Python",
    "tags": [
      "example"
    ],
    "body": "print(\"Hello, world!\")",
    "notes": "Minimal Python script."
  },
  {
    "id": "bash-script-0001",
    "name": "Show current directory",
    "language": "Bash",
    "tags": [
      "filesystem"
    ],
    "body": "#!/usr/bin/env bash\npwd\nls -la",
    "notes": "Run with bash."
  }
];
