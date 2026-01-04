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

1) Ensure `tmux-ai-cli` (`ai`) is available:
   - Default: the extension auto-installs a bundled `ai` into VS Code global storage (`tmuxAi.cli.autoInstallBundled=true`).
   - Manual: run `Tmux AI: Install tmux-ai-cli (Bundled)` (no `install.sh` needed).
   - Or install manually and ensure `ai` is executable in your environment.
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
- `tmuxAi.cli.socket`: override `TMUX_AI_SOCKET` for the extension (optional)
- `tmuxAi.cli.configDir`: override `TMUX_AI_CONFIG` for the extension (optional)
- `tmuxAi.cli.tmuxTmpDir`: override `TMUX_TMPDIR` for the extension (optional; fixes “VS Code connects to a different tmux server than your shell”)
- `tmuxAi.cli.autoInstallBundled`: auto-install bundled `ai` into VS Code global storage when missing
- `tmuxAi.cli.autoDetectBackend`: auto-detect tmux backend mismatch (when Sessions shows 0 but orphaned terminals exist)
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
vsce package --no-dependencies
```

Then install the generated `.vsix`:

- VS Code UI: **Extensions** → **⋯** → **Install from VSIX…**
- VS Code CLI: `code --install-extension vscode-tmux-ai-0.0.14.vsix`

## Debug

Recommended workflow (with breakpoints):

1) Open the repo root as your VS Code workspace.
2) Run `npm install` (once) and `npm run watch` (optional).
3) Press `F5` using the launch config **Run Extension (Tmux AI)**.
4) In the Extension Development Host window:
   - Run `Tmux AI: Select CLI Path` and pick your `ai` executable.
   - Run `Tmux AI: Refresh Sessions`.
5) Run `Tmux AI: Diagnostics` to confirm `cliPath` / socket / configDir and the session list.
6) View logs: **Output → Log (Extension Host)**. For extra CLI stderr logs, set `tmuxAi.debug=true`.

## Troubleshooting

- **Extension shows 0 sessions but `ai list` shows sessions**: run `Tmux AI: Detect CLI Socket` and select the backend that contains your sessions (sets `tmuxAi.cli.socket` + `tmuxAi.cli.tmuxTmpDir`), then refresh.
- If it still shows 0, run `Tmux AI: Diagnostics` and ensure `tmuxAi.cliPath` points to the same `ai` you use in the shell, and that `tmuxAi.cli.socket` / `tmuxAi.cli.configDir` match your environment.
- **Sessions created in the extension are not visible in your shell (or vice versa)**: this is almost always a backend mismatch (different `TMUX_AI_SOCKET`, `TMUX_AI_CONFIG`, or `TMUX_TMPDIR`).
- **Connect/Attach terminal exits immediately with code 1**: if VS Code is started inside another tmux, `env.TMUX` may be set and tmux refuses to attach to a different server (“sessions should be nested with care…”). Upgrade to the latest extension/CLI (they unset `TMUX` for attach terminals), or launch VS Code outside tmux as a workaround.
- Quick fix: run `Tmux AI: Use CLI Install Defaults` (assumes `install.sh` defaults: `~/.local/bin/ai` + `~/.config/tmux-ai` + socket `ai`).
- To edit CLI config: run `Tmux AI: Open CLI Config` (opens `ai-types.yaml` / `.tmux.conf`).
- To remove the bundled CLI: run `Tmux AI: Uninstall tmux-ai-cli (Bundled)` (VS Code may not run cleanup automatically on uninstall, so run this command first if you want the files removed).

## Build / Package

From `packages/vscode-tmux-ai/`:

```bash
npm install
npm run compile
```

Package as `.vsix` (requires `vsce`):

```bash
npm i -g @vscode/vsce
vsce package --no-dependencies
```

Install the generated `.vsix` via **Extensions → ⋯ → Install from VSIX…**
