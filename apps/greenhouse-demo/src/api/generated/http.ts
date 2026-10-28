/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

export type ApiVersion = "1";
export type Commands = ("ping" | "start" | "pause" | "reset" | "new_seed")[];
export type HeartbeatHz = number;
export type LanguageMissions = boolean;
export type MaxSessions = number;
export type Mode = "reference_simulation";
export type Simulation = boolean;
export type SnapshotHz = number;
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
export type Collisions = number;
export type Controller = "scripted_reference";
export type Delivered = boolean;
export type ElapsedSeconds = number;
export type Kind = "info" | "success" | "warning";
export type Text = string;
export type Tick = number;
export type Events = TaskEvent[];
export type InvalidActions = number;
export type Mode1 = "reference_simulation";
export type Pickups = number;
export type Pots = SceneObject[];
export type Reason = string | null;
export type Heading = number;
export type Holding = boolean;
export type Id1 = "caretaker";
export type LeftWheelAngle = number;
export type LiftHeight = number;
export type RightWheelAngle = number;
export type X1 = number;
export type Y1 = number;
export type SimulatorVersion = string;
export type Stage = "approach" | "grasp" | "lift" | "deliver" | "lower" | "release" | "done";
export type Status1 = "ready" | "running" | "paused" | "complete" | "failed";
export type Id2 = string;
export type Walls = Obstacle[];
export type Seed1 = number;
export type SessionId = string;
export type Tick1 = number;

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
  snapshot_hz?: SnapshotHz;
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
  tick: Tick1;
}
export interface Scene {
  capsule: SceneObject;
  collisions: Collisions;
  controller: Controller;
  delivered: Delivered;
  elapsed_seconds: ElapsedSeconds;
  events: Events;
  invalid_actions: InvalidActions;
  mode: Mode1;
  pickups: Pickups;
  pots: Pots;
  reason: Reason;
  robot: Robot;
  simulator_version: SimulatorVersion;
  stage: Stage;
  status: Status1;
  tray: SceneObject;
  walls: Walls;
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
export interface TaskEvent {
  kind: Kind;
  text: Text;
  tick: Tick;
}
export interface Robot {
  heading: Heading;
  holding: Holding;
  id: Id1;
  left_wheel_angle: LeftWheelAngle;
  lift_height: LiftHeight;
  right_wheel_angle: RightWheelAngle;
  x: X1;
  y: Y1;
}
export interface Obstacle {
  half_size: Vector3;
  id: Id2;
  position: Vector3;
}
