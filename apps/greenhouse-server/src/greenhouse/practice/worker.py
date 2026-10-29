"""PPO candidates use the checked BC actor format; the value head stays training-only."""

import json
import os
import resource
import sys
from collections.abc import Callable
from pathlib import Path

import torch

from greenhouse.practice.environment import REWARD_VERSION
from greenhouse.practice.ppo import CONFIG, practice
from greenhouse.simulation.reference import Reference
from greenhouse.training.evaluation import evaluate
from greenhouse.training.files import atomic_bytes, atomic_model, sha256
from greenhouse.training.models import CheckpointInfo, PracticePoint, WorkerInput
from greenhouse.training.policy import LearnedPolicy, Network, load_weights


def rank(info: CheckpointInfo) -> tuple[int, int, int, float]:
    return (
        info.evaluation.clean_successes,
        info.evaluation.successes,
        -info.evaluation.invalid_actions,
        -info.evaluation.mean_seconds,
    )


def run_practice(
    directory: Path,
    specification: WorkerInput,
    cancelled: Callable[[], bool],
    publish: Callable[..., None],
) -> None:
    request = specification.job.request
    parent = CheckpointInfo.model_validate_json((directory / "parent.json").read_bytes())
    if parent.checkpoint_id != request.parent_checkpoint or parent.algorithm != "bc":
        raise ValueError("PPO parent identity/algorithm mismatch.")
    if sha256(directory / "parent.pt") != parent.weights_sha256:
        raise ValueError("Frozen parent weights checksum mismatch.")
    torch.manual_seed(request.random_seed)
    torch.use_deterministic_algorithms(True)
    network = load_weights(directory / "parent.pt").network
    manifest = {
        **CONFIG,
        "random_seed": request.random_seed,
        "steps": request.ppo_steps,
        "parent_checkpoint": parent.checkpoint_id,
        "parent_sha256": parent.weights_sha256,
        "reward_version": REWARD_VERSION,
        "training_scenarios": list(range(100)),
        "validation_scenarios": list(range(10000, 10030)),
        "final_test_used": False,
    }
    atomic_bytes(directory / "practice-config.json", json.dumps(manifest, sort_keys=True).encode())
    training_hash = sha256(directory / "practice-config.json")
    publish(
        state="running", phase="evaluating", message="Checking the unchanged imitation baseline."
    )
    reference = evaluate(Reference, cancelled)
    atomic_model(directory / "reference.json", reference)
    candidates: list[CheckpointInfo] = []
    history: list[PracticePoint] = []

    def save(round_index: int, actor: Network) -> None:
        if cancelled():
            raise InterruptedError("PPO practice cancelled before evaluation.")
        publish(
            phase="evaluating",
            round=round_index,
            message="Evaluating deterministic actor on validation; no scripted recovery.",
        )
        evaluation = evaluate(lambda: LearnedPolicy(actor), cancelled)
        temporary = directory / f"r{round_index}.pt.tmp"
        weights = directory / f"r{round_index}.pt"
        torch.save(actor.state_dict(), temporary)
        os.replace(temporary, weights)
        metadata = parent.model_copy(
            update={
                "checkpoint_id": f"{specification.job.job_id}-r{round_index}",
                "job_id": specification.job.job_id,
                "round": round_index,
                "algorithm": "ppo",
                "parent_checkpoint": parent.checkpoint_id,
                "weights_sha256": sha256(weights),
                "training_sha256": training_hash,
                "practice_steps": round_index * request.ppo_steps // 3,
                "reward_version": REWARD_VERSION,
                "evaluation": evaluation.summary,
                "reference": reference.summary,
            }
        )
        atomic_model(directory / f"r{round_index}.evaluation.json", evaluation)
        atomic_model(directory / f"r{round_index}.checkpoint.json", metadata)
        candidates.append(metadata)
        # The original remains selected whenever practice regresses; never overwrite it.
        best = max([parent, *candidates], key=rank)
        publish(
            checkpoints=[item.checkpoint_id for item in candidates],
            selected_checkpoint=best.checkpoint_id,
            message=f"Validation {evaluation.summary.clean_successes}/30 clean; "
            f"best remains {best.checkpoint_id}.",
        )

    def progress(point: PracticePoint) -> None:
        history.append(point)
        publish(
            phase="practicing",
            practice_steps=point.steps,
            practice_history=history,
            message=f"PPO {point.stage}: {point.steps}/{request.ppo_steps} training steps.",
        )

    # Round 0 is a byte-identical actor initialization, evaluated before practice.
    save(0, network)
    practice(network, request.ppo_steps, request.random_seed, cancelled, progress, save)
    if cancelled():
        raise InterruptedError("PPO practice cancelled.")
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (
        1024 * 1024 if sys.platform == "darwin" else 1024
    )
    publish(
        state="completed",
        phase="finished",
        peak_worker_rss_mb=peak,
        message="PPO experiment complete. Best validation policy retained; final test sealed.",
    )
