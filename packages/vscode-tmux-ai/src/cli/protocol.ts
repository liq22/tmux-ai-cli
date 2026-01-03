export const EXPECTED_PROTOCOL_VERSION = 1;

export interface CliOkBase {
  ok: true;
  protocolVersion: number;
}

export interface CliErrorBase {
  ok: false;
  protocolVersion: number;
  code: string;
  message: string;
  hint?: string;
}

export type CliResponse<TOk extends object> = (CliOkBase & TOk) | CliErrorBase;

export interface CliTypeInfo {
  label: string;
  icon: string;
  base_color: string;
  desc: string;
}

export interface CliSessionInfo {
  name: string;
  shortName: string;
  type: string;
  tmuxSession: string;
  attachedClients: number;
  created: string;
  lastUsed: string;
  windowName: string;
}

export type CliListResponse = CliResponse<{
  types: Record<string, CliTypeInfo>;
  sessions: CliSessionInfo[];
  now: string;
}>;

