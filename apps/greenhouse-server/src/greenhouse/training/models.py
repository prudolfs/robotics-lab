"""Persisted job/checkpoint contracts, independent of the browser and API."""

from typing import Annotated, Literal

from pydantic import Field

from greenhouse.datasets.models import ActionData, Configuration, Model, StateData

Failure = Literal[
    "none", "collision", "pickup_not_completed", "invalid_grasp_or_release", "delivery_timeout"
]

ArtifactId = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]
CheckpointId = Annotated[str, Field(pattern=r"^[a-f0-9]{32}-r[0-3]$")]


class TrainRequest(Model):
    algorithm: Literal["bc", "ppo"] = "bc"
    parent_checkpoint: CheckpointId | None = None
    ppo_steps: Annotated[int, Field(ge=3072, le=98304, multiple_of=3072)] = 36864
    epochs: Annotated[int, Field(ge=10, le=300)] = 120
    correction_rounds: Annotated[int, Field(ge=0, le=3)] = 3
    random_seed: Annotated[int, Field(ge=0, le=2_147_483_647)] = 7
    budget_seconds: Annotated[int, Field(ge=10, le=600)] = 180
    episode_ids: Annotated[list[ArtifactId] | None, Field(max_length=100)] = None


class PolicyFrame(Model):
    state: StateData
    action: ActionData


class Rollout(Model):
    seed: int
    success: bool
    clean_success: bool
    ticks: int
    seconds: float
    collisions: int
    invalid_actions: int
    failure: Failure
    initial: StateData | None = None
    frames: Annotated[list[PolicyFrame], Field(max_length=600)] = []
    final: StateData | None = None


class EvaluationSummary(Model):
    successes: int
    clean_successes: int
    total: int = 30
    collisions: int
    invalid_actions: int
    mean_seconds: float
    failure_counts: dict[str, int]
    final_test_evaluated: Literal[False] = False


class Evaluation(Model):
    seeds: list[int]
    summary: EvaluationSummary
    episodes: Annotated[list[Rollout], Field(max_length=30)]


class FitPoint(Model):
    round: int
    epoch: int
    loss: float


class PracticePoint(Model):
    steps: int
    stage: str
    policy_loss: float
    value_loss: float
    entropy: float
    approximate_kl: float
    clip_fraction: float
    reward_components: dict[str, float]
    completed_episodes: int
    deliveries: int


class CheckpointInfo(Model):
    algorithm: Literal["bc", "ppo"] = "bc"
    parent_checkpoint: CheckpointId | None = None
    practice_steps: int = 0
    reward_version: str | None = None
    checkpoint_id: CheckpointId
    job_id: ArtifactId
    round: int
    policy_version: str
    features: list[str]
    architecture: str
    torch_version: str
    weights_sha256: str
    configuration: Configuration
    dataset_sha256: str
    training_sha256: str
    correction_sha256: list[str]
    episode_ids: list[ArtifactId]
    episode_sha256: list[str]
    training_samples: int
    correction_samples: int
    correction_seeds: list[int]
    fitting_loss: float
    evaluation: EvaluationSummary
    reference: EvaluationSummary
    compatible: bool = True


class Job(Model):
    job_id: ArtifactId
    state: Literal["preparing", "running", "completed", "cancelled", "failed"]
    phase: Literal["snapshot", "fitting", "evaluating", "corrections", "practicing", "finished"]
    request: TrainRequest
    created_at: str
    elapsed_seconds: float = 0.0
    round: int = 0
    epoch: int = 0
    fitting_loss: float | None = None
    history: Annotated[list[FitPoint], Field(max_length=160)] = []
    checkpoints: list[CheckpointId] = []
    selected_checkpoint: CheckpointId | None = None
    message: str
    cancel_requested: bool = False
    peak_worker_rss_mb: float = 0.0
    practice_history: Annotated[list[PracticePoint], Field(max_length=96)] = []
    practice_steps: int = 0


class TrainingCatalog(Model):
    jobs: list[Job]
    checkpoints: list[CheckpointInfo]
    active_job: ArtifactId | None
    artifact_location: str


class WorkerInput(Model):
    owner_pid: int
    job: Job
    dataset_sha256: str
    episode_ids: list[ArtifactId]
    episode_sha256: list[str]


class ComparisonRequest(Model):
    seed: Annotated[int, Field(ge=10000, le=10029)] = 10000
    checkpoint_ids: Annotated[list[CheckpointId], Field(min_length=2, max_length=2)]


class ComparedRollout(Model):
    label: str
    checkpoint_id: CheckpointId | None
    rollout: Rollout
