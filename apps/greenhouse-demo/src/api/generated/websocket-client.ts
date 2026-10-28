/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

export type ClientMessage = Ping | ResetPreview;
export type ApiVersion = "1";
export type Generation = number;
export type Kind = "ping";
export type RequestId = string;
export type SessionId = string;
export type ApiVersion1 = "1";
export type Generation1 = number;
export type Kind1 = "reset_preview";
export type RequestId1 = string;
export type Seed = number;
export type SessionId1 = string;

export interface Ping {
  api_version: ApiVersion;
  generation: Generation;
  kind: Kind;
  request_id: RequestId;
  session_id: SessionId;
}
export interface ResetPreview {
  api_version: ApiVersion1;
  generation: Generation1;
  kind: Kind1;
  request_id: RequestId1;
  seed: Seed;
  session_id: SessionId1;
}
