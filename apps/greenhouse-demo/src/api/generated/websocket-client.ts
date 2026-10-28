/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

export type ClientMessage = Ping | Reset | Control;
export type ApiVersion = "1";
export type Generation = number;
export type Kind = "ping";
export type RequestId = string;
export type SessionId = string;
export type ApiVersion1 = "1";
export type Generation1 = number;
export type Kind1 = "reset";
export type RequestId1 = string;
export type SessionId1 = string;
export type ApiVersion2 = "1";
export type Generation2 = number;
export type Kind2 = "start" | "pause" | "new_seed";
export type RequestId2 = string;
export type SessionId2 = string;

export interface Ping {
  api_version: ApiVersion;
  generation: Generation;
  kind: Kind;
  request_id: RequestId;
  session_id: SessionId;
}
export interface Reset {
  api_version: ApiVersion1;
  generation: Generation1;
  kind: Kind1;
  request_id: RequestId1;
  session_id: SessionId1;
}
export interface Control {
  api_version: ApiVersion2;
  generation: Generation2;
  kind: Kind2;
  request_id: RequestId2;
  session_id: SessionId2;
}
