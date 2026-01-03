# Tmux AI (VS Code Extension)

`vscode-tmux-ai` integrates `tmux-ai-cli` into VS Code with a dedicated Activity Bar view to manage AI tmux sessions (multi-session, multi-client, passive sync, and orphaned terminal cleanup).

## Prerequisites

- `tmux` installed and usable in the same environment as the VS Code extension host (Local / SSH Remote / WSL).
- `tmux-ai-cli` installed and providing the JSON contract (`protocolVersion=1`):
  - `ai list --json`
  - `ai new --json --type <typeId> [--name <shortName>]`
  - `ai attach --json <shortName>`
  - `ai rename --json <old> <new>`
  - `ai kill --json <shortName>`
  - `ai detach-all --json <shortName>`

CLI contract reference: `docs/cli-contract.md`.

## Getting Started

1) Install `tmux-ai-cli` and ensure `ai` is executable.
2) In VS Code, run:
   - `Tmux AI: Select CLI Path` (or set `tmuxAi.cliPath` manually)
3) Open the Activity Bar container **Tmux AI** → **Sessions**.

## Features

- **Sessions Explorer**: Types → Sessions hierarchy.
- **Inline actions**:
  - Connect (Smart Focus: reuse existing terminal if present)
  - New Client (always opens a new VS Code terminal attached to the same tmux session)
  - Rename / Detach All / Kill
- **Passive Sync**: refresh silently when VS Code regains focus (`tmuxAi.passiveSync.enabled`).
- **Orphaned terminals**: terminals whose names match the AI naming format but no longer exist in `ai list` are shown under **Orphaned**, with one-click cleanup.

## Configuration

- `tmuxAi.cliPath`: path to `ai`
- `tmuxAi.discovery.searchPaths`: probe paths when `cliPath` is unset
- `tmuxAi.passiveSync.enabled`: refresh on focus
- `tmuxAi.terminal.nameFormat`: default `AI: {shortName}`
- `tmuxAi.terminal.multiClientNameFormat`: default `AI: {shortName} ({k})`
- `tmuxAi.confirm.destructiveActions`: confirm before kill/detach/cleanup
- `tmuxAi.debug`: extra logs from the extension

## Build / Package

From `packages/vscode-tmux-ai/`:

```bash
npm install
npm run compile
```

Package as `.vsix` (requires `vsce`):

```bash
npm i -g @vscode/vsce
vsce package
```

Install the generated `.vsix` via **Extensions → ⋯ → Install from VSIX…**

