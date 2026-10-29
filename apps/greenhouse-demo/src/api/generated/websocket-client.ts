/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

export type ClientMessage = Ping | Reset | Control | SetController | Manual;
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
export type Kind2 = "start" | "pause" | "new_seed" | "record" | "stop_recording";
export type RequestId2 = string;
export type SessionId2 = string;
export type ApiVersion3 = "1";
export type CheckpointId = string | null;
export type Controller = "scripted_reference" | "manual" | "learned_policy";
export type Generation3 = number;
export type Kind3 = "set_controller";
export type RequestId3 = string;
export type SessionId3 = string;
export type Grip = "hold" | "close" | "open";
export type Lift = number;
export type Throttle = number;
export type Turn = number;
export type ApiVersion4 = "1";
export type Generation4 = number;
export type Kind4 = "manual";
export type RequestId4 = string;
export type SessionId4 = string;

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
export interface SetController {
  api_version: ApiVersion3;
  checkpoint_id?: CheckpointId;
  controller: Controller;
  generation: Generation3;
  kind: Kind3;
  request_id: RequestId3;
  session_id: SessionId3;
}
export interface Manual {
  action: ActionData;
  api_version: ApiVersion4;
  generation: Generation4;
  kind: Kind4;
  request_id: RequestId4;
  session_id: SessionId4;
}
export interface ActionData {
  grip?: Grip;
  lift?: Lift;
  throttle?: Throttle;
  turn?: Turn;
}
