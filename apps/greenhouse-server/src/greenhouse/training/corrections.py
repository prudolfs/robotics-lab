"""Training-only expert labels on learner-visited TRAINING states (DAgger-style).

These are labeled states, not claimed successful demonstrations. Nothing in this
module is imported or called by learned inference or the interactive controller.
"""

from collections.abc import Callable
from dataclasses import asdict

from greenhouse.simulation.model import CARRY_HEIGHT, LOW_HEIGHT
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import Action, Observation, World
from greenhouse.training.evaluation import Actor
from greenhouse.training.learning import target
from greenhouse.training.policy import features


def teacher(observation: Observation) -> Action:
    settled = abs(observation.speed) < 0.025 and abs(observation.yaw_speed) < 0.08
    arrived = observation.distance < 0.385 and abs(observation.bearing) < 0.08
    if not observation.holding:
        if observation.lift_height > LOW_HEIGHT + 0.003:
            return Action(lift=-1)
        if arrived and settled:
            return Action(grip="close")
        return Reference(stage="approach").action(observation)
    if arrived and settled:
        return (
            Action(lift=-1) if observation.lift_height > LOW_HEIGHT + 0.003 else Action(grip="open")
        )
    if observation.lift_height < CARRY_HEIGHT - 0.003 and observation.distance > 0.45:
        return Action(lift=1)
    return Reference(stage="deliver").action(observation)


def collect(
    actor: Actor, seeds: list[int], cancelled: Callable[[], bool]
) -> tuple[list[list[float]], list[list[float]], list[dict[str, object]]]:
    if any(not 0 <= seed <= 99 for seed in seeds):
        raise ValueError("Corrective labels may use only training seeds 0–99.")
    inputs, targets, records = [], [], []
    for seed in seeds:
        world = World(seed)
        world.start("Collecting labeled learner states on training seeds.")
        while world.status == "running":
            if cancelled():
                raise InterruptedError("Correction collection cancelled.")
            observation = world.observe()
            executed = actor.action(observation)
            expert = teacher(observation)
            inputs.append(features(observation))
            targets.append(target(expert))
            records.append(
                {
                    "source": "scripted_expert_correction",
                    "teacher": "observable-correction-v1",
                    "seed": seed,
                    "tick": world.tick,
                    "observation": asdict(observation),
                    "executed_action": asdict(executed),
                    "teacher_action": asdict(expert),
                }
            )
            # The learner drives this rollout. Expert labels are NEVER substituted.
            world.step(executed)
    return inputs, targets, records
