"""Immutable episode payloads; quality reviews are separate mutable sidecars."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

EpisodeId = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]
Source = Literal["scripted_expert", "user", "mixed"]
Controller = Literal["scripted_reference", "manual"]
Split = Literal["train", "validation", "reserved_test", "unassigned"]
Stage = Literal["approach", "grasp", "lift", "deliver", "lower", "release", "done", "manual"]
Axis = Annotated[FiniteFloat, Field(ge=-1, le=1)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class ActionData(Model):
    throttle: Axis = 0.0
    turn: Axis = 0.0
    lift: Axis = 0.0
    grip: Literal["hold", "close", "open"] = "hold"


class ObservationData(Model):
    target_forward: FiniteFloat
    target_left: FiniteFloat
    distance: FiniteFloat
    bearing: FiniteFloat
    speed: FiniteFloat
    yaw_speed: FiniteFloat
    lift_height: FiniteFloat
    holding: bool


class EventData(Model):
    tick: Annotated[int, Field(ge=0, le=600)]
    kind: Literal["info", "success", "warning"]
    text: Annotated[str, Field(max_length=300)]


class StateData(Model):
    version: str
    seed: Annotated[int, Field(ge=0, le=2_147_483_647)]
    tick: Annotated[int, Field(ge=0, le=600)]
    status: Literal["ready", "running", "paused", "complete", "failed"]
    x: FiniteFloat
    y: FiniteFloat
    heading: FiniteFloat
    speed: FiniteFloat
    yaw_speed: FiniteFloat
    lift_height: FiniteFloat
    left_wheel_angle: FiniteFloat
    right_wheel_angle: FiniteFloat
    holding: bool
    capsule: Annotated[list[FiniteFloat], Field(min_length=3, max_length=3)]
    delivered: bool
    pickups: Annotated[int, Field(ge=0)]
    collisions: Annotated[int, Field(ge=0)]
    invalid_actions: Annotated[int, Field(ge=0)]
    reason: str | None
    events: Annotated[list[EventData], Field(max_length=16)]


class Configuration(Model):
    simulator_version: str
    world_fingerprint: str
    mujoco_version: str
    observation_version: Literal["relative-target-v1"] = "relative-target-v1"
    action_version: Literal["base-lift-grip-v1"] = "base-lift-grip-v1"
    control_dt: FiniteFloat
    physics_dt: FiniteFloat
    max_ticks: int
    gripper_reach: FiniteFloat
    capsule_radius: FiniteFloat
    lift_limits: list[FiniteFloat]
    tray: list[FiniteFloat]
    tray_radius: FiniteFloat


class Frame(Model):
    tick: Annotated[int, Field(ge=1, le=600)]
    simulated_seconds: FiniteFloat
    wall_seconds: Annotated[FiniteFloat, Field(ge=0)]
    controller: Controller
    intervention: bool
    stage: Stage
    observation: ObservationData
    action: ActionData
    next_observation: ObservationData
    state: StateData
    reward: FiniteFloat
    terminated: bool
    truncated: bool


class Episode(Model):
    schema_version: Literal[1] = 1
    episode_id: EpisodeId
    created_at: Annotated[str, Field(max_length=40)]
    seed: Annotated[int, Field(ge=0, le=2_147_483_647)]
    split: Split
    source: Source
    configuration: Configuration
    initial_state: StateData
    frames: Annotated[list[Frame], Field(min_length=1, max_length=600)]
    final_state: StateData
    outcome: Literal["success", "failure", "incomplete"]
    end_reason: Literal["terminal", "stopped", "reset", "disconnected", "closed"]


class Review(Model):
    label: Literal["unreviewed", "usable", "needs_work"] = "unreviewed"
    excluded: bool = True
    note: Annotated[str, Field(max_length=500)] = ""


class EpisodeSummary(Model):
    episode_id: EpisodeId
    seed: int
    split: Split
    source: Source
    outcome: Literal["success", "failure", "incomplete"]
    steps: int
    seconds: float
    interventions: int
    sha256: str
    review: Review


class DatasetSummary(Model):
    schema_version: Literal[1] = 1
    episodes: list[EpisodeSummary]
    total_steps: int
    eligible_train: int
    artifact_location: str
    max_import_bytes: int
    max_episodes: int


class ExpertRequest(Model):
    seeds: Annotated[
        list[Annotated[int, Field(ge=0, le=99)]], Field(min_length=1, max_length=100)
    ] = list(range(20))


class Entry(Model):
    episode: Episode
    sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    review: Review


class Bundle(Model):
    schema_version: Literal[1] = 1
    episodes: Annotated[list[Entry], Field(min_length=1, max_length=100)]


class ImportResult(Model):
    imported: int
    duplicates: int


class ValidationReport(Model):
    checked: int
    ready_for_training: bool
    eligible_train_ids: list[EpisodeId]
    skipped: list[str]
    errors: list[str]
