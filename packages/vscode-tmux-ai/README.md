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
- **Workspace terminal profiles (optional)**: when `tmuxAi.terminal.useProfileFallback=true`, the extension generates workspace-level profiles like `AI: claude-1` so you can open a new attached terminal via the terminal profile dropdown.
- **Degraded mode**: if CLI protocol is incompatible (wrong `protocolVersion` or non-JSON output), dangerous commands are disabled until the CLI is updated.

## Configuration

- `tmuxAi.cliPath`: path to `ai`
- `tmuxAi.discovery.searchPaths`: probe paths when `cliPath` is unset
- `tmuxAi.passiveSync.enabled`: refresh on focus
- `tmuxAi.terminal.nameFormat`: default `AI: {shortName}`
- `tmuxAi.terminal.multiClientNameFormat`: default `AI: {shortName} ({k})`
- `tmuxAi.confirm.destructiveActions`: confirm before kill/detach/cleanup
- `tmuxAi.terminal.useProfileFallback`: when enabled, the extension may write workspace terminal settings (tabs + per-session terminal profiles) as a fallback (no global settings changes)
- `tmuxAi.debug`: extra logs from the extension

## Install in VS Code

The extension is not published to the marketplace yet. Install it via a local `.vsix`.

From `packages/vscode-tmux-ai/`:

```bash
npm install
npm run compile
npm i -g @vscode/vsce
vsce package
```

Then install the generated `.vsix`:

- VS Code UI: **Extensions** → **⋯** → **Install from VSIX…**
- VS Code CLI: `code --install-extension vscode-tmux-ai-0.0.1.vsix`

## Debug

Recommended workflow (with breakpoints):

1) Open `packages/vscode-tmux-ai/` as your VS Code workspace.
2) Run `npm install` (once) and `npm run watch` (optional).
3) Press `F5` using the launch config **Run Extension (Tmux AI)**.
4) In the Extension Development Host window:
   - Run `Tmux AI: Select CLI Path` and pick your `ai` executable.
   - Run `Tmux AI: Refresh Sessions`.
5) View logs: **Output → Log (Extension Host)**. For extra CLI stderr logs, set `tmuxAi.debug=true`.

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
