import * as vscode from "vscode";

import { getCliRunner } from "../cli/factory";
import { CliListOk } from "../cli/protocol";
import { CliExecError, CliProtocolError, CliResponseError } from "../cli/runner";
import { getCliEnvOverrides, readConfig, updateCliSocket, updateCliTmuxTmpDir } from "../config";
import { ensureCliPath } from "../discovery";
import { candidateTmuxTmpDirs, listSocketCandidates } from "../tmux/backendCandidates";
import { SessionsTreeProvider } from "../tree/provider";

function formatListSummary(list: CliListOk): string {
  const shortNames = list.sessions
    .map((s) => s.shortName)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const head = shortNames.slice(0, 8);
  const tail = shortNames.length > head.length ? `, …(+${shortNames.length - head.length})` : "";
  return `${shortNames.length} session(s): ${head.join(", ")}${tail}`;
}

function formatError(err: unknown): string {
  if (err instanceof CliProtocolError) return err.message;
  if (err instanceof CliResponseError) return err.message;
  if (err instanceof CliExecError) return `${err.message}\nstderr: ${err.stderr.trim()}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function registerDetectSocketCommand(
  context: vscode.ExtensionContext,
  provider: SessionsTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.cli.detectSocket", async () => {
      const cfg = readConfig();
      const cliPath = await ensureCliPath(true);
      if (!cliPath) return;

      const tmpDirs = candidateTmuxTmpDirs([cfg.cliTmuxTmpDir ?? ""].filter(Boolean));
      const candidates = await listSocketCandidates(tmpDirs);
      if (candidates.length === 0) {
        vscode.window.showWarningMessage("No tmux socket found (checked /tmp, os.tmpdir, ~/.tmux-tmp, workspace .tmux-tmp, and TMUX_TMPDIR).");
        return;
      }

      const baseOverrides = getCliEnvOverrides(cfg);
      const results: Array<{
        tmuxTmpDir: string;
        socket: string;
        list: CliListOk | null;
        error: string | null;
      }> = [];

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Tmux AI: Detecting tmux sockets…" },
        async () => {
          for (const candidate of candidates) {
            try {
              const runner = getCliRunner(cliPath, {
                debug: cfg.debug,
                envOverrides: {
                  ...baseOverrides,
                  TMUX_TMPDIR: candidate.tmuxTmpDir,
                  TMUX_AI_SOCKET: candidate.socket,
                },
              });
              const list = await runner.list();
              results.push({ tmuxTmpDir: candidate.tmuxTmpDir, socket: candidate.socket, list, error: null });
            } catch (err) {
              results.push({
                tmuxTmpDir: candidate.tmuxTmpDir,
                socket: candidate.socket,
                list: null,
                error: formatError(err),
              });
            }
          }
        },
      );

      const items = results
        .map((c) => {
          const sessionsCount = c.list?.sessions.length ?? 0;
          const hasSessions = sessionsCount > 0;
          return {
            label: c.socket,
            description: c.error ? `error · tmpDir=${c.tmuxTmpDir}` : `${sessionsCount} session(s) · tmpDir=${c.tmuxTmpDir}`,
            detail: c.error ? c.error : formatListSummary(c.list!),
            socket: c.socket,
            tmuxTmpDir: c.tmuxTmpDir,
            hasSessions,
          };
        })
        .sort(
          (a, b) =>
            Number(b.hasSessions) - Number(a.hasSessions) ||
            a.label.localeCompare(b.label) ||
            a.tmuxTmpDir.localeCompare(b.tmuxTmpDir),
        );

      const picked = await vscode.window.showQuickPick(items, {
        title: "Select tmux backend for tmux-ai-cli",
        placeHolder: "Pick the (TMUX_TMPDIR, TMUX_AI_SOCKET) that contains your ai-* sessions",
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!picked) return;

      await updateCliSocket(picked.socket);
      await updateCliTmuxTmpDir(picked.tmuxTmpDir);
      await provider.reload({ interactive: false, silent: false });
      vscode.window.showInformationMessage(
        `Set tmuxAi.cli.socket=${picked.socket}, tmuxAi.cli.tmuxTmpDir=${picked.tmuxTmpDir}`,
      );
    }),
  );
}
