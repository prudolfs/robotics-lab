"""One job per CPU worker process. No API state or live simulation is shared."""

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import torch

from greenhouse.datasets.episodes import configuration, validate_episode
from greenhouse.datasets.models import Bundle
from greenhouse.datasets.store import eligible
from greenhouse.simulation.reference import Reference
from greenhouse.training.corrections import collect
from greenhouse.training.evaluation import evaluate
from greenhouse.training.files import atomic_bytes, atomic_model, sha256
from greenhouse.training.learning import examples, fit
from greenhouse.training.models import CheckpointInfo, FitPoint, Job, WorkerInput
from greenhouse.training.policy import LearnedPolicy, Network
from greenhouse.training.spec import ARCHITECTURE, FEATURES, POLICY_VERSION


def run(directory: Path) -> int:
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    job = Job.model_validate_json((directory / "status.json").read_bytes())
    started = time.monotonic()

    def publish(**updates: Any) -> None:
        nonlocal job
        job = job.model_copy(update={**updates, "elapsed_seconds": time.monotonic() - started})
        atomic_model(directory / "status.json", job)

    try:
        specification = WorkerInput.model_validate_json((directory / "input.json").read_bytes())
        request = specification.job.request

        def cancelled() -> bool:
            if time.monotonic() - started > request.budget_seconds:
                raise TimeoutError("The bounded training time budget was exhausted.")
            return (directory / "cancel.flag").exists() or os.getppid() != specification.owner_pid

        if cancelled():
            raise InterruptedError("Training cancelled before fitting.")
        bundle = Bundle.model_validate_json((directory / "dataset.json").read_bytes())
        for entry in bundle.episodes:
            if not eligible(entry.episode, entry.review):
                raise ValueError("The frozen snapshot contains an ineligible episode.")
            validate_episode(entry.episode)
        if sha256(directory / "dataset.json") != specification.dataset_sha256:
            raise ValueError("Frozen dataset snapshot checksum mismatch.")
        if request.algorithm == "ppo":
            from greenhouse.practice.worker import run_practice

            run_practice(directory, specification, cancelled, publish)
            return 0
        torch.manual_seed(request.random_seed)
        torch.use_deterministic_algorithms(True)
        network = Network()
        x, y = examples([entry.episode for entry in bundle.episodes])
        initial_samples = len(x)
        seeds = sorted({entry.episode.seed for entry in bundle.episodes})[:20]
        publish(
            state="running",
            phase="evaluating",
            message="Evaluating the scripted reference on the fixed validation seeds.",
        )
        baseline = evaluate(Reference, cancelled)
        atomic_model(directory / "reference.json", baseline)
        checkpoints: list[CheckpointInfo] = []
        correction_hashes: list[str] = []
        for round_index in range(request.correction_rounds + 1):
            publish(
                phase="fitting",
                round=round_index,
                epoch=0,
                message="Fitting demonstrations."
                if round_index == 0
                else "Refitting with labeled learner-visited training states.",
            )

            def progress(epoch: int, loss: float, current_round: int = round_index) -> None:
                history = [*job.history, FitPoint(round=current_round, epoch=epoch, loss=loss)]
                publish(epoch=epoch, fitting_loss=loss, history=history[-160:])

            loss = fit(network, x, y, request.epochs, progress, cancelled)
            publish(
                phase="evaluating",
                message="Measuring full validation episodes; fitting loss is not task success.",
            )
            evaluation = evaluate(lambda: LearnedPolicy(network), cancelled)
            checkpoint_id = f"{job.job_id}-r{round_index}"
            weights = directory / f"r{round_index}.pt"
            temporary = directory / f"r{round_index}.pt.tmp"
            torch.save(network.state_dict(), temporary)
            os.replace(temporary, weights)
            metadata = CheckpointInfo(
                checkpoint_id=checkpoint_id,
                job_id=job.job_id,
                round=round_index,
                policy_version=POLICY_VERSION,
                features=FEATURES,
                architecture=ARCHITECTURE,
                torch_version=str(torch.__version__),
                weights_sha256=sha256(weights),
                configuration=configuration(),
                dataset_sha256=specification.dataset_sha256,
                training_sha256=hashlib.sha256(
                    json.dumps([specification.dataset_sha256, *correction_hashes]).encode()
                ).hexdigest(),
                correction_sha256=list(correction_hashes),
                episode_ids=specification.episode_ids,
                episode_sha256=specification.episode_sha256,
                training_samples=len(x),
                correction_samples=len(x) - initial_samples,
                correction_seeds=seeds if round_index else [],
                fitting_loss=loss,
                evaluation=evaluation.summary,
                reference=baseline.summary,
            )
            atomic_model(directory / f"r{round_index}.evaluation.json", evaluation)
            # Metadata is the commit marker: never expose unevaluated weights.
            atomic_model(directory / f"r{round_index}.checkpoint.json", metadata)
            checkpoints.append(metadata)
            best = max(
                checkpoints,
                key=lambda item: (
                    item.evaluation.clean_successes,
                    item.evaluation.successes,
                    -item.evaluation.invalid_actions,
                    -item.evaluation.mean_seconds,
                ),
            )
            publish(
                checkpoints=[item.checkpoint_id for item in checkpoints],
                selected_checkpoint=best.checkpoint_id,
                message=(
                    f"Validation: {evaluation.summary.successes}/30 deliveries, "
                    f"{evaluation.summary.clean_successes}/30 clean."
                ),
            )
            if round_index < request.correction_rounds:
                publish(
                    phase="corrections",
                    message=(
                        "Collecting expert labels on learner-visited TRAINING seeds; "
                        "expert actions are not executed."
                    ),
                )
                extra_x, extra_y, records = collect(LearnedPolicy(network), seeds, cancelled)
                artifact = {
                    "schema_version": 1,
                    "source_checkpoint": checkpoint_id,
                    "source_weights_sha256": metadata.weights_sha256,
                    "seeds": seeds,
                    "teacher": "observable-correction-v1",
                    "records": records,
                }
                atomic_bytes(
                    directory / f"r{round_index}.corrections.json", json.dumps(artifact).encode()
                )
                correction_hashes.append(sha256(directory / f"r{round_index}.corrections.json"))
                x.extend(extra_x)
                y.extend(extra_y)
        if cancelled():
            raise InterruptedError("Training cancelled.")
        peak = 0.0
        try:
            import resource

            peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (
                1024 * 1024 if sys.platform == "darwin" else 1024
            )
        except ImportError:
            pass
        publish(
            state="completed",
            phase="finished",
            peak_worker_rss_mb=peak,
            message=(
                "Training complete. Selected by clean validation deliveries, then successes, "
                "invalid actions and time. Final test untouched."
            ),
        )
        return 0
    except InterruptedError as error:
        publish(state="cancelled", phase="finished", message=str(error), cancel_requested=True)
        return 0
    except Exception as error:
        publish(state="failed", phase="finished", message=f"{type(error).__name__}: {error}"[:1000])
        return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-dir", type=Path, required=True)
    raise SystemExit(run(parser.parse_args().job_dir))
