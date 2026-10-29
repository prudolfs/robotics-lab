"""Record every executed control step and verify it through deterministic re-simulation."""

import hashlib
import json
import math
import time
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

import mujoco

from greenhouse.datasets.models import (
    ActionData,
    Configuration,
    Controller,
    Episode,
    Frame,
    ObservationData,
    Split,
    Stage,
    StateData,
)
from greenhouse.simulation import model
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import Action, State, Step, World


def configuration() -> Configuration:
    paths = [
        Path(model.__file__),
        Path(__file__).parents[1] / "simulation/world.py",
        Path(__file__).parents[1] / "simulation/reference.py",
    ]
    fingerprint = hashlib.sha256(b"".join(path.read_bytes() for path in paths)).hexdigest()
    return Configuration(
        simulator_version=model.SIM_VERSION,
        world_fingerprint=fingerprint,
        mujoco_version=mujoco.__version__,
        control_dt=model.CONTROL_DT,
        physics_dt=model.PHYSICS_DT,
        max_ticks=model.MAX_TICKS,
        gripper_reach=model.REACH,
        capsule_radius=model.CAPSULE_RADIUS,
        lift_limits=[model.LOW_HEIGHT, model.CARRY_HEIGHT],
        tray=list(model.TRAY),
        tray_radius=model.TRAY_RADIUS,
    )


def split_for(seed: int) -> Split:
    if 0 <= seed <= 99:
        return "train"
    if 10000 <= seed <= 10029:
        return "validation"
    if 20000 <= seed <= 20099:
        return "reserved_test"
    return "unassigned"


def capture(state: State) -> StateData:
    return StateData.model_validate_json(json.dumps(asdict(state)))


def digest(episode: Episode) -> str:
    return hashlib.sha256(episode.model_dump_json().encode()).hexdigest()


class Recorder:
    def __init__(self, world: World):
        if world.tick != 0 or world.status != "ready":
            raise ValueError("Reset to begin recording from the seeded initial state.")
        if split_for(world.seed) == "reserved_test":
            raise ValueError("Final test seeds are reserved and cannot become demonstrations.")
        self.episode_id = uuid4().hex
        self.created_at = datetime.now(UTC).isoformat()
        self.initial = capture(world.state())
        self.config = configuration()
        self.started = time.monotonic()
        self.frames: list[Frame] = []

    def append(
        self,
        before: ObservationData,
        action: Action,
        step: Step,
        world: World,
        controller: Controller,
        stage: Stage,
    ) -> None:
        previous = self.frames[-1].controller if self.frames else "scripted_reference"
        self.frames.append(
            Frame(
                tick=world.tick,
                simulated_seconds=world.tick * model.CONTROL_DT,
                wall_seconds=time.monotonic() - self.started,
                controller=controller,
                intervention=controller != previous,
                stage=stage,
                observation=before,
                action=ActionData(**asdict(action)),
                next_observation=ObservationData(**asdict(step.observation)),
                state=capture(world.state()),
                reward=step.reward,
                terminated=step.terminated,
                truncated=step.truncated,
            )
        )

    def finish(
        self,
        world: World,
        reason: Literal["terminal", "stopped", "reset", "disconnected", "closed"],
    ) -> Episode:
        controllers = {frame.controller for frame in self.frames}
        final = capture(world.state())
        return Episode(
            episode_id=self.episode_id,
            created_at=self.created_at,
            seed=world.seed,
            split=split_for(world.seed),
            source=(
                "mixed"
                if len(controllers) > 1
                else "user"
                if "manual" in controllers
                else "scripted_expert"
            ),
            configuration=self.config,
            initial_state=self.initial,
            frames=self.frames,
            final_state=final,
            outcome=(
                "success"
                if final.delivered
                else "failure"
                if final.status == "failed"
                else "incomplete"
            ),
            end_reason=reason,
        )


def _same(actual: object, expected: object) -> bool:
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return math.isclose(actual, expected, rel_tol=1e-7, abs_tol=1e-7)
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(
            _same(actual[key], expected[key]) for key in actual
        )
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(
            _same(a, b) for a, b in zip(actual, expected, strict=True)
        )
    return actual == expected


def physical(state: StateData) -> dict[str, object]:
    # Pauses and controller-selection events do not advance physics. Their recorded
    # wall timing/events are preserved, but not synthesized during action re-simulation.
    return state.model_dump(exclude={"events", "status", "reason"})


def validate_episode(episode: Episode) -> None:
    if episode.configuration != configuration():
        raise ValueError("Incompatible simulator, physics, action or observation configuration.")
    if episode.split != split_for(episode.seed) or episode.split == "reserved_test":
        raise ValueError("Invalid split membership or reserved final test seed.")
    world = World(episode.seed)
    if episode.initial_state.status != "ready" or not _same(
        physical(capture(world.state())), physical(episode.initial_state)
    ):
        raise ValueError("Initial state does not match the seed.")
    world.start()
    reference = Reference()
    last_wall = 0.0
    previous: Controller = "scripted_reference"
    controllers = set()
    for index, frame in enumerate(episode.frames, 1):
        if world.status != "running" or frame.tick != index or frame.state.tick != index:
            raise ValueError("Non-contiguous steps or actions after termination.")
        if frame.wall_seconds < last_wall or not math.isclose(
            frame.simulated_seconds, index * model.CONTROL_DT
        ):
            raise ValueError("Invalid episode timing.")
        if frame.intervention != (frame.controller != previous):
            raise ValueError("Incorrect intervention marker.")
        if frame.controller == "scripted_reference":
            if previous != frame.controller:
                reference = Reference(stage="deliver" if world.holding else "approach")
            expected = reference.action(world.observe())
            if frame.action != ActionData(**asdict(expected)) or frame.stage != reference.stage:
                raise ValueError("A scripted expert frame does not match the reference controller.")
        elif frame.stage != "manual":
            raise ValueError("A manual frame has an incorrect stage label.")
        previous = frame.controller
        controllers.add(frame.controller)
        if not _same(asdict(world.observe()), frame.observation.model_dump()):
            raise ValueError(f"Pre-action observation mismatch at tick {index}.")
        step = world.step(Action(**frame.action.model_dump()))
        if not _same(asdict(step.observation), frame.next_observation.model_dump()):
            raise ValueError(f"Next observation mismatch at tick {index}.")
        actual = capture(world.state())
        if (
            not _same(physical(actual), physical(frame.state))
            or frame.state.status != actual.status
        ):
            raise ValueError(f"Stored state does not match executed actions at tick {index}.")
        if not _same(step.reward, frame.reward) or (step.terminated, step.truncated) != (
            frame.terminated,
            frame.truncated,
        ):
            raise ValueError("Incorrect reward or terminal flags.")
        if any(event.tick > index for event in frame.state.events):
            raise ValueError("Event appears before it occurred.")
        last_wall = frame.wall_seconds
    expected_source = (
        "mixed"
        if len(controllers) > 1
        else "user"
        if "manual" in controllers
        else "scripted_expert"
    )
    expected_outcome = (
        "success" if world.delivered else "failure" if world.status == "failed" else "incomplete"
    )
    if episode.source != expected_source or episode.outcome != expected_outcome:
        raise ValueError("Source or completion label disagrees with the executed episode.")
    if not _same(physical(capture(world.state())), physical(episode.final_state)):
        raise ValueError("Final state mismatch.")
    if episode.final_state.status not in (
        {world.status} if episode.end_reason == "terminal" else {world.status, "paused"}
    ):
        raise ValueError("Incorrect final status.")
    if (episode.end_reason == "terminal") != (world.status in {"complete", "failed"}):
        raise ValueError("Incorrect episode end reason.")
