import * as vscode from "vscode";

import { getCliEnvOverrides, readConfig } from "../config";
import { ensureCliPath } from "../discovery";
import { getCliRunner } from "../cli/factory";
import { CliListOk, CliSessionInfo } from "../cli/protocol";
import { CliExecError, CliProtocolError } from "../cli/runner";
import { TerminalManager } from "../terminal/manager";

import { MessageNode, OrphanedGroupNode, OrphanedTerminalNode, SessionNode, TreeNode, TypeNode } from "./items";
import { deriveInstanceColor, formatLastUsedDescription } from "./render";

export class SessionsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private listCache: CliListOk | null = null;
  private lastError: Error | null = null;
  private degraded = false;
  private degradedHint: string | null = null;

  constructor(
    private readonly terminalManager: TerminalManager,
    private readonly onListUpdated?: (event: { list: CliListOk; cliPath: string }) => void | Promise<void>,
  ) {}

  isDegraded(): boolean {
    return this.degraded;
  }

  getLatestList(): CliListOk | null {
    return this.listCache;
  }

  getDegradedHint(): string | null {
    return this.degradedHint;
  }

  private setDegraded(value: boolean, hint: string | null): void {
    this.degraded = value;
    this.degradedHint = hint;
    void vscode.commands.executeCommand("setContext", "tmuxAi.degraded", value);
  }

  private computeDegradedState(err: Error): { degraded: boolean; hint: string | null } {
    if (err instanceof CliProtocolError) {
      return {
        degraded: true,
        hint: "tmux-ai-cli protocolVersion 不兼容；请更新 tmux-ai-cli（重新运行 install.sh 或 git pull 后重装）。",
      };
    }
    if (err instanceof CliExecError && err.message.includes("did not return valid JSON")) {
      return {
        degraded: true,
        hint: "tmux-ai-cli 未返回 JSON（可能是旧版 CLI 或 cliPath 指向了非 tmux-ai-cli 可执行文件）。",
      };
    }
    return { degraded: false, hint: null };
  }

  refresh(): void {
    this.listCache = null;
    this.lastError = null;
    void vscode.commands.executeCommand("setContext", "tmuxAi.hasOrphaned", false);
    this.setDegraded(false, null);
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  rehydrateTerminalsFromCache(): void {
    if (!this.listCache) return;
    this.terminalManager.rehydrate(this.listCache.sessions);
    void vscode.commands.executeCommand("setContext", "tmuxAi.hasOrphaned", this.terminalManager.getOrphaned().length > 0);
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async reload(options: { interactive: boolean; silent: boolean }): Promise<void> {
    try {
      const cfg = readConfig();
      const cliPath = await ensureCliPath(options.interactive);
      if (!cliPath) {
        this.listCache = null;
        this.lastError = null;
        void vscode.commands.executeCommand("setContext", "tmuxAi.hasOrphaned", false);
        this.setDegraded(false, null);
        this.onDidChangeTreeDataEmitter.fire(undefined);
        return;
      }
      const runner = getCliRunner(cliPath, { debug: cfg.debug, envOverrides: getCliEnvOverrides(cfg) });
      this.listCache = await runner.list();
      this.terminalManager.rehydrate(this.listCache.sessions);
      void vscode.commands.executeCommand("setContext", "tmuxAi.hasOrphaned", this.terminalManager.getOrphaned().length > 0);
      this.setDegraded(false, null);
      this.lastError = null;
      void Promise.resolve(this.onListUpdated?.({ list: this.listCache, cliPath })).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`workspace fallback sync failed: ${msg}`);
      });
      this.onDidChangeTreeDataEmitter.fire(undefined);
    } catch (err) {
      this.listCache = null;
      this.lastError = err instanceof Error ? err : new Error(String(err));
      const degraded = this.computeDegradedState(this.lastError);
      this.setDegraded(degraded.degraded, degraded.hint);
      this.onDidChangeTreeDataEmitter.fire(undefined);
      if (!options.silent) {
        vscode.window.showErrorMessage(`Tmux AI refresh failed: ${this.lastError.message}`);
      }
    }
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === "message") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.description = element.description;
      item.command = element.command;
      item.contextValue = "tmuxAi.message";
      return item;
    }

    if (element.kind === "orphanedGroup") {
      const item = new vscode.TreeItem("Orphaned", vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${element.terminals.length} terminal(s)`;
      item.contextValue = "tmuxAi.orphanedGroup";
      item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("descriptionForeground"));
      return item;
    }

    if (element.kind === "orphanedTerminal") {
      const item = new vscode.TreeItem(element.info.name, vscode.TreeItemCollapsibleState.None);
      item.description = "Dead";
      item.contextValue = "tmuxAi.orphanedTerminal";
      item.iconPath = new vscode.ThemeIcon("circle-slash", new vscode.ThemeColor("descriptionForeground"));
      return item;
    }

    if (element.kind === "type") {
      const item = new vscode.TreeItem(element.typeInfo.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${element.sessions.length} session(s)`;
      item.contextValue = "tmuxAi.type";
      if (element.typeInfo.icon) {
        item.iconPath = new vscode.ThemeIcon(element.typeInfo.icon);
      }
      return item;
    }

    const session = element.session;
    const item = new vscode.TreeItem(session.shortName, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "tmuxAi.session";

    const iconId = element.typeInfo.icon || "terminal";
    const instanceColor = deriveInstanceColor(session.shortName);
    item.iconPath = new vscode.ThemeIcon(iconId, instanceColor);

    const status = session.attachedClients > 0 ? `Attached · (${session.attachedClients} clients)` : "Idle";
    item.description = `${status} · ${formatLastUsedDescription(session)}`;

    item.command = {
      command: "tmuxAi.session.connect",
      title: "Connect",
      arguments: [element],
    };

    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (element && element.kind === "type") {
      return element.sessions
        .slice()
        .sort((a, b) => a.shortName.localeCompare(b.shortName))
        .map<SessionNode>((session) => ({
          kind: "session",
          session,
          typeInfo: element.typeInfo,
        }));
    }

    if (element && element.kind === "orphanedGroup") {
      return element.terminals.map<OrphanedTerminalNode>((info) => ({ kind: "orphanedTerminal", info }));
    }

    if (element) return [];

    const cfg = readConfig();
    const cliPath = await ensureCliPath(false);
    if (!cliPath) {
      void vscode.commands.executeCommand("setContext", "tmuxAi.hasOrphaned", false);
      this.setDegraded(false, null);
      const node: MessageNode = {
        kind: "message",
        label: "Configure tmuxAi.cliPath",
        description: "Select the tmux-ai-cli executable (ai)",
        command: { command: "tmuxAi.selectCliPath", title: "Select CLI Path" },
      };
      return [node];
    }

    if (!this.listCache && !this.lastError) {
      try {
        const runner = getCliRunner(cliPath, { debug: cfg.debug, envOverrides: getCliEnvOverrides(cfg) });
        this.listCache = await runner.list();
        this.terminalManager.rehydrate(this.listCache.sessions);
        void vscode.commands.executeCommand("setContext", "tmuxAi.hasOrphaned", this.terminalManager.getOrphaned().length > 0);
        this.setDegraded(false, null);
        void Promise.resolve(this.onListUpdated?.({ list: this.listCache, cliPath })).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`workspace fallback sync failed: ${msg}`);
        });
      } catch (err) {
        this.lastError = err instanceof Error ? err : new Error(String(err));
        const degraded = this.computeDegradedState(this.lastError);
        this.setDegraded(degraded.degraded, degraded.hint);
      }
    }

    if (this.degraded) {
      const node: MessageNode = {
        kind: "message",
        label: "CLI incompatible (degraded mode)",
        description: this.degradedHint ?? "Please update tmux-ai-cli and refresh.",
        command: { command: "tmuxAi.selectCliPath", title: "Select CLI Path" },
      };
      return [node];
    }

    if (this.lastError) {
      const node: MessageNode = {
        kind: "message",
        label: "CLI error",
        description: this.lastError.message,
        command: { command: "tmuxAi.refresh", title: "Refresh" },
      };
      return [node];
    }

    const list = this.listCache;
    if (!list) return [];

    const sessionsByType = new Map<string, CliSessionInfo[]>();
    for (const session of list.sessions) {
      const key = session.type || "unknown";
      const arr = sessionsByType.get(key);
      if (arr) arr.push(session);
      else sessionsByType.set(key, [session]);
    }

    const typeNodes: TypeNode[] = [];
    for (const [typeId, typeInfo] of Object.entries(list.types)) {
      const sessions = sessionsByType.get(typeId) ?? [];
      typeNodes.push({ kind: "type", typeId, typeInfo, sessions });
      sessionsByType.delete(typeId);
    }

    for (const [typeId, sessions] of sessionsByType.entries()) {
      typeNodes.push({
        kind: "type",
        typeId,
        typeInfo: { label: typeId, icon: "terminal", base_color: "", desc: "" },
        sessions,
      });
    }

    typeNodes.sort((a, b) => a.typeInfo.label.localeCompare(b.typeInfo.label));

    const orphaned = this.terminalManager.getOrphaned();

    const hintNodes: TreeNode[] = [];
    if (list.sessions.length === 0) {
      const node: MessageNode = {
        kind: "message",
        label: orphaned.length > 0 ? "0 sessions (possible backend mismatch)" : "No sessions found",
        description:
          orphaned.length > 0
            ? "Found orphaned terminals. Check TMUX_AI_SOCKET/TMUX_AI_CONFIG and run Detect CLI Socket."
            : "If you expected sessions, check TMUX_AI_SOCKET/TMUX_AI_CONFIG and run Detect CLI Socket.",
        command: { command: "tmuxAi.cli.detectSocket", title: "Detect CLI Socket" },
      };
      hintNodes.push(node);
    }

    if (orphaned.length > 0) {
      const orphanNode: OrphanedGroupNode = { kind: "orphanedGroup", terminals: orphaned };
      return [...hintNodes, ...typeNodes, orphanNode];
    }
    return hintNodes.length > 0 ? [...hintNodes, ...typeNodes] : typeNodes;
  }
}
