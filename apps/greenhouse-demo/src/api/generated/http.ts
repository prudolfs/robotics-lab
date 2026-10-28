/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

export type ApiVersion = "1";
export type Commands = ("ping" | "reset_preview")[];
export type HeartbeatHz = number;
export type LanguageMissions = boolean;
export type MaxSessions = number;
export type Mode = "foundation_preview";
export type Simulation = boolean;
export type Training = boolean;
export type Seed = number;
export type ApiVersion1 = "1";
export type ServerVersion = string;
export type Status = "ok";
export type ApiVersion2 = "1";
export type Generation = number;
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
export type Seed1 = number;
export type SessionId = string;
export type Tick = number;

/**
 * Schema bundle for TypeScript generation; not a synthetic HTTP endpoint.
 */
export interface HttpModels {
  capabilities: Capabilities;
  create_session: CreateSession;
  health: Health;
  session: SessionView;
}
export interface Capabilities {
  api_version?: ApiVersion;
  commands?: Commands;
  heartbeat_hz?: HeartbeatHz;
  language_missions?: LanguageMissions;
  max_sessions?: MaxSessions;
  mode?: Mode;
  simulation?: Simulation;
  training?: Training;
}
export interface CreateSession {
  seed?: Seed;
}
export interface Health {
  api_version?: ApiVersion1;
  server_version: ServerVersion;
  status?: Status;
}
export interface SessionView {
  api_version?: ApiVersion2;
  generation: Generation;
  scene: Scene;
  seed: Seed1;
  session_id: SessionId;
  tick: Tick;
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
