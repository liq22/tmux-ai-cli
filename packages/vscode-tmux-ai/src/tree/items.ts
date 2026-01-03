import * as vscode from "vscode";

import { CliSessionInfo, CliTypeInfo } from "../cli/protocol";

export type TreeNode = TypeNode | SessionNode | MessageNode;

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

export interface MessageNode {
  kind: "message";
  label: string;
  description?: string;
  command?: vscode.Command;
}

