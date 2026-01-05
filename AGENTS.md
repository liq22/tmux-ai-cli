# Repository Guidelines

## Project Structure & Module Organization

- `bin/`: Bash CLI entrypoints (`ai` is the primary command; `ai-tmux` is a compatibility wrapper).
- `config/`: Default user config templates installed by `install.sh` (e.g. `ai-types.yaml`, `.tmux.conf`).
- `docs/`: Design notes and the VS Code ↔ CLI JSON contract (`docs/cli-contract.md`).
- `packages/vscode-tmux-ai/`: VS Code extension (TypeScript in `src/`, compiled output in `dist/`).
- `scripts/`: Developer utilities (e.g. `scripts/smoke_concurrency.sh`).
- `vscode/`: Example VS Code `settings.json` / `keybindings.json` templates.

## Build, Test, and Development Commands

```bash
./install.sh                      # installs `ai` into $PREFIX/bin and config into ~/.config/tmux-ai
bin/ai help                       # run CLI from source without installing
scripts/smoke_concurrency.sh       # quick tmux + concurrency smoke (no real AI binaries required)
cd packages/vscode-tmux-ai
npm install && npm run compile     # build the extension (tsc)
npm run watch                      # rebuild on changes (use with the repo’s VS Code launch config)
```

## Coding Style & Naming Conventions

- Bash: keep `set -euo pipefail`, quote variables, and prefer small helper functions over long inline pipelines.
- TypeScript (extension): keep `strict` mode passing; avoid `any` unless unavoidable and keep types explicit at boundaries.
- Indentation: 2 spaces across Bash/TS/JSON/YAML; keep diffs small (no repo-wide formatter config).
- Generated artifacts: don’t commit `packages/vscode-tmux-ai/dist/`, `packages/vscode-tmux-ai/node_modules/`, or `*.vsix` (they’re ignored).

## Testing Guidelines

- No unit test suite in this repo; use targeted smoke/manual checks.
- If you touch JSON output used by the extension, validate against `docs/cli-contract.md` and ensure `--json` writes **only** a single JSON object to stdout (logs/debug to stderr).

## Security & Configuration Tips

- Runtime config is controlled via env vars like `TMUX_AI_CONFIG`, `TMUX_AI_SOCKET`, and (for VS Code backend alignment) `TMUX_TMPDIR`.
- Avoid printing secrets to stdout in `--json` mode; treat stdout as a machine interface.

## Commit & Pull Request Guidelines

- Commits follow Conventional Commits seen in history: `feat(scope): ...`, `fix: ...`, `docs(scope): ...`, `chore: ...`, `refactor(scope): ...` (scopes commonly `cli` / `extension`).
- PRs should include: what changed, how to test (commands + environment), and any contract/config updates (especially `docs/cli-contract.md`).
