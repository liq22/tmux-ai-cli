import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { getCliRunner } from "../cli/factory";
import { CliListOk } from "../cli/protocol";
import { CliExecError, CliProtocolError, CliResponseError } from "../cli/runner";
import { getCliEnvOverrides, readConfig, updateCliSocket } from "../config";
import { ensureCliPath } from "../discovery";
import { SessionsTreeProvider } from "../tree/provider";

function candidateTmuxSocketDirs(): string[] {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid === null) return [];

  const bases = new Set<string>();
  if (process.env.TMUX_TMPDIR) bases.add(process.env.TMUX_TMPDIR);
  bases.add("/tmp");
  bases.add(os.tmpdir());

  return Array.from(bases)
    .filter((p) => p && p.trim().length > 0)
    .map((base) => path.join(base, `tmux-${uid}`));
}

async function listSocketNames(): Promise<string[]> {
  const names = new Set<string>();
  for (const dir of candidateTmuxSocketDirs()) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        try {
          const st = await fs.lstat(full);
          if (st.isSocket()) names.add(entry);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

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

      const sockets = await listSocketNames();
      if (sockets.length === 0) {
        vscode.window.showWarningMessage("No tmux socket directory found under /tmp (or TMUX_TMPDIR).");
        return;
      }

      const baseOverrides = getCliEnvOverrides(cfg);
      const candidates: Array<{
        socket: string;
        list: CliListOk | null;
        error: string | null;
      }> = [];

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Tmux AI: Detecting tmux sockets…" },
        async () => {
          for (const socket of sockets) {
            try {
              const runner = getCliRunner(cliPath, {
                debug: cfg.debug,
                envOverrides: { ...baseOverrides, TMUX_AI_SOCKET: socket },
              });
              const list = await runner.list();
              candidates.push({ socket, list, error: null });
            } catch (err) {
              candidates.push({ socket, list: null, error: formatError(err) });
            }
          }
        },
      );

      const items = candidates
        .map((c) => {
          const hasSessions = (c.list?.sessions.length ?? 0) > 0;
          return {
            label: c.socket,
            description: c.error ? "error" : `${c.list?.sessions.length ?? 0} session(s)`,
            detail: c.error ? c.error : formatListSummary(c.list!),
            socket: c.socket,
            hasSessions,
          };
        })
        .sort((a, b) => Number(b.hasSessions) - Number(a.hasSessions) || a.label.localeCompare(b.label));

      const picked = await vscode.window.showQuickPick(items, {
        title: "Select TMUX_AI_SOCKET for tmux-ai-cli",
        placeHolder: "Pick the socket that contains your ai-* sessions",
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!picked) return;

      await updateCliSocket(picked.socket);
      await provider.reload({ interactive: false, silent: false });
      vscode.window.showInformationMessage(`Set tmuxAi.cli.socket=${picked.socket}`);
    }),
  );
}

