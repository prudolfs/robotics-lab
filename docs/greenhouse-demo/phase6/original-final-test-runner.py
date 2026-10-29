"""Freeze validation selection, then evaluate the reserved test suite once. No tuning API."""

import argparse
import hashlib
import json
import statistics
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import torch

from greenhouse.datasets.episodes import configuration
from greenhouse.practice.worker import rank
from greenhouse.simulation.reference import Reference
from greenhouse.training.evaluation import Actor, rollout
from greenhouse.training.files import atomic_bytes, sha256
from greenhouse.training.models import CheckpointInfo, Job
from greenhouse.training.policy import load_weights


def source_identity() -> str:
    root = Path(__file__).resolve().parents[1]
    paths = sorted(
        path
        for folder in ("simulation", "training", "practice")
        for path in (root / folder).glob("*.py")
    )
    return hashlib.sha256(
        json.dumps([(str(path.relative_to(root)), sha256(path)) for path in paths]).encode()
    ).hexdigest()


def read_checkpoint(root: Path, checkpoint_id: str) -> tuple[CheckpointInfo, Path]:
    import re

    if not re.fullmatch(r"[a-f0-9]{32}-r[0-3]", checkpoint_id):
        raise ValueError("Invalid frozen checkpoint identity.")
    job, round_id = checkpoint_id.split("-")
    stem = root / job / round_id
    info = CheckpointInfo.model_validate_json(stem.with_suffix(".checkpoint.json").read_bytes())
    weights = stem.with_suffix(".pt")
    if info.checkpoint_id != checkpoint_id or sha256(weights) != info.weights_sha256:
        raise ValueError("Checkpoint identity/checksum changed.")
    if info.configuration != configuration():
        raise ValueError("Checkpoint environment differs from the test environment.")
    return info, weights


def seal(root: Path, output: Path, job_ids: list[str]) -> dict[str, Any]:
    if output.exists():
        raise ValueError("This final-test seal already exists. It cannot be replaced.")
    selected = []
    parents = set()
    seeds = []
    for job_id in job_ids:
        if len(job_id) != 32 or any(c not in "abcdef0123456789" for c in job_id):
            raise ValueError("Invalid practice job identity.")
        job = Job.model_validate_json((root / job_id / "status.json").read_bytes())
        if job.state != "completed" or job.request.algorithm != "ppo":
            raise ValueError("Only completed PPO experiments may be sealed.")
        parents.add(job.request.parent_checkpoint)
        seeds.append(job.request.random_seed)
        candidates = [read_checkpoint(root, key)[0] for key in job.checkpoints]
        # Exclude zero-update initialization: per-run PPO comparison must have practiced.
        candidates = [item for item in candidates if item.practice_steps > 0]
        chosen = max(candidates, key=rank)
        selected.append(
            {"training_seed": job.request.random_seed, "checkpoint": chosen.model_dump(mode="json")}
        )
    if len(parents) != 1 or None in parents or len(seeds) != len(set(seeds)):
        raise ValueError("Use distinct training seeds and the same imitation parent.")
    parent_id = next(iter(parents))
    assert parent_id is not None
    parent = read_checkpoint(root, parent_id)[0]
    choices = [parent, *[CheckpointInfo.model_validate(row["checkpoint"]) for row in selected]]
    best = max(choices, key=rank)
    manifest = {
        "schema_version": 1,
        "sealed_at": datetime.now(UTC).isoformat(),
        "source_sha256": source_identity(),
        "configuration": configuration().model_dump(),
        "selection_rule": "clean deliveries, deliveries, fewer invalid actions, shorter mean time",
        "selected_checkpoint": best.checkpoint_id,
        "parent": parent.model_dump(mode="json"),
        "practice": selected,
        "test_seeds": list(range(20000, 20100)),
        "note": "Frozen before final-test outcomes. No selection or training after inspection.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation: a later command cannot overwrite the selection seal.
    with output.open("x") as stream:
        json.dump(manifest, stream, indent=2)
    return manifest


def evaluate_sealed(root: Path, seal_path: Path) -> dict[str, Any]:
    manifest = json.loads(seal_path.read_bytes())
    if manifest["source_sha256"] != source_identity():
        raise ValueError("Source changed after selection was sealed.")
    if manifest["test_seeds"] != list(range(20000, 20100)):
        raise ValueError("Final-test seed manifest is invalid.")
    frozen = [manifest["parent"], *[row["checkpoint"] for row in manifest["practice"]]]
    actors: list[tuple[str, Actor]] = [("scripted_reference", Reference())]
    # Check everything before consuming the one-shot evaluation claim.
    for payload in frozen:
        info, weights = read_checkpoint(root, payload["checkpoint_id"])
        if info.model_dump(mode="json") != payload:
            raise ValueError("Frozen checkpoint metadata changed.")
        actors.append((info.checkpoint_id, load_weights(weights)))
    claim = seal_path.with_suffix(".started")
    with claim.open("x") as stream:
        stream.write(sha256(seal_path))
    torch.set_num_threads(1)
    results: list[dict[str, Any]] = []
    for label, actor in actors:
        start = time.monotonic()
        episodes = [rollout(seed, actor, final_test=True) for seed in manifest["test_seeds"]]
        seconds = time.monotonic() - start
        count = len(episodes)
        successes = sum(item.success for item in episodes)
        p = successes / count
        z = 1.96
        center = (p + z * z / (2 * count)) / (1 + z * z / count)
        half = (
            z * ((p * (1 - p) / count + z * z / (4 * count * count)) ** 0.5) / (1 + z * z / count)
        )
        summary = {
            "total": count,
            "successes": successes,
            "clean_successes": sum(item.clean_success for item in episodes),
            "collisions": sum(item.collisions for item in episodes),
            "invalid_actions": sum(item.invalid_actions for item in episodes),
            "mean_seconds": statistics.mean(item.seconds for item in episodes),
            "mean_success_seconds": statistics.mean(
                item.seconds for item in episodes if item.success
            )
            if successes
            else None,
            "failure_counts": dict(Counter(item.failure for item in episodes)),
            "success_wilson_95": [center - half, center + half],
            "control_steps_per_wall_second": sum(item.ticks for item in episodes) / seconds,
            "evaluation_wall_seconds": seconds,
        }
        results.append(
            {
                "controller": label,
                "summary": summary,
                "episodes": [
                    item.model_dump(exclude={"initial", "frames", "final"}) for item in episodes
                ],
            }
        )
    practice_counts = [row["summary"]["successes"] for row in results[2:]]
    report = {
        "seal_sha256": sha256(seal_path),
        "manifest": manifest,
        "results": results,
        "ppo_success_count_mean": statistics.mean(practice_counts),
        "ppo_success_count_sample_stdev": statistics.stdev(practice_counts)
        if len(practice_counts) > 1
        else None,
        "selection_changed_after_test": False,
    }
    atomic_bytes(seal_path.with_suffix(".results.json"), json.dumps(report, indent=2).encode())
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("seal", "evaluate"))
    parser.add_argument("--training-dir", required=True, type=Path)
    parser.add_argument("--seal", required=True, type=Path)
    parser.add_argument("--jobs", nargs="+", default=[])
    args = parser.parse_args()
    if args.operation == "seal":
        result = seal(args.training_dir, args.seal, args.jobs)
        print(json.dumps({"selected_checkpoint": result["selected_checkpoint"], "sealed": True}))
    else:
        result = evaluate_sealed(args.training_dir, args.seal)
        print(
            json.dumps(
                {
                    "results": [
                        {"controller": row["controller"], **row["summary"]}
                        for row in result["results"]
                    ]
                }
            )
        )


if __name__ == "__main__":
    main()
