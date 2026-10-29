"""Typed plans, skill contracts and persisted task state; no provider or API dependencies."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from greenhouse.datasets.models import Model, StateData
from greenhouse.training.models import CheckpointId

MissionId = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]
MissionStatus = Literal["running", "paused", "completed", "failed", "cancelled", "orphaned"]
SkillName = Literal["align_target", "collect_deliver", "return_to_dock"]


class MissionIntent(Model):
    task: Literal["collect_and_dock", "return_to_dock", "unsupported"] = "collect_and_dock"
    capsule_count: Annotated[int, Field(ge=0, le=3)] = 3
    reason: Annotated[str, Field(max_length=240)] = ""

    @model_validator(mode="after")
    def consistent(self) -> "MissionIntent":
        if self.task == "collect_and_dock" and self.capsule_count < 1:
            raise ValueError("Collection requires one to three capsules.")
        if self.task == "return_to_dock" and self.capsule_count != 0:
            raise ValueError("Dock-only plans require zero capsules.")
        return self


class MissionRequest(Model):
    session_id: Annotated[str, Field(min_length=1, max_length=64)]
    generation: Annotated[int, Field(ge=0)]
    intent: MissionIntent = MissionIntent()
    controller: Literal["learned_policy", "scripted_reference"] = "learned_policy"
    checkpoint_id: CheckpointId | None = None

    @model_validator(mode="after")
    def selected(self) -> "MissionRequest":
        if self.intent.task == "unsupported":
            raise ValueError("This instruction is outside the supported mission tasks.")
        if (
            self.controller == "learned_policy"
            and self.intent.capsule_count
            and not self.checkpoint_id
        ):
            raise ValueError(
                "Select a learned checkpoint or explicitly choose scripted collection."
            )
        if self.controller == "scripted_reference" and self.checkpoint_id:
            raise ValueError("Scripted collection does not use a learned checkpoint.")
        return self


class MissionControl(Model):
    session_id: Annotated[str, Field(min_length=1, max_length=64)]
    generation: Annotated[int, Field(ge=0)]
    action: Literal["pause", "resume", "cancel"]


class InstructionRequest(Model):
    instruction: Annotated[str, Field(min_length=1, max_length=500)]


class LanguageStatus(Model):
    available: bool
    model: str | None
    message: str


class MissionDraft(Model):
    intent: MissionIntent
    source: Literal["langchain_tool"] = "langchain_tool"
    model: str
    message: str = "Review this supported plan, then start it explicitly."


class SkillContract(Model):
    name: SkillName
    implementation: str
    preconditions: list[str]
    completion: list[str]
    failures: list[str]
    max_ticks: int
    cancellation: str = "Pause physical steps; cancel ends the mission without resetting the robot."


class MissionTrace(Model):
    sequence: int
    node: Literal["observe", "select", "execute", "verify", "recover", "control"]
    skill: SkillName | None = None
    implementation: str | None = None
    tick: int
    message: str


class MissionCapsule(Model):
    id: str
    position: tuple[float, float, float]
    status: Literal["pending", "active", "delivered"]


class MissionView(Model):
    mission_id: MissionId
    request: MissionRequest
    state: MissionStatus
    created_at: str
    current_skill: SkillName | None = None
    implementation: str | None = None
    delivered: int = 0
    total: int
    docked: bool = False
    total_ticks: int = 0
    recoveries: int = 0
    max_recoveries: Literal[1] = 1
    collisions: int = 0
    invalid_actions: int = 0
    message: str
    trace: Annotated[list[MissionTrace], Field(max_length=96)] = []
    capsules: list[MissionCapsule]
    last_world: StateData
    checkpoint_sha256: str | None = None


class MissionCatalog(Model):
    missions: list[MissionView]
    skills: list[SkillContract]
    language: LanguageStatus
    artifact_location: str


class GraphCheckpoint(Model):
    mission_id: MissionId
    checkpoint_id: str | None
    next_nodes: list[str]
    task_state: MissionView | None
    message: str = (
        "Graph task checkpoint; physical sessions remain ephemeral "
        "and are never replayed automatically."
    )
