import { CliRunner } from "./runner";

import type { CliEnvOverrides } from "../config";
import * as os from "node:os";
import * as vscode from "vscode";

let cached: { key: string; runner: CliRunner } | null = null;

function pickDefaultCwd(): string {
  const firstFolder = vscode.workspace.workspaceFolders?.[0];
  if (firstFolder) return firstFolder.uri.fsPath;
  return os.homedir();
}

export function getCliRunner(
  cliPath: string,
  options: { debug: boolean; envOverrides?: CliEnvOverrides },
): CliRunner {
  const fixed = options.envOverrides?.TMUX_AI_BACKEND_FIXED ?? "";
  const sock = options.envOverrides?.TMUX_AI_SOCKET ?? "";
  const conf = options.envOverrides?.TMUX_AI_CONFIG ?? "";
  const tmp = options.envOverrides?.TMUX_TMPDIR ?? "";
  const cwd = pickDefaultCwd();
  const key = `${cliPath}::${options.debug ? "1" : "0"}::cwd=${cwd}::fixed=${fixed}::sock=${sock}::conf=${conf}::tmp=${tmp}`;
  if (cached?.key === key) return cached.runner;
  const env = { ...process.env };
  delete env.TMUX;
  if (options.envOverrides) Object.assign(env, options.envOverrides);
  cached = { key, runner: new CliRunner({ cliPath, debug: options.debug, env, cwd }) };
  return cached.runner;
}
