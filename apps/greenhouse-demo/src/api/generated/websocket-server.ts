/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

export type ServerMessage = Hello | Snapshot | Heartbeat | Ack | StreamError;
export type ApiVersion = "1";
export type Generation = number;
export type Kind = "hello";
export type Mode = "foundation_preview";
export type SessionId = string;
export type Tick = number;
export type ApiVersion1 = "1";
export type Generation1 = number;
export type Kind1 = "snapshot";
export type Id = string;
export type X = number;
export type Y = number;
export type Z = number;
export type Mode1 = "foundation_preview";
export type Heading = number;
export type Holding = boolean;
export type Id1 = "caretaker";
export type X1 = number;
export type Y1 = number;
export type Seed = number;
export type SessionId1 = string;
export type Tick1 = number;
export type ApiVersion2 = "1";
export type Generation2 = number;
export type Kind2 = "heartbeat";
export type SessionId2 = string;
export type Tick2 = number;
export type Accepted = boolean;
export type ApiVersion3 = "1";
export type Command = "ping" | "reset_preview";
export type Generation3 = number;
export type Kind3 = "ack";
export type Reason = ("stale_generation" | "session_mismatch" | "rate_limited") | null;
export type RequestId = string;
export type SessionId3 = string;
export type Tick3 = number;
export type ApiVersion4 = "1";
export type Code = "invalid_message";
export type Generation4 = number;
export type Kind4 = "error";
export type Message = string;
export type SessionId4 = string;
export type Tick4 = number;

export interface Hello {
  api_version: ApiVersion;
  generation: Generation;
  kind: Kind;
  mode?: Mode;
  session_id: SessionId;
  tick: Tick;
}
export interface Snapshot {
  api_version: ApiVersion1;
  generation: Generation1;
  kind: Kind1;
  scene: Scene;
  seed: Seed;
  session_id: SessionId1;
  tick: Tick1;
}
export interface Scene {
  capsule: SceneObject;
  mode: Mode1;
  robot: Robot;
  tray: SceneObject;
}
export interface SceneObject {
  id: Id;
  position: Vector3;
}
export interface Vector3 {
  x: X;
  y: Y;
  z: Z;
}
export interface Robot {
  heading: Heading;
  holding: Holding;
  id: Id1;
  x: X1;
  y: Y1;
}
export interface Heartbeat {
  api_version: ApiVersion2;
  generation: Generation2;
  kind: Kind2;
  session_id: SessionId2;
  tick: Tick2;
}
export interface Ack {
  accepted: Accepted;
  api_version: ApiVersion3;
  command: Command;
  generation: Generation3;
  kind: Kind3;
  reason: Reason;
  request_id: RequestId;
  session_id: SessionId3;
  tick: Tick3;
}
export interface StreamError {
  api_version: ApiVersion4;
  code?: Code;
  generation: Generation4;
  kind: Kind4;
  message: Message;
  session_id: SessionId4;
  tick: Tick4;
}
