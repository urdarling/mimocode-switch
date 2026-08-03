[中文](README.md) | [English](README.en.md)

# mimocode Provider Manager

A UI-based manager for third-party providers in mimocode. Provider data is read
and written directly to `mimocode.jsonc`; notes/links/ordering live in the
parallel metadata file `mimocode-ui.json`.

## Features

- Add / edit / duplicate / delete third-party providers (OpenAI-compatible endpoints)
- **Fetch models** — pull the provider's `/models` list automatically
- Set the default provider and default model (switch anytime from the card dropdown)
- Model variants (reasoning effort) annotation & selection: dual sources — built-in catalog
  (snapshot of mimocode's embedded data) + official variants library, with chip multi-select
- **Variants library** UI to maintain official variant entries; model context/output
  windows are auto-prefilled and editable
- Drag-and-drop card ordering

## Requirements

- [Bun](https://bun.sh) — the only runtime dependency
- mimocode — optional; needed only for the "extract built-in catalog" script, not at runtime

## Getting started

```bash
bun server.ts
```

Open http://127.0.0.1:4173 in your browser (override the port with the `PORT`
environment variable). On Windows you can also double-click `start.bat`
(automatically starts the server and opens the browser).

## Config path (matches mimocode)

- With `MIMOCODE_HOME` set: `$MIMOCODE_HOME/config`
- Otherwise: `~/.config/mimocode` (on Windows, macOS, and Linux alike — mimocode
  does not follow `%LOCALAPPDATA%`)

Candidate file names, in order: `mimocode.jsonc` → `mimocode.json` → `config.json`.

The file is backed up to `backups/` before every write (last 10 kept). Writing
strips JSONC comments and reformats to standard JSON.

## Data files

| File | Purpose |
|------|---------|
| `mimocode.jsonc` | The real provider config (credentials, etc.) |
| `mimocode-ui.json` (same dir) | Notes / links / ordering |
| `data/variants/mimo.json` | Built-in model catalog snapshot (generated — do not edit) |
| `data/variants/official.json` | Official variants library (maintain via the "Variants" UI or by hand) |

## Extract the built-in catalog (optional, after mimocode upgrades)

```bash
bun run scripts/extract-mimo-catalog.ts
```

Automatically locates your local mimo binary (`mimo`/`mimo.exe`; override with
the `MIMO_BIN` environment variable) and regenerates `data/variants/mimo.json`.

## Tests

```bash
bun test
```

## Privacy

Sensitive information such as API keys lives only in your local mimocode
configuration. This repository contains no credentials; the tool reads the
configuration of whichever machine it runs on.
