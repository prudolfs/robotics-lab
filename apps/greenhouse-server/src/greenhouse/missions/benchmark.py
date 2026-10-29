"""Small training-scenario mission audit, independent of the live API and browser."""

import argparse
import asyncio
import importlib.metadata
import json
import time
from pathlib import Path
from uuid import uuid4

import torch
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from greenhouse.api.sessions import Sessions
from greenhouse.datasets.store import DatasetStore
from greenhouse.missions.manager import MissionManager
from greenhouse.missions.models import MissionRequest
from greenhouse.training.files import atomic_bytes
from greenhouse.training.manager import TrainingManager


async def benchmark(training_root: Path, checkpoint: str, output: Path, runtime_root: Path) -> None:
    torch.set_num_threads(1)
    root = runtime_root / uuid4().hex
    await asyncio.to_thread(root.mkdir, parents=True)
    training = TrainingManager(training_root, DatasetStore(root / "datasets"))
    info = training.checkpoint(checkpoint)
    sessions = Sessions()
    results = []
    started = time.monotonic()
    async with AsyncSqliteSaver.from_conn_string(str(root / "graph.sqlite")) as saver:
        manager = MissionManager(root, sessions, training, saver)
        for seed in (0, 1, 2, 42):
            session = sessions.create(seed)
            session.connected = True
            view = await manager.start(
                MissionRequest(
                    session_id=session.session_id, generation=0, checkpoint_id=checkpoint
                )
            )
            mission = manager.items[view.mission_id]
            deadline = time.monotonic() + 30
            while mission.active and time.monotonic() < deadline:
                session.advance()
                await asyncio.sleep(
                    0.001 if mission.skill_done.is_set() or not mission.current_skill else 0
                )
            if mission.active:
                mission.invalidate("Headless audit wall-time budget exhausted.", "failed")
            await manager.tasks[view.mission_id]
            result = mission.view().model_dump(mode="json")
            results.append(result)
            print(
                json.dumps(
                    {
                        key: result[key]
                        for key in (
                            "state",
                            "delivered",
                            "docked",
                            "total_ticks",
                            "collisions",
                            "invalid_actions",
                            "recoveries",
                        )
                    }
                ),
                flush=True,
            )
        await manager.close()
    report = {
        "checkpoint_id": checkpoint,
        "checkpoint_sha256": info.weights_sha256,
        "scenario_seeds": [0, 1, 2, 42],
        "capsules_per_mission": 3,
        "source": "actual LangGraph + MuJoCo, headless accelerated stepping; no LLM provider calls",
        "final_test_used": False,
        "wall_seconds": time.monotonic() - started,
        "versions": {
            name: importlib.metadata.version(name)
            for name in ("langgraph", "langgraph-checkpoint-sqlite", "langchain", "mujoco", "torch")
        },
        "missions": results,
    }
    await asyncio.to_thread(output.parent.mkdir, parents=True, exist_ok=True)
    await asyncio.to_thread(atomic_bytes, output, json.dumps(report, indent=2).encode())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--training-dir", type=Path, required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime-dir", type=Path, default=Path("runtime/mission-benchmarks/v1"))
    args = parser.parse_args()
    asyncio.run(benchmark(args.training_dir, args.checkpoint, args.output, args.runtime_dir))


if __name__ == "__main__":
    main()
