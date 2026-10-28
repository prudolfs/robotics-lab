"""Reference benchmark and action trace; no training or final-test evaluation."""

import argparse
import json
import platform
import time
from dataclasses import asdict
from pathlib import Path

import mujoco

from greenhouse.simulation.model import CONTROL_DT, SIM_VERSION
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import World


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    world = World(0)
    rows = []
    trace = []
    start = time.perf_counter()
    for seed in [*range(100), *range(10000, 10030)]:
        world.reset(seed)
        reference = Reference()
        world.start()
        while world.status == "running":
            observation = world.observe()
            action = reference.action(observation)
            result = world.step(action)
            if seed == 42:
                trace.append(
                    {
                        "observation": asdict(observation),
                        "action": asdict(action),
                        "reward": result.reward,
                        "state": asdict(world.state()),
                    }
                )
        state = world.state()
        rows.append(
            {
                "seed": seed,
                "success": state.delivered,
                "ticks": state.tick,
                "seconds": state.tick * CONTROL_DT,
                "collisions": state.collisions,
                "invalid_actions": state.invalid_actions,
                "reason": state.reason,
            }
        )
    wall = time.perf_counter() - start
    report = {
        "simulator": SIM_VERSION,
        "mujoco": mujoco.__version__,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "controller": "scripted_reference",
        "episodes": len(rows),
        "successes": sum(row["success"] for row in rows),
        "collisions": sum(row["collisions"] for row in rows),
        "invalid_actions": sum(row["invalid_actions"] for row in rows),
        "wall_seconds": wall,
        "control_steps_per_second": sum(row["ticks"] for row in rows) / wall,
        "final_test_seeds_evaluated": False,
        "results": rows,
    }
    (args.output / "reference-benchmark.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.output / "reference-trace.json").write_text(
        json.dumps(trace, separators=(",", ":")) + "\n"
    )
    print(json.dumps({key: value for key, value in report.items() if key != "results"}, indent=2))
    if report["successes"] != len(rows) or report["collisions"] or report["invalid_actions"]:
        raise SystemExit("Reference benchmark failed")


if __name__ == "__main__":
    main()
