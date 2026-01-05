import * as vscode from "vscode";

import { getCliRunner } from "../cli/factory";
import { CliRunner } from "../cli/runner";
import { getCliEnvOverrides, readConfig } from "../config";
import { ensureCliPath } from "../discovery";
import { deriveInstanceColor } from "../tree/render";
import { isValidShortName } from "../validation";
import { SessionsTreeProvider } from "../tree/provider";

import { SessionNode } from "../tree/items";
import { formatMultiClientTerminalName, formatPrimaryTerminalName } from "../terminal/naming";
import { findPrimaryTerminal, listTerminalsForSession } from "../terminal/scan";
import { TerminalManager } from "../terminal/manager";

async function ensureRunner(interactive: boolean): Promise<CliRunner | null> {
  const cfg = readConfig();
  const cliPath = await ensureCliPath(interactive);
  if (!cliPath) return null;
  return getCliRunner(cliPath, { debug: cfg.debug, envOverrides: getCliEnvOverrides(cfg) });
}

function toTerminalEnv(overrides: ReturnType<typeof getCliEnvOverrides>): Record<string, string | null> | undefined {
  const env: Record<string, string | null> = {};
  env.TMUX = null;
  if (overrides.TMUX_AI_BACKEND_FIXED) env.TMUX_AI_BACKEND_FIXED = overrides.TMUX_AI_BACKEND_FIXED;
  if (overrides.TMUX_AI_SOCKET) env.TMUX_AI_SOCKET = overrides.TMUX_AI_SOCKET;
  if (overrides.TMUX_AI_CONFIG) env.TMUX_AI_CONFIG = overrides.TMUX_AI_CONFIG;
  if (overrides.TMUX_TMPDIR) env.TMUX_TMPDIR = overrides.TMUX_TMPDIR;
  return Object.keys(env).length > 0 ? env : undefined;
}

function shellEscapePosix(arg: string): string {
  if (arg.length === 0) return "''";
  if (/^[A-Za-z0-9_\/\-\.:,@%+=]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\"'\"'`)}'`;
}

function argvToShellCommand(argv: string[]): string {
  return argv.map(shellEscapePosix).join(" ");
}

function createAttachTerminal(options: {
  shortName: string;
  iconId: string;
  argv: string[];
  terminalName: string;
  env?: Record<string, string | null>;
}): vscode.Terminal {
  if (options.argv.length === 0) {
    throw new Error("CLI returned empty argv for attach");
  }
  const instanceColor = deriveInstanceColor(options.shortName);
  const terminal = vscode.window.createTerminal({
    name: options.terminalName,
    ...(options.env && Object.keys(options.env).length > 0 ? { env: options.env } : {}),
    iconPath: new vscode.ThemeIcon(options.iconId, instanceColor),
    color: instanceColor,
  });
  terminal.sendText(argvToShellCommand(options.argv), true);
  return terminal;
}

function ensureUnsetsTmuxInArgv(argv: string[]): string[] {
  if (argv.length === 0) return argv;
  if (argv[0] === "env") {
    for (let i = 1; i < argv.length - 1; i++) {
      if (argv[i] === "-u" && argv[i + 1] === "TMUX") return argv;
    }
    return ["env", "-u", "TMUX", ...argv.slice(1)];
  }
  return ["env", "-u", "TMUX", ...argv];
}

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  provider: SessionsTreeProvider,
  terminalManager: TerminalManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.session.connect", async (node: SessionNode) => {
      try {
        if (provider.isDegraded()) {
          vscode.window.showErrorMessage(provider.getDegradedHint() ?? "CLI incompatible (degraded mode).");
          return;
        }
        if (!node?.session?.shortName) return;

        const shortName = node.session.shortName;
        if (!isValidShortName(shortName) || shortName === "master") {
          vscode.window.showErrorMessage(`Invalid shortName: ${shortName}`);
          return;
        }

        const existing = terminalManager.getPrimary(shortName) ?? findPrimaryTerminal(shortName);
        if (existing) {
          existing.show();
          return;
        }

        const runner = await ensureRunner(true);
        if (!runner) return;

        const resp = await runner.attach(shortName);
        const cfg = readConfig();
        const terminalName = formatPrimaryTerminalName(cfg.terminalNameFormat, shortName);
        const envOverrides = toTerminalEnv(getCliEnvOverrides(cfg));
        const argv = ensureUnsetsTmuxInArgv(resp.argv);
        const terminal = createAttachTerminal({
          shortName,
          iconId: node.typeInfo.icon || "terminal",
          argv,
          terminalName,
          env: envOverrides,
        });
        terminalManager.trackSessionTerminal(shortName, 1, terminal);
        terminal.show();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Connect failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.session.newClient", async (node: SessionNode) => {
      try {
        if (provider.isDegraded()) {
          vscode.window.showErrorMessage(provider.getDegradedHint() ?? "CLI incompatible (degraded mode).");
          return;
        }
        if (!node?.session?.shortName) return;

        const shortName = node.session.shortName;
        if (!isValidShortName(shortName) || shortName === "master") {
          vscode.window.showErrorMessage(`Invalid shortName: ${shortName}`);
          return;
        }

        const runner = await ensureRunner(true);
        if (!runner) return;

        const resp = await runner.attach(shortName);
        const cfg = readConfig();
        const k = terminalManager.getNextClientIndex(shortName);
        const terminalName = formatMultiClientTerminalName(
          cfg.terminalMultiClientNameFormat,
          shortName,
          k,
        );
        const envOverrides = toTerminalEnv(getCliEnvOverrides(cfg));
        const argv = ensureUnsetsTmuxInArgv(resp.argv);

        const terminal = createAttachTerminal({
          shortName,
          iconId: node.typeInfo.icon || "terminal",
          argv,
          terminalName,
          env: envOverrides,
        });
        terminalManager.trackSessionTerminal(shortName, k, terminal);
        terminal.show();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`New client failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.session.rename", async (node: SessionNode) => {
      try {
        if (provider.isDegraded()) {
          vscode.window.showErrorMessage(provider.getDegradedHint() ?? "CLI incompatible (degraded mode).");
          return;
        }
        if (!node?.session?.shortName) return;

        const oldShortName = node.session.shortName;
        if (!isValidShortName(oldShortName) || oldShortName === "master") {
          vscode.window.showErrorMessage(`Invalid shortName: ${oldShortName}`);
          return;
}

        const newShortName = await vscode.window.showInputBox({
          title: "Rename Session",
          prompt: "Enter new shortName (only [a-zA-Z0-9_-]+)",
          value: oldShortName,
          validateInput: (value) => {
            const v = value.trim();
            if (v.length === 0) return "shortName is required";
            if (v === "master") return "'master' is reserved";
            if (!isValidShortName(v)) return "Only [a-zA-Z0-9_-]+ is allowed";
            return null;
          },
        });
        if (!newShortName) return;

        const trimmed = newShortName.trim();
        if (trimmed === oldShortName) return;

        const runner = await ensureRunner(true);
        if (!runner) return;

        await runner.rename(oldShortName, trimmed);
        await provider.reload({ interactive: false, silent: true });

        const existing = listTerminalsForSession(oldShortName);
        if (existing.length === 0) {
          vscode.window.showInformationMessage(`Renamed: ${oldShortName} → ${trimmed}`);
          return;
        }

        const choice = await vscode.window.showInformationMessage(
          `Renamed: ${oldShortName} → ${trimmed}. ${existing.length} terminal(s) still use the old name.`,
          "Close & Reopen",
          "Just Close",
          "Keep",
        );

        if (choice === "Just Close" || choice === "Close & Reopen") {
          for (const t of existing) {
            try {
              t.terminal.dispose();
            } catch {
              // ignore
            }
          }
        }

        if (choice === "Close & Reopen") {
          const newNode: SessionNode = { kind: "session", session: { ...node.session, shortName: trimmed }, typeInfo: node.typeInfo };
          await vscode.commands.executeCommand("tmuxAi.session.connect", newNode);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Rename failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.session.kill", async (node: SessionNode) => {
      try {
        if (provider.isDegraded()) {
          vscode.window.showErrorMessage(provider.getDegradedHint() ?? "CLI incompatible (degraded mode).");
          return;
        }
        if (!node?.session?.shortName) return;

        const shortName = node.session.shortName;
        if (!isValidShortName(shortName) || shortName === "master") {
          vscode.window.showErrorMessage(`Invalid shortName: ${shortName}`);
          return;
        }

        const cfg = readConfig();
        if (cfg.confirmDestructiveActions) {
          const choice = await vscode.window.showWarningMessage(
            `Kill session "${shortName}"?`,
            { modal: true },
            "Kill",
            "Cancel",
          );
          if (choice !== "Kill") return;
        }

        const runner = await ensureRunner(true);
        if (!runner) return;

        await runner.kill(shortName);
        await provider.reload({ interactive: false, silent: true });

        const terminals = listTerminalsForSession(shortName);
        if (terminals.length > 0) {
          const closeChoice = await vscode.window.showInformationMessage(
            `Killed "${shortName}". Close ${terminals.length} VS Code terminal(s)?`,
            "Close",
            "Keep",
          );
          if (closeChoice === "Close") {
            for (const t of terminals) {
              try {
                t.terminal.dispose();
              } catch {
                // ignore
              }
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Kill failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.session.detachAll", async (node: SessionNode) => {
      try {
        if (provider.isDegraded()) {
          vscode.window.showErrorMessage(provider.getDegradedHint() ?? "CLI incompatible (degraded mode).");
          return;
        }
        if (!node?.session?.shortName) return;

        const shortName = node.session.shortName;
        if (!isValidShortName(shortName) || shortName === "master") {
          vscode.window.showErrorMessage(`Invalid shortName: ${shortName}`);
          return;
        }

        const cfg = readConfig();
        if (cfg.confirmDestructiveActions) {
          const choice = await vscode.window.showWarningMessage(
            `Detach all clients from "${shortName}"?`,
            { modal: true },
            "Detach",
            "Cancel",
          );
          if (choice !== "Detach") return;
        }

        const runner = await ensureRunner(true);
        if (!runner) return;

        await runner.detachAll(shortName);
        await provider.reload({ interactive: false, silent: true });

        const terminals = listTerminalsForSession(shortName);
        if (terminals.length > 0) {
          const closeChoice = await vscode.window.showInformationMessage(
            `Detached all clients. Close ${terminals.length} VS Code terminal(s)?`,
            "Close",
            "Keep",
          );
          if (closeChoice === "Close") {
            for (const t of terminals) {
              try {
                t.terminal.dispose();
              } catch {
                // ignore
              }
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Detach all failed: ${message}`);
      }
    }),
  );
}
