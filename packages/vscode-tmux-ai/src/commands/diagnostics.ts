import * as vscode from "vscode";

import { getCliRunner } from "../cli/factory";
import { CliListOk } from "../cli/protocol";
import { CliExecError, CliProtocolError, CliResponseError } from "../cli/runner";
import { getCliEnvOverrides, readConfig } from "../config";
import { ensureCliPath } from "../discovery";

function formatListSummary(list: CliListOk): string {
  const shortNames = list.sessions
    .map((s) => s.shortName)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const head = shortNames.slice(0, 12);
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

export function registerDiagnosticsCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.diagnostics", async () => {
      const cfg = readConfig();
      const envOverrides = getCliEnvOverrides(cfg);
      const cliPath = await ensureCliPath(true);

      const extVersion = String((context.extension.packageJSON as any)?.version ?? "<unknown>");

      let listSummary: string;
      let altListSummary: string | null = null;
      if (!cliPath) {
        listSummary = "cliPath: <not configured>";
      } else {
        try {
          const runner = getCliRunner(cliPath, { debug: cfg.debug, envOverrides });
          const list = await runner.list();
          listSummary = formatListSummary(list);

          const shouldProbeAuto = list.sessions.length === 0 && (cfg.cliSocket || cfg.cliTmuxTmpDir);
          if (shouldProbeAuto) {
            const relaxed = { ...envOverrides };
            delete relaxed.TMUX_AI_SOCKET;
            delete relaxed.TMUX_TMPDIR;
            delete relaxed.TMUX_AI_BACKEND_FIXED;
            const runner2 = getCliRunner(cliPath, { debug: cfg.debug, envOverrides: relaxed });
            const list2 = await runner2.list();
            altListSummary = formatListSummary(list2);
          }
        } catch (err) {
          listSummary = `list failed: ${formatError(err)}`;
        }
      }

      const lines = [
        "Tmux AI diagnostics",
        `- extensionVersion: ${extVersion}`,
        `- cliPath: ${cliPath ?? "<unset>"}`,
        `- tmuxAi.cli.socket: ${cfg.cliSocket ?? "<unset>"}`,
        `- tmuxAi.cli.configDir: ${cfg.cliConfigDir ?? "<unset>"}`,
        `- tmuxAi.cli.tmuxTmpDir: ${cfg.cliTmuxTmpDir ?? "<unset>"}`,
        `- tmuxAi.cli.autoDetectBackend: ${cfg.cliAutoDetectBackend}`,
        `- env.TMUX: ${process.env.TMUX ?? "<unset>"}`,
        `- env.TMUX_AI_BACKEND_FIXED: ${process.env.TMUX_AI_BACKEND_FIXED ?? "<unset>"}`,
        `- env.TMUX_AI_SOCKET: ${process.env.TMUX_AI_SOCKET ?? "<unset>"}`,
        `- env.TMUX_AI_CONFIG: ${process.env.TMUX_AI_CONFIG ?? "<unset>"}`,
        `- env.TMUX_TMPDIR: ${process.env.TMUX_TMPDIR ?? "<unset>"}`,
        `- cliEnvOverrides.TMUX_AI_SOCKET: ${envOverrides.TMUX_AI_SOCKET ?? "<unset>"}`,
        `- cliEnvOverrides.TMUX_AI_CONFIG: ${envOverrides.TMUX_AI_CONFIG ?? "<unset>"}`,
        `- cliEnvOverrides.TMUX_TMPDIR: ${envOverrides.TMUX_TMPDIR ?? "<unset>"}`,
        `- cliEnvOverrides.TMUX_AI_BACKEND_FIXED: ${envOverrides.TMUX_AI_BACKEND_FIXED ?? "<unset>"}`,
        `- ${listSummary}`,
        ...(altListSummary ? [`- auto-detect probe: ${altListSummary}`] : []),
      ];
      const text = lines.join("\n");

      const action = await vscode.window.showInformationMessage("Tmux AI diagnostics ready.", "Copy");
      if (action === "Copy") {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage("Copied to clipboard.");
      }
    }),
  );
}
