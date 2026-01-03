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

export type CliOk<TOk extends object> = CliOkBase & TOk;

export type CliResponse<TOk extends object> = CliOk<TOk> | CliErrorBase;

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

export type CliListOk = CliOk<{
  types: Record<string, CliTypeInfo>;
  sessions: CliSessionInfo[];
  now: string;
}>;

export type CliNewOk = CliOk<{ session: CliSessionInfo }>;

export type CliAttachOk = CliOk<{
  argv: string[];
  session: CliSessionInfo;
}>;

export type CliRenameOk = CliOk<{ session: CliSessionInfo }>;

export type CliOkSimple = CliOk<Record<string, never>>;

export type CliDetachAllOk = CliOkSimple;
