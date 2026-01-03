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

      let listSummary: string;
      if (!cliPath) {
        listSummary = "cliPath: <not configured>";
      } else {
        try {
          const runner = getCliRunner(cliPath, { debug: cfg.debug, envOverrides });
          const list = await runner.list();
          listSummary = formatListSummary(list);
        } catch (err) {
          listSummary = `list failed: ${formatError(err)}`;
        }
      }

      const lines = [
        "Tmux AI diagnostics",
        `- cliPath: ${cliPath ?? "<unset>"}`,
        `- tmuxAi.cli.socket: ${cfg.cliSocket ?? "<unset>"}`,
        `- tmuxAi.cli.configDir: ${cfg.cliConfigDir ?? "<unset>"}`,
        `- env.TMUX_AI_SOCKET: ${process.env.TMUX_AI_SOCKET ?? "<unset>"}`,
        `- env.TMUX_AI_CONFIG: ${process.env.TMUX_AI_CONFIG ?? "<unset>"}`,
        `- ${listSummary}`,
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

