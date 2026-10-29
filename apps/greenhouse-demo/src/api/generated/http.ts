/* Generated from greenhouse-server contracts. Run pnpm contracts:greenhouse. */

/**
 * @minItems 1
 * @maxItems 100
 */
export type Episodes = [Entry, ...Entry[]];
export type ActionVersion = "base-lift-grip-v1";
export type CapsuleRadius = number;
export type ControlDt = number;
export type GripperReach = number;
export type LiftLimits = number[];
export type MaxTicks = number;
export type MujocoVersion = string;
export type ObservationVersion = "relative-target-v1";
export type PhysicsDt = number;
export type SimulatorVersion = string;
export type Tray = number[];
export type TrayRadius = number;
export type WorldFingerprint = string;
export type CreatedAt = string;
export type EndReason = "terminal" | "stopped" | "reset" | "disconnected" | "closed";
export type EpisodeId = string;
/**
 * @minItems 3
 * @maxItems 3
 */
export type Capsule = [number, number, number];
export type Collisions = number;
export type Delivered = boolean;
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
export type Kind = "info" | "success" | "warning";
export type Text = string;
export type Tick = number;
export type Heading = number;
export type Holding = boolean;
export type InvalidActions = number;
export type LeftWheelAngle = number;
export type LiftHeight = number;
export type Pickups = number;
export type Reason = string | null;
export type RightWheelAngle = number;
export type Seed = number;
export type Speed = number;
export type Status = "ready" | "running" | "paused" | "complete" | "failed";
export type Tick1 = number;
export type Version = string;
export type X = number;
export type Y = number;
export type YawSpeed = number;
/**
 * @minItems 1
 * @maxItems 600
 */
export type Frames = [Frame, ...Frame[]];
export type Grip = "hold" | "close" | "open";
export type Lift = number;
export type Throttle = number;
export type Turn = number;
export type Controller = "scripted_reference" | "manual";
export type Intervention = boolean;
export type Bearing = number;
export type Distance = number;
export type Holding1 = boolean;
export type LiftHeight1 = number;
export type Speed1 = number;
export type TargetForward = number;
export type TargetLeft = number;
export type YawSpeed1 = number;
export type Reward = number;
export type SimulatedSeconds = number;
export type Stage = "approach" | "grasp" | "lift" | "deliver" | "lower" | "release" | "done" | "manual";
export type Terminated = boolean;
export type Tick2 = number;
export type Truncated = boolean;
export type WallSeconds = number;
export type Outcome = "success" | "failure" | "incomplete";
export type SchemaVersion = 1;
export type Seed1 = number;
export type Source = "scripted_expert" | "user" | "mixed";
export type Split = "train" | "validation" | "reserved_test" | "unassigned";
export type Excluded = boolean;
export type Label = "unreviewed" | "usable" | "needs_work";
export type Note = string;
export type Sha256 = string;
export type SchemaVersion1 = 1;
export type ApiVersion = "1";
export type Commands = string[];
export type HeartbeatHz = number;
export type LanguageMissions = boolean;
export type MaxSessions = number;
export type Mode = "reference_simulation";
export type Simulation = boolean;
export type SnapshotHz = number;
export type Training = boolean;
export type Seed2 = number;
export type ArtifactLocation = string;
export type EligibleTrain = number;
export type EpisodeId1 = string;
export type Interventions = number;
export type Outcome1 = "success" | "failure" | "incomplete";
export type Seconds = number;
export type Seed3 = number;
export type Sha2561 = string;
export type Source1 = "scripted_expert" | "user" | "mixed";
export type Split1 = "train" | "validation" | "reserved_test" | "unassigned";
export type Steps = number;
export type Episodes1 = EpisodeSummary[];
export type MaxEpisodes = number;
export type MaxImportBytes = number;
export type SchemaVersion2 = 1;
export type TotalSteps = number;
export type Id = string;
export type X1 = number;
export type Y1 = number;
export type Z = number;
export type Collisions1 = number;
export type Controller1 = "scripted_reference" | "manual";
export type Delivered1 = boolean;
export type ElapsedSeconds = number;
export type Kind1 = "info" | "success" | "warning";
export type Text1 = string;
export type Tick3 = number;
export type Events1 = TaskEvent[];
export type InvalidActions1 = number;
export type Mode1 = "reference_simulation";
export type Pickups1 = number;
export type Pots = SceneObject[];
export type Reason1 = string | null;
export type Heading1 = number;
export type Holding2 = boolean;
export type Id1 = "caretaker";
export type LeftWheelAngle1 = number;
export type LiftHeight2 = number;
export type RightWheelAngle1 = number;
export type X2 = number;
export type Y2 = number;
export type SimulatorVersion1 = string;
export type Stage1 = "approach" | "grasp" | "lift" | "deliver" | "lower" | "release" | "done" | "manual";
export type Status1 = "ready" | "running" | "paused" | "complete" | "failed";
export type Id2 = string;
export type Walls = Obstacle[];
/**
 * @minItems 1
 * @maxItems 100
 */
export type Seeds = [number, ...number[]];
export type ApiVersion1 = "1";
export type ServerVersion = string;
export type Status2 = "ok";
export type Duplicates = number;
export type Imported = number;
export type ApiVersion2 = "1";
export type Generation = number;
export type LastEpisodeId = string | null;
export type Recording = boolean;
export type RecordingError = string | null;
export type Seed4 = number;
export type SessionId = string;
export type Tick4 = number;
export type Checked = number;
export type EligibleTrainIds = string[];
export type Errors = string[];
export type ReadyForTraining = boolean;
export type Skipped = string[];

/**
 * Schema bundle for TypeScript generation; not a synthetic HTTP endpoint.
 */
export interface HttpModels {
  bundle: Bundle;
  capabilities: Capabilities;
  create_session: CreateSession;
  dataset: DatasetSummary;
  episode: EpisodeDetail;
  expert_request: ExpertRequest;
  health: Health;
  import_result: ImportResult;
  review: Review;
  session: SessionView;
  validation: ValidationReport;
}
export interface Bundle {
  episodes: Episodes;
  schema_version?: SchemaVersion1;
}
export interface Entry {
  episode: Episode;
  review: Review;
  sha256: Sha256;
}
export interface Episode {
  configuration: Configuration;
  created_at: CreatedAt;
  end_reason: EndReason;
  episode_id: EpisodeId;
  final_state: StateData;
  frames: Frames;
  initial_state: StateData;
  outcome: Outcome;
  schema_version?: SchemaVersion;
  seed: Seed1;
  source: Source;
  split: Split;
}
export interface Configuration {
  action_version?: ActionVersion;
  capsule_radius: CapsuleRadius;
  control_dt: ControlDt;
  gripper_reach: GripperReach;
  lift_limits: LiftLimits;
  max_ticks: MaxTicks;
  mujoco_version: MujocoVersion;
  observation_version?: ObservationVersion;
  physics_dt: PhysicsDt;
  simulator_version: SimulatorVersion;
  tray: Tray;
  tray_radius: TrayRadius;
  world_fingerprint: WorldFingerprint;
}
export interface StateData {
  capsule: Capsule;
  collisions: Collisions;
  delivered: Delivered;
  events: Events;
  heading: Heading;
  holding: Holding;
  invalid_actions: InvalidActions;
  left_wheel_angle: LeftWheelAngle;
  lift_height: LiftHeight;
  pickups: Pickups;
  reason: Reason;
  right_wheel_angle: RightWheelAngle;
  seed: Seed;
  speed: Speed;
  status: Status;
  tick: Tick1;
  version: Version;
  x: X;
  y: Y;
  yaw_speed: YawSpeed;
}
export interface EventData {
  kind: Kind;
  text: Text;
  tick: Tick;
}
export interface Frame {
  action: ActionData;
  controller: Controller;
  intervention: Intervention;
  next_observation: ObservationData;
  observation: ObservationData;
  reward: Reward;
  simulated_seconds: SimulatedSeconds;
  stage: Stage;
  state: StateData;
  terminated: Terminated;
  tick: Tick2;
  truncated: Truncated;
  wall_seconds: WallSeconds;
}
export interface ActionData {
  grip?: Grip;
  lift?: Lift;
  throttle?: Throttle;
  turn?: Turn;
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
export interface Review {
  excluded?: Excluded;
  label?: Label;
  note?: Note;
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
  seed?: Seed2;
}
export interface DatasetSummary {
  artifact_location: ArtifactLocation;
  eligible_train: EligibleTrain;
  episodes: Episodes1;
  max_episodes: MaxEpisodes;
  max_import_bytes: MaxImportBytes;
  schema_version?: SchemaVersion2;
  total_steps: TotalSteps;
}
export interface EpisodeSummary {
  episode_id: EpisodeId1;
  interventions: Interventions;
  outcome: Outcome1;
  review: Review;
  seconds: Seconds;
  seed: Seed3;
  sha256: Sha2561;
  source: Source1;
  split: Split1;
  steps: Steps;
}
export interface EpisodeDetail {
  entry: Entry;
  template: Scene;
}
export interface Scene {
  capsule: SceneObject;
  collisions: Collisions1;
  controller: Controller1;
  delivered: Delivered1;
  elapsed_seconds: ElapsedSeconds;
  events: Events1;
  invalid_actions: InvalidActions1;
  mode: Mode1;
  observation: ObservationData;
  pickups: Pickups1;
  pots: Pots;
  reason: Reason1;
  robot: Robot;
  simulator_version: SimulatorVersion1;
  stage: Stage1;
  status: Status1;
  tray: SceneObject;
  walls: Walls;
}
export interface SceneObject {
  id: Id;
  position: Vector3;
}
export interface Vector3 {
  x: X1;
  y: Y1;
  z: Z;
}
export interface TaskEvent {
  kind: Kind1;
  text: Text1;
  tick: Tick3;
}
export interface Robot {
  heading: Heading1;
  holding: Holding2;
  id: Id1;
  left_wheel_angle: LeftWheelAngle1;
  lift_height: LiftHeight2;
  right_wheel_angle: RightWheelAngle1;
  x: X2;
  y: Y2;
}
export interface Obstacle {
  half_size: Vector3;
  id: Id2;
  position: Vector3;
}
export interface ExpertRequest {
  seeds?: Seeds;
}
export interface Health {
  api_version?: ApiVersion1;
  server_version: ServerVersion;
  status?: Status2;
}
export interface ImportResult {
  duplicates: Duplicates;
  imported: Imported;
}
export interface SessionView {
  api_version?: ApiVersion2;
  generation: Generation;
  last_episode_id?: LastEpisodeId;
  recording?: Recording;
  recording_error?: RecordingError;
  scene: Scene;
  seed: Seed4;
  session_id: SessionId;
  tick: Tick4;
}
export interface ValidationReport {
  checked: Checked;
  eligible_train_ids: EligibleTrainIds;
  errors: Errors;
  ready_for_training: ReadyForTraining;
  skipped: Skipped;
}
