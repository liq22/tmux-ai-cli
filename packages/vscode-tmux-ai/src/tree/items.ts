import * as vscode from "vscode";

import { CliSessionInfo, CliTypeInfo } from "../cli/protocol";
import { OrphanedTerminalInfo } from "../terminal/manager";

export type TreeNode = TypeNode | SessionNode | OrphanedGroupNode | OrphanedTerminalNode | MessageNode;

export interface TypeNode {
  kind: "type";
  typeId: string;
  typeInfo: CliTypeInfo;
  sessions: CliSessionInfo[];
}

export interface SessionNode {
  kind: "session";
  session: CliSessionInfo;
  typeInfo: CliTypeInfo;
}

export interface OrphanedGroupNode {
  kind: "orphanedGroup";
  terminals: OrphanedTerminalInfo[];
}

export interface OrphanedTerminalNode {
  kind: "orphanedTerminal";
  info: OrphanedTerminalInfo;
}

export interface MessageNode {
  kind: "message";
  label: string;
  description?: string;
  command?: vscode.Command;
}
