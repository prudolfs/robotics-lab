/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

export type ServerMessage = Hello | Snapshot | Heartbeat | Ack | StreamError;
export type ApiVersion = "1";
export type Generation = number;
export type Kind = "hello";
export type Mode = "reference_simulation";
export type SessionId = string;
export type Tick = number;
export type ApiVersion1 = "1";
export type CheckpointId = string | null;
export type ControllerError = string | null;
export type Generation1 = number;
export type Kind1 = "snapshot";
export type LastEpisodeId = string | null;
export type Recording = boolean;
export type RecordingError = string | null;
export type Id = string;
export type X = number;
export type Y = number;
export type Z = number;
export type Collisions = number;
export type Controller = "scripted_reference" | "manual" | "learned_policy";
export type Delivered = boolean;
export type ElapsedSeconds = number;
export type Kind2 = "info" | "success" | "warning";
export type Text = string;
export type Tick1 = number;
export type Events = TaskEvent[];
export type InvalidActions = number;
export type Mode1 = "reference_simulation";
export type Bearing = number;
export type Distance = number;
export type Holding = boolean;
export type LiftHeight = number;
export type Speed = number;
export type TargetForward = number;
export type TargetLeft = number;
export type YawSpeed = number;
export type Pickups = number;
export type Pots = SceneObject[];
export type Reason = string | null;
export type Heading = number;
export type Holding1 = boolean;
export type Id1 = "caretaker";
export type LeftWheelAngle = number;
export type LiftHeight1 = number;
export type RightWheelAngle = number;
export type X1 = number;
export type Y1 = number;
export type SimulatorVersion = string;
export type Stage = "approach" | "grasp" | "lift" | "deliver" | "lower" | "release" | "done" | "manual" | "learned";
export type Status = "ready" | "running" | "paused" | "complete" | "failed";
export type Id2 = string;
export type Walls = Obstacle[];
export type Seed = number;
export type SessionId1 = string;
export type Tick2 = number;
export type ApiVersion2 = "1";
export type Generation2 = number;
export type Kind3 = "heartbeat";
export type SessionId2 = string;
export type Tick3 = number;
export type Accepted = boolean;
export type ApiVersion3 = "1";
export type Command =
  "ping" | "start" | "pause" | "reset" | "new_seed" | "set_controller" | "manual" | "record" | "stop_recording";
export type Generation3 = number;
export type Kind4 = "ack";
export type Reason1 =
  | (
      | "stale_generation"
      | "session_mismatch"
      | "rate_limited"
      | "invalid_state"
      | "storage_error"
      | "incompatible_checkpoint"
    )
  | null;
export type RequestId = string;
export type SessionId3 = string;
export type Tick4 = number;
export type ApiVersion4 = "1";
export type Code = "invalid_message";
export type Generation4 = number;
export type Kind5 = "error";
export type Message = string;
export type SessionId4 = string;
export type Tick5 = number;

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
  checkpoint_id?: CheckpointId;
  controller_error?: ControllerError;
  generation: Generation1;
  kind: Kind1;
  last_episode_id?: LastEpisodeId;
  recording?: Recording;
  recording_error?: RecordingError;
  scene: Scene;
  seed: Seed;
  session_id: SessionId1;
  tick: Tick2;
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
  observation: ObservationData;
  pickups: Pickups;
  pots: Pots;
  reason: Reason;
  robot: Robot;
  simulator_version: SimulatorVersion;
  stage: Stage;
  status: Status;
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
  kind: Kind2;
  text: Text;
  tick: Tick1;
}
export interface ObservationData {
  bearing: Bearing;
  distance: Distance;
  holding: Holding;
  lift_height: LiftHeight;
  speed: Speed;
  target_forward: TargetForward;
  target_left: TargetLeft;
  yaw_speed: YawSpeed;
}
export interface Robot {
  heading: Heading;
  holding: Holding1;
  id: Id1;
  left_wheel_angle: LeftWheelAngle;
  lift_height: LiftHeight1;
  right_wheel_angle: RightWheelAngle;
  x: X1;
  y: Y1;
}
export interface Obstacle {
  half_size: Vector3;
  id: Id2;
  position: Vector3;
}
export interface Heartbeat {
  api_version: ApiVersion2;
  generation: Generation2;
  kind: Kind3;
  session_id: SessionId2;
  tick: Tick3;
}
export interface Ack {
  accepted: Accepted;
  api_version: ApiVersion3;
  command: Command;
  generation: Generation3;
  kind: Kind4;
  reason: Reason1;
  request_id: RequestId;
  session_id: SessionId3;
  tick: Tick4;
}
export interface StreamError {
  api_version: ApiVersion4;
  code?: Code;
  generation: Generation4;
  kind: Kind5;
  message: Message;
  session_id: SessionId4;
  tick: Tick5;
}
