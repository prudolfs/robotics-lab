"""Complete episodes and explicit failure categories, separate from fitting loss."""

from collections import Counter
from collections.abc import Callable
from dataclasses import asdict
from typing import Protocol

from greenhouse.datasets.episodes import capture
from greenhouse.datasets.models import ActionData
from greenhouse.simulation.model import CONTROL_DT
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import Action, Observation, World
from greenhouse.training.models import Evaluation, EvaluationSummary, Failure, PolicyFrame, Rollout


class Actor(Protocol):
    def action(self, observation: Observation) -> Action: ...


def rollout(
    seed: int,
    actor: Actor,
    cancelled: Callable[[], bool] = lambda: False,
    record: bool = False,
    *,
    final_test: bool = False,
) -> Rollout:
    if 20000 <= seed <= 20099 and not final_test:
        raise ValueError("Final test seeds require the sealed Phase 6 evaluation runner.")
    world = World(seed)
    initial = capture(world.state())
    frames = []
    world.start(
        "Learned policy evaluation."
        if not isinstance(actor, Reference)
        else "Scripted reference evaluation."
    )
    while world.status == "running":
        if cancelled():
            raise InterruptedError("Evaluation cancelled.")
        action = actor.action(world.observe())
        world.step(action)
        if record:
            frames.append(
                PolicyFrame(state=capture(world.state()), action=ActionData(**asdict(action)))
            )
    failure: Failure = (
        "none"
        if world.delivered
        else "collision"
        if world.collisions
        else "pickup_not_completed"
        if not world.pickups
        else "invalid_grasp_or_release"
        if world.invalid_actions
        else "delivery_timeout"
    )
    return Rollout(
        seed=seed,
        success=world.delivered,
        clean_success=world.delivered and world.collisions == world.invalid_actions == 0,
        ticks=world.tick,
        seconds=world.tick * CONTROL_DT,
        collisions=world.collisions,
        invalid_actions=world.invalid_actions,
        failure=failure,
        initial=initial if record else None,
        frames=frames,
        final=capture(world.state()) if record else None,
    )


def evaluate(
    factory: Callable[[], Actor], cancelled: Callable[[], bool] = lambda: False
) -> Evaluation:
    episodes = [
        rollout(seed, factory(), cancelled, record=seed in (10000, 10001, 10002))
        for seed in range(10000, 10030)
    ]
    counts: Counter[str] = Counter(item.failure for item in episodes)
    return Evaluation(
        seeds=list(range(10000, 10030)),
        episodes=episodes,
        summary=EvaluationSummary(
            successes=sum(item.success for item in episodes),
            clean_successes=sum(item.clean_success for item in episodes),
            collisions=sum(item.collisions for item in episodes),
            invalid_actions=sum(item.invalid_actions for item in episodes),
            mean_seconds=sum(item.seconds for item in episodes) / len(episodes),
            failure_counts=dict(counts),
        ),
    )
