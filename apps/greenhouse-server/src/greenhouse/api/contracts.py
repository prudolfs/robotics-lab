"""HTTP models and separately exported, discriminated WebSocket envelopes."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, TypeAdapter

from greenhouse.datasets.models import (
    ActionData,
    Bundle,
    Controller,
    DatasetSummary,
    Entry,
    ExpertRequest,
    ImportResult,
    ObservationData,
    Review,
    ValidationReport,
)

API_VERSION = "1"
Seed = Annotated[int, Field(ge=0, le=2_147_483_647)]
Count = Annotated[int, Field(ge=0)]
RequestId = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Health(Contract):
    status: Literal["ok"] = "ok"
    api_version: Literal["1"] = "1"
    server_version: str


class Capabilities(Contract):
    api_version: Literal["1"] = "1"
    mode: Literal["reference_simulation"] = "reference_simulation"
    simulation: bool = True
    training: bool = False
    language_missions: bool = False
    heartbeat_hz: int = 1
    max_sessions: int = 16
    snapshot_hz: int = 10
    commands: list[str] = [
        "ping",
        "start",
        "pause",
        "reset",
        "new_seed",
        "set_controller",
        "manual",
        "record",
        "stop_recording",
    ]


class Robot(Contract):
    id: Literal["caretaker"]
    x: FiniteFloat
    y: FiniteFloat
    heading: FiniteFloat
    holding: bool
    lift_height: FiniteFloat
    left_wheel_angle: FiniteFloat
    right_wheel_angle: FiniteFloat


class Vector3(Contract):
    x: FiniteFloat
    y: FiniteFloat
    z: FiniteFloat


class SceneObject(Contract):
    id: str
    position: Vector3


class Obstacle(Contract):
    id: str
    position: Vector3
    half_size: Vector3


class TaskEvent(Contract):
    tick: Count
    kind: Literal["info", "success", "warning"]
    text: str


class Scene(Contract):
    mode: Literal["reference_simulation"]
    simulator_version: str
    controller: Controller
    status: Literal["ready", "running", "paused", "complete", "failed"]
    stage: Literal["approach", "grasp", "lift", "deliver", "lower", "release", "done", "manual"]
    elapsed_seconds: FiniteFloat
    delivered: bool
    pickups: Count
    collisions: Count
    invalid_actions: Count
    reason: str | None
    events: list[TaskEvent]
    walls: list[Obstacle]
    pots: list[SceneObject]
    observation: ObservationData
    robot: Robot
    capsule: SceneObject
    tray: SceneObject


class CreateSession(Contract):
    seed: Seed = 42


class SessionView(Contract):
    api_version: Literal["1"] = "1"
    session_id: str
    generation: Count
    tick: Count
    seed: Seed
    scene: Scene
    recording: bool = False
    last_episode_id: str | None = None
    recording_error: str | None = None


class Envelope(Contract):
    api_version: Literal["1"]
    session_id: str
    generation: Count


class EpisodeDetail(Contract):
    entry: Entry
    template: Scene


class HttpModels(Contract):
    """Schema bundle for TypeScript generation; not a synthetic HTTP endpoint."""

    health: Health
    capabilities: Capabilities
    create_session: CreateSession
    session: SessionView
    dataset: DatasetSummary
    episode: EpisodeDetail
    bundle: Bundle
    review: Review
    expert_request: ExpertRequest
    import_result: ImportResult
    validation: ValidationReport


class Ping(Envelope):
    kind: Literal["ping"]
    request_id: RequestId


class Reset(Envelope):
    kind: Literal["reset"]
    request_id: RequestId


class Control(Envelope):
    kind: Literal["start", "pause", "new_seed", "record", "stop_recording"]
    request_id: RequestId


class SetController(Envelope):
    kind: Literal["set_controller"]
    request_id: RequestId
    controller: Controller


class Manual(Envelope):
    kind: Literal["manual"]
    request_id: RequestId
    action: ActionData


ClientMessage = Annotated[
    Ping | Reset | Control | SetController | Manual, Field(discriminator="kind")
]
client_adapter = TypeAdapter[ClientMessage](ClientMessage)


class ServerEnvelope(Envelope):
    tick: Count


class Hello(ServerEnvelope):
    kind: Literal["hello"]
    mode: Literal["reference_simulation"] = "reference_simulation"


class Snapshot(ServerEnvelope):
    kind: Literal["snapshot"]
    seed: Seed
    scene: Scene
    recording: bool = False
    last_episode_id: str | None = None
    recording_error: str | None = None


class Heartbeat(ServerEnvelope):
    kind: Literal["heartbeat"]


Rejection = Literal[
    "stale_generation", "session_mismatch", "rate_limited", "invalid_state", "storage_error"
]


class Ack(ServerEnvelope):
    kind: Literal["ack"]
    request_id: RequestId
    command: Literal[
        "ping",
        "start",
        "pause",
        "reset",
        "new_seed",
        "set_controller",
        "manual",
        "record",
        "stop_recording",
    ]
    accepted: bool
    reason: Rejection | None


class StreamError(ServerEnvelope):
    kind: Literal["error"]
    code: Literal["invalid_message"] = "invalid_message"
    message: str


ServerMessage = Annotated[
    Hello | Snapshot | Heartbeat | Ack | StreamError, Field(discriminator="kind")
]
server_adapter = TypeAdapter[ServerMessage](ServerMessage)
