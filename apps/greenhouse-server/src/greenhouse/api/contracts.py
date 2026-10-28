"""HTTP models and separately exported, discriminated WebSocket envelopes."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, TypeAdapter

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
    mode: Literal["foundation_preview"] = "foundation_preview"
    simulation: bool = False
    training: bool = False
    language_missions: bool = False
    heartbeat_hz: int = 1
    max_sessions: int = 16
    commands: list[Literal["ping", "reset_preview"]] = ["ping", "reset_preview"]


class Robot(Contract):
    id: Literal["caretaker"]
    x: FiniteFloat
    y: FiniteFloat
    heading: FiniteFloat
    holding: bool


class Vector3(Contract):
    x: FiniteFloat
    y: FiniteFloat
    z: FiniteFloat


class SceneObject(Contract):
    id: str
    position: Vector3


class Scene(Contract):
    mode: Literal["foundation_preview"]
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


class Envelope(Contract):
    api_version: Literal["1"]
    session_id: str
    generation: Count


class HttpModels(Contract):
    """Schema bundle for TypeScript generation; not a synthetic HTTP endpoint."""

    health: Health
    capabilities: Capabilities
    create_session: CreateSession
    session: SessionView


class Ping(Envelope):
    kind: Literal["ping"]
    request_id: RequestId


class ResetPreview(Envelope):
    kind: Literal["reset_preview"]
    request_id: RequestId
    seed: Seed


ClientMessage = Annotated[Ping | ResetPreview, Field(discriminator="kind")]
client_adapter = TypeAdapter[ClientMessage](ClientMessage)


class ServerEnvelope(Envelope):
    tick: Count


class Hello(ServerEnvelope):
    kind: Literal["hello"]
    mode: Literal["foundation_preview"] = "foundation_preview"


class Snapshot(ServerEnvelope):
    kind: Literal["snapshot"]
    seed: Seed
    scene: Scene


class Heartbeat(ServerEnvelope):
    kind: Literal["heartbeat"]


Rejection = Literal["stale_generation", "session_mismatch", "rate_limited"]


class Ack(ServerEnvelope):
    kind: Literal["ack"]
    request_id: RequestId
    command: Literal["ping", "reset_preview"]
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
