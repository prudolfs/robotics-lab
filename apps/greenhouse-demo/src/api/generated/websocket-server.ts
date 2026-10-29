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
export type Id = string;
/**
 * @minItems 3
 * @maxItems 3
 */
export type Position = [unknown, unknown, unknown];
export type Status = "pending" | "active" | "delivered";
export type Capsules = MissionCapsule[];
export type CheckpointSha256 = string | null;
export type Collisions = number;
export type CreatedAt = string;
export type CurrentSkill = ("align_target" | "collect_deliver" | "return_to_dock") | null;
export type Delivered = number;
export type Docked = boolean;
export type Implementation = string | null;
export type InvalidActions = number;
/**
 * @minItems 3
 * @maxItems 3
 */
export type Capsule = [number, number, number];
export type Collisions1 = number;
export type Delivered1 = boolean;
/**
 * @maxItems 16
 */
export type Events =
  | []
  | [EventData]
  | [EventData, EventData]
  | [EventData, EventData, EventData]
  | [EventData, EventData, EventData, EventData]
  | [EventData, EventData, EventData, EventData, EventData]
  | [EventData, EventData, EventData, EventData, EventData, EventData]
  | [EventData, EventData, EventData, EventData, EventData, EventData, EventData]
  | [EventData, EventData, EventData, EventData, EventData, EventData, EventData, EventData]
  | [EventData, EventData, EventData, EventData, EventData, EventData, EventData, EventData, EventData]
  | [EventData, EventData, EventData, EventData, EventData, EventData, EventData, EventData, EventData, EventData]
  | [
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData
    ]
  | [
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData
    ]
  | [
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData
    ]
  | [
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData
    ]
  | [
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData
    ]
  | [
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData,
      EventData
    ];
export type Kind2 = "info" | "success" | "warning";
export type Text = string;
export type Tick1 = number;
export type Heading = number;
export type Holding = boolean;
export type InvalidActions1 = number;
export type LeftWheelAngle = number;
export type LiftHeight = number;
export type Pickups = number;
export type Reason = string | null;
export type RightWheelAngle = number;
export type Seed = number;
export type Speed = number;
export type Status1 = "ready" | "running" | "paused" | "complete" | "failed";
export type Tick2 = number;
export type Version = string;
export type X = number;
export type Y = number;
export type YawSpeed = number;
export type MaxRecoveries = 1;
export type Message = string;
export type MissionId = string;
export type Recoveries = number;
export type CheckpointId1 = string | null;
export type Controller = "learned_policy" | "scripted_reference";
export type Generation2 = number;
export type CapsuleCount = number;
export type Reason1 = string;
export type Task = "collect_and_dock" | "return_to_dock" | "unsupported";
export type SessionId1 = string;
export type State = "running" | "paused" | "completed" | "failed" | "cancelled" | "orphaned";
export type Total = number;
export type TotalTicks = number;
export type Implementation1 = string | null;
export type Message1 = string;
export type Node = "observe" | "select" | "execute" | "verify" | "recover" | "control";
export type Sequence = number;
export type Skill = ("align_target" | "collect_deliver" | "return_to_dock") | null;
export type Tick3 = number;
/**
 * @maxItems 96
 */
export type Trace = MissionTrace[];
export type Recording = boolean;
export type RecordingError = string | null;
export type Id1 = string;
export type X1 = number;
export type Y1 = number;
export type Z = number;
export type AdditionalCapsules = SceneObject[];
export type Collisions2 = number;
export type Controller1 = "scripted_reference" | "manual" | "learned_policy";
export type Delivered2 = boolean;
export type ElapsedSeconds = number;
export type Kind3 = "info" | "success" | "warning";
export type Text1 = string;
export type Tick4 = number;
export type Events1 = TaskEvent[];
export type InvalidActions2 = number;
export type Mode1 = "reference_simulation";
export type Bearing = number;
export type Distance = number;
export type Holding1 = boolean;
export type LiftHeight1 = number;
export type Speed1 = number;
export type TargetForward = number;
export type TargetLeft = number;
export type YawSpeed1 = number;
export type Pickups1 = number;
export type Pots = SceneObject[];
export type Reason2 = string | null;
export type Heading1 = number;
export type Holding2 = boolean;
export type Id2 = "caretaker";
export type LeftWheelAngle1 = number;
export type LiftHeight2 = number;
export type RightWheelAngle1 = number;
export type X2 = number;
export type Y2 = number;
export type SimulatorVersion = string;
export type Stage =
  | "approach"
  | "grasp"
  | "lift"
  | "deliver"
  | "lower"
  | "release"
  | "done"
  | "manual"
  | "learned"
  | "docking"
  | "aligning";
export type Status2 = "ready" | "running" | "paused" | "complete" | "failed";
export type Id3 = string;
export type Walls = Obstacle[];
export type Seed1 = number;
export type SessionId2 = string;
export type Tick5 = number;
export type ApiVersion2 = "1";
export type Generation3 = number;
export type Kind4 = "heartbeat";
export type SessionId3 = string;
export type Tick6 = number;
export type Accepted = boolean;
export type ApiVersion3 = "1";
export type Command =
  "ping" | "start" | "pause" | "reset" | "new_seed" | "set_controller" | "manual" | "record" | "stop_recording";
export type Generation4 = number;
export type Kind5 = "ack";
export type Reason3 =
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
export type SessionId4 = string;
export type Tick7 = number;
export type ApiVersion4 = "1";
export type Code = "invalid_message";
export type Generation5 = number;
export type Kind6 = "error";
export type Message2 = string;
export type SessionId5 = string;
export type Tick8 = number;

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
  mission?: MissionView | null;
  recording?: Recording;
  recording_error?: RecordingError;
  scene: Scene;
  seed: Seed1;
  session_id: SessionId2;
  tick: Tick5;
}
export interface MissionView {
  capsules: Capsules;
  checkpoint_sha256?: CheckpointSha256;
  collisions?: Collisions;
  created_at: CreatedAt;
  current_skill?: CurrentSkill;
  delivered?: Delivered;
  docked?: Docked;
  implementation?: Implementation;
  invalid_actions?: InvalidActions;
  last_world: StateData;
  max_recoveries?: MaxRecoveries;
  message: Message;
  mission_id: MissionId;
  recoveries?: Recoveries;
  request: MissionRequest;
  state: State;
  total: Total;
  total_ticks?: TotalTicks;
  trace?: Trace;
}
export interface MissionCapsule {
  id: Id;
  position: Position;
  status: Status;
}
export interface StateData {
  capsule: Capsule;
  collisions: Collisions1;
  delivered: Delivered1;
  events: Events;
  heading: Heading;
  holding: Holding;
  invalid_actions: InvalidActions1;
  left_wheel_angle: LeftWheelAngle;
  lift_height: LiftHeight;
  pickups: Pickups;
  reason: Reason;
  right_wheel_angle: RightWheelAngle;
  seed: Seed;
  speed: Speed;
  status: Status1;
  tick: Tick2;
  version: Version;
  x: X;
  y: Y;
  yaw_speed: YawSpeed;
}
export interface EventData {
  kind: Kind2;
  text: Text;
  tick: Tick1;
}
export interface MissionRequest {
  checkpoint_id?: CheckpointId1;
  controller?: Controller;
  generation: Generation2;
  intent?: MissionIntent;
  session_id: SessionId1;
}
export interface MissionIntent {
  capsule_count?: CapsuleCount;
  reason?: Reason1;
  task?: Task;
}
export interface MissionTrace {
  implementation?: Implementation1;
  message: Message1;
  node: Node;
  sequence: Sequence;
  skill?: Skill;
  tick: Tick3;
}
export interface Scene {
  additional_capsules?: AdditionalCapsules;
  capsule: SceneObject;
  collisions: Collisions2;
  controller: Controller1;
  delivered: Delivered2;
  elapsed_seconds: ElapsedSeconds;
  events: Events1;
  invalid_actions: InvalidActions2;
  mode: Mode1;
  observation: ObservationData;
  pickups: Pickups1;
  pots: Pots;
  reason: Reason2;
  robot: Robot;
  simulator_version: SimulatorVersion;
  stage: Stage;
  status: Status2;
  tray: SceneObject;
  walls: Walls;
}
export interface SceneObject {
  id: Id1;
  position: Vector3;
}
export interface Vector3 {
  x: X1;
  y: Y1;
  z: Z;
}
export interface TaskEvent {
  kind: Kind3;
  text: Text1;
  tick: Tick4;
}
export interface ObservationData {
  bearing: Bearing;
  distance: Distance;
  holding: Holding1;
  lift_height: LiftHeight1;
  speed: Speed1;
  target_forward: TargetForward;
  target_left: TargetLeft;
  yaw_speed: YawSpeed1;
}
export interface Robot {
  heading: Heading1;
  holding: Holding2;
  id: Id2;
  left_wheel_angle: LeftWheelAngle1;
  lift_height: LiftHeight2;
  right_wheel_angle: RightWheelAngle1;
  x: X2;
  y: Y2;
}
export interface Obstacle {
  half_size: Vector3;
  id: Id3;
  position: Vector3;
}
export interface Heartbeat {
  api_version: ApiVersion2;
  generation: Generation3;
  kind: Kind4;
  session_id: SessionId3;
  tick: Tick6;
}
export interface Ack {
  accepted: Accepted;
  api_version: ApiVersion3;
  command: Command;
  generation: Generation4;
  kind: Kind5;
  reason: Reason3;
  request_id: RequestId;
  session_id: SessionId4;
  tick: Tick7;
}
export interface StreamError {
  api_version: ApiVersion4;
  code?: Code;
  generation: Generation5;
  kind: Kind6;
  message: Message2;
  session_id: SessionId5;
  tick: Tick8;
}
