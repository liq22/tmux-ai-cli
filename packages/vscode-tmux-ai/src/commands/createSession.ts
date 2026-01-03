import * as vscode from "vscode";

import { getCliRunner } from "../cli/factory";
import { CliTypeInfo } from "../cli/protocol";
import { getCliEnvOverrides, readConfig } from "../config";
import { ensureCliPath } from "../discovery";
import { TerminalManager } from "../terminal/manager";
import { isValidShortName } from "../validation";
import { SessionsTreeProvider } from "../tree/provider";
import { SessionNode, TypeNode } from "../tree/items";

export function registerCreateSessionCommand(
  context: vscode.ExtensionContext,
  provider: SessionsTreeProvider,
  _terminalManager: TerminalManager,
): void {
  let creating = false;

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.session.create", async (node?: TypeNode) => {
      if (creating) return;
      creating = true;
      try {
        if (provider.isDegraded()) {
          vscode.window.showErrorMessage(provider.getDegradedHint() ?? "CLI incompatible (degraded mode).");
          return;
        }
        const cfg = readConfig();
        const cliPath = await ensureCliPath(true);
        if (!cliPath) return;

        const runner = getCliRunner(cliPath, { debug: cfg.debug, envOverrides: getCliEnvOverrides(cfg) });

        let typeId: string | null = null;
        let typeInfo: CliTypeInfo | null = null;

        if (node?.kind === "type") {
          typeId = node.typeId;
          typeInfo = node.typeInfo;
        } else {
          const list = await runner.list();
          const items = Object.entries(list.types).map(([id, info]) => ({
            label: info.label,
            description: id,
            typeId: id,
            typeInfo: info,
          }));
          items.sort((a, b) => a.label.localeCompare(b.label));

          const picked = await vscode.window.showQuickPick(items, {
            title: "New Session",
            placeHolder: "Select a type",
          });
          if (!picked) return;
          typeId = picked.typeId;
          typeInfo = picked.typeInfo;
        }

        const rawName = await vscode.window.showInputBox({
          title: "New Session",
          prompt: "Optional shortName (empty = auto). Only [a-zA-Z0-9_-]+",
          placeHolder: "e.g. claude-7 or work",
          validateInput: (value) => {
            const v = value.trim();
            if (v.length === 0) return null;
            if (v === "master") return "'master' is reserved";
            if (!isValidShortName(v)) return "Only [a-zA-Z0-9_-]+ is allowed";
            return null;
          },
        });
        if (rawName === undefined) return;

        const shortName = rawName.trim();
        const nameArg = shortName.length > 0 ? shortName : undefined;

        const resp = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Tmux AI: Creating session…" },
          async () => runner.newSession(typeId!, nameArg),
        );

        await provider.reload({ interactive: false, silent: true });

        const sessionNode: SessionNode = {
          kind: "session",
          session: resp.session,
          typeInfo: typeInfo ?? { label: typeId!, icon: "terminal", base_color: "", desc: "" },
        };
        await vscode.commands.executeCommand("tmuxAi.session.connect", sessionNode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Create session failed: ${message}`);
      } finally {
        creating = false;
      }
    }),
  );
}
