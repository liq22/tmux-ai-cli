import * as vscode from "vscode";

import { getCliEnvOverrides, readConfig, updateCliSocket, updateCliTmuxTmpDir } from "./config";
import { getCliRunner } from "./cli/factory";
import { ensureCliPath, pickCliPath } from "./discovery";
import { registerSessionCommands } from "./commands/session";
import { registerOrphanedCommands } from "./commands/orphaned";
import { registerCreateSessionCommand } from "./commands/createSession";
import { registerDiagnosticsCommand } from "./commands/diagnostics";
import { registerCliConfigCommands } from "./commands/cliConfig";
import { registerDetectSocketCommand } from "./commands/detectSocket";
import { registerCliInstallerCommands } from "./commands/cliInstaller";
import { SessionsTreeProvider } from "./tree/provider";
import { TerminalManager } from "./terminal/manager";
import { ensureWorkspaceTerminalFallbackSettings } from "./workspace/fallbackSettings";
import { syncWorkspaceTerminalProfiles } from "./workspace/profileFallback";
import { candidateTmuxTmpDirs, listSocketCandidates } from "./tmux/backendCandidates";

function getRunner(cliPath: string) {
  const cfg = readConfig();
  return getCliRunner(cliPath, { debug: cfg.debug, envOverrides: getCliEnvOverrides(cfg) });
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function activate(context: vscode.ExtensionContext): void {
  const terminalManager = new TerminalManager();
  let autoDetectInProgress = false;
  let lastAutoDetectAt = 0;

  const provider = new SessionsTreeProvider(terminalManager, async ({ list, cliPath }) => {
    await ensureWorkspaceTerminalFallbackSettings();
    await syncWorkspaceTerminalProfiles({ context, cliPath, list });

    const cfg = readConfig();
    if (!cfg.cliAutoDetectBackend) return;
    if (autoDetectInProgress) return;
    if (list.sessions.length > 0) return;

    // If the user pinned a backend (socket/tmpdir) but it yields 0 sessions, try clearing the overrides
    // so the CLI can auto-detect. This prevents "0 sessions" caused by a stale/wrong override.
    if (cfg.cliSocket || cfg.cliTmuxTmpDir) {
      autoDetectInProgress = true;
      try {
        const relaxedOverrides = getCliEnvOverrides(cfg);
        delete relaxedOverrides.TMUX_AI_SOCKET;
        delete relaxedOverrides.TMUX_TMPDIR;
        delete relaxedOverrides.TMUX_AI_BACKEND_FIXED;

        const runner = getCliRunner(cliPath, { debug: cfg.debug, envOverrides: relaxedOverrides });
        const probed = await runner.list();
        if (probed.sessions.length > 0) {
          await updateCliSocket(null);
          await updateCliTmuxTmpDir(null);
          await provider.reload({ interactive: false, silent: true });
          void vscode.window.showInformationMessage(
            `Tmux AI: cleared backend overrides and found ${probed.sessions.length} session(s)`,
          );
          return;
        }
      } catch {
        // ignore
      } finally {
        autoDetectInProgress = false;
      }
    }

    const orphaned = terminalManager.getOrphaned();
    if (orphaned.length === 0) return;

    const now = Date.now();
    if (now - lastAutoDetectAt < 15_000) return;
    lastAutoDetectAt = now;

    const wanted = new Set(orphaned.map((o) => o.shortName).filter(Boolean));
    if (wanted.size === 0) return;

    const baseOverrides = getCliEnvOverrides(cfg);
    const tmpDirs = candidateTmuxTmpDirs([cfg.cliTmuxTmpDir ?? ""].filter(Boolean));
    const candidates = await listSocketCandidates(tmpDirs);
    if (candidates.length === 0) return;

    autoDetectInProgress = true;
    try {
      type Probe = {
        socket: string;
        tmuxTmpDir: string;
        matchCount: number;
        sessionsCount: number;
      };

      let bestByMatch: Probe | null = null;
      let bestByMatchTies: Probe[] = [];
      let bestBySessions: Probe | null = null;
      let bestBySessionsTies: Probe[] = [];

      for (const c of candidates) {
        try {
          const runner = getCliRunner(cliPath, {
            debug: cfg.debug,
            envOverrides: {
              ...baseOverrides,
              TMUX_AI_BACKEND_FIXED: "1",
              TMUX_TMPDIR: c.tmuxTmpDir,
              TMUX_AI_SOCKET: c.socket,
            },
          });
          const probed = await runner.list();
          const sessionsCount = probed.sessions.length;
          let matchCount = 0;
          for (const s of probed.sessions) {
            if (wanted.has(s.shortName)) matchCount++;
          }

          const probe: Probe = {
            socket: c.socket,
            tmuxTmpDir: c.tmuxTmpDir,
            matchCount,
            sessionsCount,
          };

          if (!bestByMatch) {
            bestByMatch = probe;
            bestByMatchTies = [probe];
          } else if (probe.matchCount > bestByMatch.matchCount) {
            bestByMatch = probe;
            bestByMatchTies = [probe];
          } else if (
            probe.matchCount === bestByMatch.matchCount &&
            probe.sessionsCount > bestByMatch.sessionsCount
          ) {
            bestByMatch = probe;
            bestByMatchTies = [probe];
          } else if (
            probe.matchCount === bestByMatch.matchCount &&
            probe.sessionsCount === bestByMatch.sessionsCount
          ) {
            bestByMatchTies.push(probe);
          }

          if (probe.sessionsCount > 0) {
            if (!bestBySessions) {
              bestBySessions = probe;
              bestBySessionsTies = [probe];
            } else if (probe.sessionsCount > bestBySessions.sessionsCount) {
              bestBySessions = probe;
              bestBySessionsTies = [probe];
            } else if (probe.sessionsCount === bestBySessions.sessionsCount) {
              bestBySessionsTies.push(probe);
            }
          }
        } catch {
          // ignore probe errors
        }
      }

      const best =
        bestByMatch && bestByMatch.matchCount > 0 && bestByMatchTies.length === 1
          ? bestByMatch
          : bestBySessions && bestBySessions.sessionsCount > 0 && bestBySessionsTies.length === 1
            ? bestBySessions
            : null;

      if (!best) return;

      const needsUpdate = cfg.cliSocket !== best.socket || cfg.cliTmuxTmpDir !== best.tmuxTmpDir;
      if (!needsUpdate) return;

      await updateCliSocket(best.socket);
      await updateCliTmuxTmpDir(best.tmuxTmpDir);
      await provider.reload({ interactive: false, silent: true });

      void vscode.window.showInformationMessage(
        `Tmux AI: auto-detected backend (socket=${best.socket}, tmuxTmpDir=${best.tmuxTmpDir})`,
      );
    } finally {
      autoDetectInProgress = false;
    }
  });
  void vscode.commands.executeCommand("setContext", "tmuxAi.degraded", false);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("tmuxAi.sessions", provider));

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("tmuxAi.terminal.useProfileFallback") ||
        e.affectsConfiguration("tmuxAi.terminal.nameFormat") ||
        e.affectsConfiguration("tmuxAi.cliPath") ||
        e.affectsConfiguration("tmuxAi.cli.socket") ||
        e.affectsConfiguration("tmuxAi.cli.configDir") ||
        e.affectsConfiguration("tmuxAi.cli.tmuxTmpDir")
      ) {
        void (async () => {
          await ensureWorkspaceTerminalFallbackSettings();
          const cfg = readConfig();
          if (!cfg.terminalUseProfileFallback) return;
          const list = provider.getLatestList();
          if (!list) return;
          const cliPath = await ensureCliPath(false);
          if (!cliPath) return;
          await syncWorkspaceTerminalProfiles({ context, cliPath, list });
        })();
      }

      if (
        e.affectsConfiguration("tmuxAi.cli.socket") ||
        e.affectsConfiguration("tmuxAi.cli.configDir") ||
        e.affectsConfiguration("tmuxAi.cli.tmuxTmpDir")
      ) {
        void provider.reload({ interactive: false, silent: true });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.selectCliPath", async () => {
      await pickCliPath();
      await provider.reload({ interactive: false, silent: true });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tmuxAi.refresh", async () => {
      const cliPath = await ensureCliPath(true);
      if (!cliPath) return;
      getRunner(cliPath);
      await provider.reload({ interactive: false, silent: false });
    }),
  );

  registerSessionCommands(context, provider, terminalManager);
  registerOrphanedCommands(context, provider, terminalManager);
  registerCreateSessionCommand(context, provider, terminalManager);
  registerDiagnosticsCommand(context);
  registerCliConfigCommands(context, provider);
  registerDetectSocketCommand(context, provider);
  registerCliInstallerCommands(context, provider);

  void (async () => {
    const cfg = readConfig();
    if (!cfg.cliAutoInstallBundled) return;

    const bundledCliPath = vscode.Uri.joinPath(context.globalStorageUri, "tmux-ai-cli", "bin", "ai").fsPath;
    const shouldManageBundled = !cfg.cliPath || cfg.cliPath === bundledCliPath;
    if (!shouldManageBundled) return;

    const cliPath = await ensureCliPath(false);
    if (cliPath && cliPath === bundledCliPath) {
      try {
        const installedUri = vscode.Uri.file(bundledCliPath);
        const bundledUri = vscode.Uri.joinPath(context.extensionUri, "resources", "cli", "ai");
        const [installedBytes, bundledBytes] = await Promise.all([
          vscode.workspace.fs.readFile(installedUri),
          vscode.workspace.fs.readFile(bundledUri),
        ]);
        if (!buffersEqual(installedBytes, bundledBytes)) {
          await vscode.commands.executeCommand("tmuxAi.cli.installBundled", { silent: true, force: true });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`auto update bundled tmux-ai-cli failed: ${message}`);
      }
      return;
    }

    if (cliPath) return;

    try {
      await vscode.commands.executeCommand("tmuxAi.cli.installBundled", { silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`auto install bundled tmux-ai-cli failed: ${message}`);
    }
  })();

  let passiveSyncTimer: NodeJS.Timeout | null = null;
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      const cfg = readConfig();
      if (!cfg.passiveSyncEnabled) return;
      if (!e.focused) return;

      if (passiveSyncTimer) clearTimeout(passiveSyncTimer);
      passiveSyncTimer = setTimeout(() => {
        void provider.reload({ interactive: false, silent: true });
      }, 800);
    }),
  );
  context.subscriptions.push({
    dispose: () => {
      if (passiveSyncTimer) clearTimeout(passiveSyncTimer);
    },
  });

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(() => {
      provider.rehydrateTerminalsFromCache();
    }),
  );

  void ensureWorkspaceTerminalFallbackSettings();
  void provider.reload({ interactive: false, silent: true });
}

export function deactivate(): void {}
