import * as vscode from "vscode";

import { readConfig } from "../config";
import { ensureCliPath } from "../discovery";
import { getCliRunner } from "../cli/factory";
import { CliListResponse, CliSessionInfo } from "../cli/protocol";

import { MessageNode, SessionNode, TreeNode, TypeNode } from "./items";
import { deriveInstanceColor, formatLastUsedDescription } from "./render";

export class SessionsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private listCache: CliListResponse | null = null;
  private lastError: Error | null = null;

  refresh(): void {
    this.listCache = null;
    this.lastError = null;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async reload(options: { interactive: boolean; silent: boolean }): Promise<void> {
    try {
      const cfg = readConfig();
      const cliPath = await ensureCliPath(options.interactive);
      if (!cliPath) {
        this.listCache = null;
        this.lastError = null;
        this.onDidChangeTreeDataEmitter.fire(undefined);
        return;
      }
      const runner = getCliRunner(cliPath, cfg.debug);
      this.listCache = await runner.list();
      this.lastError = null;
      this.onDidChangeTreeDataEmitter.fire(undefined);
    } catch (err) {
      this.listCache = null;
      this.lastError = err instanceof Error ? err : new Error(String(err));
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

    if (element) return [];

    const cfg = readConfig();
    const cliPath = await ensureCliPath(false);
    if (!cliPath) {
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
        const runner = getCliRunner(cliPath, cfg.debug);
        this.listCache = await runner.list();
      } catch (err) {
        this.lastError = err instanceof Error ? err : new Error(String(err));
      }
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
    return typeNodes;
  }
}

