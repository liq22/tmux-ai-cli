import * as fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { readConfig, updateCliConfigDir, updateCliPath } from "../config";
import { SessionsTreeProvider } from "../tree/provider";

const INSTALL_ROOT_DIRNAME = "tmux-ai-cli";

function defaultUserConfigDir(): string {
  return path.join(os.homedir(), ".config", "tmux-ai");
}

function installRootUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, INSTALL_ROOT_DIRNAME);
}

function installBinDirUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(installRootUri(context), "bin");
}

function installConfigDirUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(installRootUri(context), "config");
}

function bundledAssetUri(context: vscode.ExtensionContext, fileName: string): vscode.Uri {
  return vscode.Uri.joinPath(context.extensionUri, "resources", "cli", fileName);
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

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

async function copyBundledFile(context: vscode.ExtensionContext, fileName: string, dest: vscode.Uri): Promise<void> {
  const content = await vscode.workspace.fs.readFile(bundledAssetUri(context, fileName));
  await vscode.workspace.fs.writeFile(dest, content);
}

async function chmodIfPossible(uri: vscode.Uri, mode: number): Promise<void> {
  if (!uri.fsPath) return;
  try {
    await fs.chmod(uri.fsPath, mode);
  } catch {
    // ignore
  }
}

async function userConfigExists(): Promise<boolean> {
  const dir = defaultUserConfigDir();
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) return false;
  } catch {
    return false;
  }

  try {
    const types = await fs.stat(path.join(dir, "ai-types.yaml"));
    const tmuxConf = await fs.stat(path.join(dir, ".tmux.conf"));
    return types.isFile() && tmuxConf.isFile();
  } catch {
    return false;
  }
}

async function installBundledCli(context: vscode.ExtensionContext): Promise<{
  cliPath: string;
  configDirOverride: string | null;
}> {
  const binDir = installBinDirUri(context);
  const configDir = installConfigDirUri(context);
  await vscode.workspace.fs.createDirectory(binDir);

  const aiUri = vscode.Uri.joinPath(binDir, "ai");
  const aiTmuxUri = vscode.Uri.joinPath(binDir, "ai-tmux");

  await copyBundledFile(context, "ai", aiUri);
  await copyBundledFile(context, "ai-tmux", aiTmuxUri);
  await chmodIfPossible(aiUri, 0o755);
  await chmodIfPossible(aiTmuxUri, 0o755);

  const cfg = readConfig();
  if (cfg.cliConfigDir) {
    return { cliPath: aiUri.fsPath, configDirOverride: null };
  }

  if (await userConfigExists()) {
    return { cliPath: aiUri.fsPath, configDirOverride: null };
  }

  await vscode.workspace.fs.createDirectory(configDir);
  await copyBundledFile(context, ".tmux.conf", vscode.Uri.joinPath(configDir, ".tmux.conf"));
  await copyBundledFile(context, "ai-types.yaml", vscode.Uri.joinPath(configDir, "ai-types.yaml"));

  return { cliPath: aiUri.fsPath, configDirOverride: configDir.fsPath };
}

async function uninstallBundledCli(context: vscode.ExtensionContext): Promise<void> {
  const root = installRootUri(context);
  if (!(await uriExists(root))) return;
  await vscode.workspace.fs.delete(root, { recursive: true, useTrash: false });
}

export function registerCliInstallerCommands(
  context: vscode.ExtensionContext,
  provider: SessionsTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tmuxAi.cli.installBundled",
      async (options?: { silent?: boolean; force?: boolean }) => {
      if (process.platform === "win32") {
        vscode.window.showErrorMessage("Bundled CLI install is not supported on Windows. Use WSL/Remote or install manually.");
        return;
      }

      const cfg = readConfig();
      const currentCliPath = cfg.cliPath;

      let updatePath = true;
      if (!options?.force && currentCliPath && (await isExecutableFile(currentCliPath))) {
        const action = await vscode.window.showInformationMessage(
          `tmuxAi.cliPath 已配置: ${currentCliPath}`,
          "Switch to bundled",
          "Keep current",
          "Cancel",
        );
        if (action === "Cancel" || !action) return;
        updatePath = action === "Switch to bundled";
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Tmux AI: Installing bundled tmux-ai-cli…" },
        async () => {
          await vscode.workspace.fs.createDirectory(installRootUri(context));
          const installed = await installBundledCli(context);

          if (updatePath) {
            await updateCliPath(installed.cliPath);
          }
          if (installed.configDirOverride) {
            await updateCliConfigDir(installed.configDirOverride);
          }
        },
      );

      await provider.reload({ interactive: false, silent: options?.silent ?? false });

      if (options?.silent) return;

      const action = await vscode.window.showInformationMessage(
        "Bundled tmux-ai-cli 已安装并可用于扩展。",
        "Diagnostics",
        "Open CLI Config",
      );
      if (action === "Diagnostics") {
        await vscode.commands.executeCommand("tmuxAi.diagnostics");
      } else if (action === "Open CLI Config") {
        await vscode.commands.executeCommand("tmuxAi.cli.openConfig");
      }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.cli.uninstallBundled", async () => {
      const root = installRootUri(context);
      if (!(await uriExists(root))) {
        vscode.window.showInformationMessage("Bundled tmux-ai-cli 未安装。");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Remove bundled tmux-ai-cli from: ${root.fsPath}`,
        { modal: true },
        "Remove",
      );
      if (confirm !== "Remove") return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Tmux AI: Uninstalling bundled tmux-ai-cli…" },
        async () => {
          const binDir = installBinDirUri(context);
          const configDir = installConfigDirUri(context);
          const bundledAiPath = vscode.Uri.joinPath(binDir, "ai").fsPath;
          const bundledConfigDirPath = configDir.fsPath;

          const cfg = readConfig();
          if (cfg.cliPath === bundledAiPath) {
            await updateCliPath(null);
          }
          if (cfg.cliConfigDir === bundledConfigDirPath) {
            await updateCliConfigDir(null);
          }

          await uninstallBundledCli(context);
        },
      );

      await provider.reload({ interactive: false, silent: false });
      vscode.window.showInformationMessage("Bundled tmux-ai-cli 已移除。");
    }),
  );
}
