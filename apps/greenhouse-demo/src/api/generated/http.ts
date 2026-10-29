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
export type CheckpointId = string | null;
export type Label1 = string;
export type CleanSuccess = boolean;
export type Collisions1 = number;
export type Failure = "none" | "collision" | "pickup_not_completed" | "invalid_grasp_or_release" | "delivery_timeout";
/**
 * @maxItems 600
 */
export type Frames1 = PolicyFrame[];
export type InvalidActions1 = number;
export type Seconds = number;
export type Seed2 = number;
export type Success = boolean;
export type Ticks = number;
export type Entries = ComparedRollout[];
export type Seed3 = number;
export type Id = string;
export type X1 = number;
export type Y1 = number;
export type Z = number;
export type Collisions2 = number;
export type Controller1 = "scripted_reference" | "manual" | "learned_policy";
export type Delivered1 = boolean;
export type ElapsedSeconds = number;
export type Kind1 = "info" | "success" | "warning";
export type Text1 = string;
export type Tick3 = number;
export type Events1 = TaskEvent[];
export type InvalidActions2 = number;
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
export type Stage1 = "approach" | "grasp" | "lift" | "deliver" | "lower" | "release" | "done" | "manual" | "learned";
export type Status1 = "ready" | "running" | "paused" | "complete" | "failed";
export type Id2 = string;
export type Walls = Obstacle[];
/**
 * @minItems 2
 * @maxItems 2
 */
export type CheckpointIds = [string, string];
export type Seed4 = number;
export type Seed5 = number;
export type ArtifactLocation = string;
export type EligibleTrain = number;
export type EpisodeId1 = string;
export type Interventions = number;
export type Outcome1 = "success" | "failure" | "incomplete";
export type Seconds1 = number;
export type Seed6 = number;
export type Sha2561 = string;
export type Source1 = "scripted_expert" | "user" | "mixed";
export type Split1 = "train" | "validation" | "reserved_test" | "unassigned";
export type Steps = number;
export type Episodes1 = EpisodeSummary[];
export type MaxEpisodes = number;
export type MaxImportBytes = number;
export type SchemaVersion2 = 1;
export type TotalSteps = number;
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
export type Algorithm = "bc" | "ppo";
export type Architecture = string;
export type CheckpointId1 = string;
export type Compatible = boolean;
export type CorrectionSamples = number;
export type CorrectionSeeds = number[];
export type CorrectionSha256 = string[];
export type DatasetSha256 = string;
export type EpisodeIds = string[];
export type EpisodeSha256 = string[];
export type CleanSuccesses = number;
export type Collisions3 = number;
export type FinalTestEvaluated = false;
export type InvalidActions3 = number;
export type MeanSeconds = number;
export type Successes = number;
export type Total = number;
export type Features = string[];
export type FittingLoss = number;
export type JobId = string;
export type ParentCheckpoint = string | null;
export type PolicyVersion = string;
export type PracticeSteps = number;
export type RewardVersion = string | null;
export type Round = number;
export type TorchVersion = string;
export type TrainingSamples = number;
export type TrainingSha256 = string;
export type WeightsSha256 = string;
/**
 * @maxItems 30
 */
export type Episodes2 = Rollout[];
export type Seeds1 = number[];
export type ApiVersion2 = "1";
export type CheckpointId2 = string | null;
export type ControllerError = string | null;
export type Generation = number;
export type LastEpisodeId = string | null;
export type Recording = boolean;
export type RecordingError = string | null;
export type Seed7 = number;
export type SessionId = string;
export type Tick4 = number;
export type ActiveJob = string | null;
export type ArtifactLocation1 = string;
export type Checkpoints = CheckpointInfo[];
export type CancelRequested = boolean;
export type Checkpoints1 = string[];
export type CreatedAt1 = string;
export type ElapsedSeconds1 = number;
export type Epoch = number;
export type FittingLoss1 = number | null;
export type Epoch1 = number;
export type Loss = number;
export type Round1 = number;
/**
 * @maxItems 160
 */
export type History = FitPoint[];
export type JobId1 = string;
export type Message = string;
export type PeakWorkerRssMb = number;
export type Phase = "snapshot" | "fitting" | "evaluating" | "corrections" | "practicing" | "finished";
export type ApproximateKl = number;
export type ClipFraction = number;
export type CompletedEpisodes = number;
export type Deliveries = number;
export type Entropy = number;
export type PolicyLoss = number;
export type Stage2 = string;
export type Steps1 = number;
export type ValueLoss = number;
/**
 * @maxItems 96
 */
export type PracticeHistory = PracticePoint[];
export type PracticeSteps1 = number;
export type Algorithm1 = "bc" | "ppo";
export type BudgetSeconds = number;
export type CorrectionRounds = number;
export type EpisodeIds1 = string[] | null;
export type Epochs = number;
export type ParentCheckpoint1 = string | null;
export type PpoSteps = number;
export type RandomSeed = number;
export type Round2 = number;
export type SelectedCheckpoint = string | null;
export type State = "preparing" | "running" | "completed" | "cancelled" | "failed";
export type Jobs = Job[];
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
  comparison_detail: ComparisonDetail;
  comparison_request: ComparisonRequest;
  create_session: CreateSession;
  dataset: DatasetSummary;
  episode: EpisodeDetail;
  expert_request: ExpertRequest;
  health: Health;
  import_result: ImportResult;
  policy_detail: PolicyDetail;
  review: Review;
  session: SessionView;
  training_catalog: TrainingCatalog;
  training_job: Job;
  training_request: TrainRequest;
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
export interface ComparisonDetail {
  entries: Entries;
  seed: Seed3;
  template: Scene;
}
export interface ComparedRollout {
  checkpoint_id: CheckpointId;
  label: Label1;
  rollout: Rollout;
}
export interface Rollout {
  clean_success: CleanSuccess;
  collisions: Collisions1;
  failure: Failure;
  final?: StateData | null;
  frames?: Frames1;
  initial?: StateData | null;
  invalid_actions: InvalidActions1;
  seconds: Seconds;
  seed: Seed2;
  success: Success;
  ticks: Ticks;
}
export interface PolicyFrame {
  action: ActionData;
  state: StateData;
}
export interface Scene {
  capsule: SceneObject;
  collisions: Collisions2;
  controller: Controller1;
  delivered: Delivered1;
  elapsed_seconds: ElapsedSeconds;
  events: Events1;
  invalid_actions: InvalidActions2;
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
export interface ComparisonRequest {
  checkpoint_ids: CheckpointIds;
  seed?: Seed4;
}
export interface CreateSession {
  seed?: Seed5;
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
  seconds: Seconds1;
  seed: Seed6;
  sha256: Sha2561;
  source: Source1;
  split: Split1;
  steps: Steps;
}
export interface EpisodeDetail {
  entry: Entry;
  template: Scene;
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
export interface PolicyDetail {
  checkpoint: CheckpointInfo;
  evaluation: Evaluation;
  template: Scene;
}
export interface CheckpointInfo {
  algorithm?: Algorithm;
  architecture: Architecture;
  checkpoint_id: CheckpointId1;
  compatible?: Compatible;
  configuration: Configuration;
  correction_samples: CorrectionSamples;
  correction_seeds: CorrectionSeeds;
  correction_sha256: CorrectionSha256;
  dataset_sha256: DatasetSha256;
  episode_ids: EpisodeIds;
  episode_sha256: EpisodeSha256;
  evaluation: EvaluationSummary;
  features: Features;
  fitting_loss: FittingLoss;
  job_id: JobId;
  parent_checkpoint?: ParentCheckpoint;
  policy_version: PolicyVersion;
  practice_steps?: PracticeSteps;
  reference: EvaluationSummary;
  reward_version?: RewardVersion;
  round: Round;
  torch_version: TorchVersion;
  training_samples: TrainingSamples;
  training_sha256: TrainingSha256;
  weights_sha256: WeightsSha256;
}
export interface EvaluationSummary {
  clean_successes: CleanSuccesses;
  collisions: Collisions3;
  failure_counts: FailureCounts;
  final_test_evaluated?: FinalTestEvaluated;
  invalid_actions: InvalidActions3;
  mean_seconds: MeanSeconds;
  successes: Successes;
  total?: Total;
}
export interface FailureCounts {
  [k: string]: number;
}
export interface Evaluation {
  episodes: Episodes2;
  seeds: Seeds1;
  summary: EvaluationSummary;
}
export interface SessionView {
  api_version?: ApiVersion2;
  checkpoint_id?: CheckpointId2;
  controller_error?: ControllerError;
  generation: Generation;
  last_episode_id?: LastEpisodeId;
  recording?: Recording;
  recording_error?: RecordingError;
  scene: Scene;
  seed: Seed7;
  session_id: SessionId;
  tick: Tick4;
}
export interface TrainingCatalog {
  active_job: ActiveJob;
  artifact_location: ArtifactLocation1;
  checkpoints: Checkpoints;
  jobs: Jobs;
}
export interface Job {
  cancel_requested?: CancelRequested;
  checkpoints?: Checkpoints1;
  created_at: CreatedAt1;
  elapsed_seconds?: ElapsedSeconds1;
  epoch?: Epoch;
  fitting_loss?: FittingLoss1;
  history?: History;
  job_id: JobId1;
  message: Message;
  peak_worker_rss_mb?: PeakWorkerRssMb;
  phase: Phase;
  practice_history?: PracticeHistory;
  practice_steps?: PracticeSteps1;
  request: TrainRequest;
  round?: Round2;
  selected_checkpoint?: SelectedCheckpoint;
  state: State;
}
export interface FitPoint {
  epoch: Epoch1;
  loss: Loss;
  round: Round1;
}
export interface PracticePoint {
  approximate_kl: ApproximateKl;
  clip_fraction: ClipFraction;
  completed_episodes: CompletedEpisodes;
  deliveries: Deliveries;
  entropy: Entropy;
  policy_loss: PolicyLoss;
  reward_components: RewardComponents;
  stage: Stage2;
  steps: Steps1;
  value_loss: ValueLoss;
}
export interface RewardComponents {
  [k: string]: number;
}
export interface TrainRequest {
  algorithm?: Algorithm1;
  budget_seconds?: BudgetSeconds;
  correction_rounds?: CorrectionRounds;
  episode_ids?: EpisodeIds1;
  epochs?: Epochs;
  parent_checkpoint?: ParentCheckpoint1;
  ppo_steps?: PpoSteps;
  random_seed?: RandomSeed;
}
export interface ValidationReport {
  checked: Checked;
  eligible_train_ids: EligibleTrainIds;
  errors: Errors;
  ready_for_training: ReadyForTraining;
  skipped: Skipped;
}
