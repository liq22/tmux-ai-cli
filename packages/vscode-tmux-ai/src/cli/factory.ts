import { CliRunner } from "./runner";

import type { CliEnvOverrides } from "../config";

let cached: { key: string; runner: CliRunner } | null = null;

export function getCliRunner(
  cliPath: string,
  options: { debug: boolean; envOverrides?: CliEnvOverrides },
): CliRunner {
  const fixed = options.envOverrides?.TMUX_AI_BACKEND_FIXED ?? "";
  const sock = options.envOverrides?.TMUX_AI_SOCKET ?? "";
  const conf = options.envOverrides?.TMUX_AI_CONFIG ?? "";
  const tmp = options.envOverrides?.TMUX_TMPDIR ?? "";
  const key = `${cliPath}::${options.debug ? "1" : "0"}::fixed=${fixed}::sock=${sock}::conf=${conf}::tmp=${tmp}`;
  if (cached?.key === key) return cached.runner;
  const env = options.envOverrides ? { ...process.env, ...options.envOverrides } : undefined;
  cached = { key, runner: new CliRunner({ cliPath, debug: options.debug, env }) };
  return cached.runner;
}
