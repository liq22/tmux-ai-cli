import * as fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { readConfig, updateCliConfigDir, updateCliPath, updateCliSocket, updateCliTmuxTmpDir } from "../config";
import { pickCliPath } from "../discovery";
import { SessionsTreeProvider } from "../tree/provider";

async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultInstallPrefix(): string {
  return path.join(os.homedir(), ".local");
}

function defaultCliPathFromInstall(): string {
  return path.join(defaultInstallPrefix(), "bin", "ai");
}

function defaultConfigDirFromInstall(): string {
  return path.join(os.homedir(), ".config", "tmux-ai");
}

async function openTextFile(filePath: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

export function registerCliConfigCommands(
  context: vscode.ExtensionContext,
  provider: SessionsTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.cli.useInstallDefaults", async () => {
      const defaultCliPath = defaultCliPathFromInstall();
      const defaultConfigDir = defaultConfigDirFromInstall();

      const cfg = readConfig();
      const cliPath = (await isExecutableFile(defaultCliPath)) ? defaultCliPath : cfg.cliPath;

      if (!cliPath) {
        const picked = await pickCliPath();
        if (!picked) return;
        await updateCliPath(picked);
      } else if (cliPath !== cfg.cliPath) {
        await updateCliPath(cliPath);
      }

      await updateCliSocket("ai");
      await updateCliConfigDir(defaultConfigDir);
      await updateCliTmuxTmpDir(null);

      await provider.reload({ interactive: false, silent: false });

      const action = await vscode.window.showInformationMessage(
        "Tmux AI 已配置为 install.sh 的默认安装位置。",
        "Open ai-types.yaml",
        "Diagnostics",
      );
      if (action === "Open ai-types.yaml") {
        await vscode.commands.executeCommand("tmuxAi.cli.openConfig");
      } else if (action === "Diagnostics") {
        await vscode.commands.executeCommand("tmuxAi.diagnostics");
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.cli.openConfig", async () => {
      const cfg = readConfig();
      const configDir = cfg.cliConfigDir ?? defaultConfigDirFromInstall();

      const items: Array<{ label: string; filePath: string }> = [
        { label: "ai-types.yaml", filePath: path.join(configDir, "ai-types.yaml") },
        { label: ".tmux.conf", filePath: path.join(configDir, ".tmux.conf") },
      ];

      const picked = await vscode.window.showQuickPick(items, {
        title: "Open tmux-ai-cli config",
        placeHolder: configDir,
      });
      if (!picked) return;

      try {
        await openTextFile(picked.filePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(
          `Failed to open ${picked.label}: ${message}. (configDir=${configDir})`,
        );
      }
    }),
  );
}
