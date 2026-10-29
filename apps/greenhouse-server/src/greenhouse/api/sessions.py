"""Session ownership and adapters around the independent fixed-step environment."""

import math
import secrets
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from typing import Literal
from uuid import uuid4

from greenhouse.api.contracts import (
    Ack,
    ClientMessage,
    Obstacle,
    Rejection,
    Robot,
    Scene,
    SceneObject,
    SessionView,
    Snapshot,
    TaskEvent,
    Vector3,
)
from greenhouse.datasets.episodes import Recorder
from greenhouse.datasets.models import ActionData, Controller, ObservationData, Stage, StateData
from greenhouse.datasets.store import DatasetStore
from greenhouse.simulation.model import CONTROL_DT, POT_X, TRAY, WALLS
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import Action, State, World


def scene_from_state(state: State | StateData, stage: Stage, controller: Controller) -> Scene:
    target = TRAY if state.holding else state.capsule[:2]
    dx, dy = target[0] - state.x, target[1] - state.y
    c, sine = math.cos(state.heading), math.sin(state.heading)
    forward, left = c * dx + sine * dy, -sine * dx + c * dy
    return Scene(
        observation=ObservationData(
            target_forward=forward,
            target_left=left,
            distance=math.hypot(dx, dy),
            bearing=math.atan2(left, forward),
            speed=state.speed,
            yaw_speed=state.yaw_speed,
            lift_height=state.lift_height,
            holding=state.holding,
        ),
        mode="reference_simulation",
        simulator_version=state.version,
        controller=controller,
        status=state.status,
        stage="done" if state.status == "complete" else stage,
        elapsed_seconds=state.tick * CONTROL_DT,
        delivered=state.delivered,
        pickups=state.pickups,
        collisions=state.collisions,
        invalid_actions=state.invalid_actions,
        reason=state.reason,
        events=[
            TaskEvent(tick=event.tick, kind=event.kind, text=event.text) for event in state.events
        ],
        robot=Robot(
            id="caretaker",
            x=state.x,
            y=state.y,
            heading=state.heading,
            holding=state.holding,
            lift_height=state.lift_height,
            left_wheel_angle=state.left_wheel_angle,
            right_wheel_angle=state.right_wheel_angle,
        ),
        capsule=SceneObject(
            id="capsule-1",
            position=Vector3(x=state.capsule[0], y=state.capsule[1], z=state.capsule[2]),
        ),
        tray=SceneObject(id="collection-tray", position=Vector3(x=TRAY[0], y=TRAY[1], z=0.0)),
        walls=[
            Obstacle(
                id=wall.id,
                position=Vector3(x=wall.x, y=wall.y, z=wall.z),
                half_size=Vector3(x=wall.half_x, y=wall.half_y, z=wall.half_z),
            )
            for wall in WALLS
        ],
        pots=[
            SceneObject(id=f"pot-{index}", position=Vector3(x=x, y=1.65, z=0.15))
            for index, x in enumerate(POT_X)
        ],
    )


@dataclass
class Session:
    seed: int
    session_id: str = field(default_factory=lambda: str(uuid4()))
    generation: int = 0
    connected: bool = False
    last_seen: float = field(default_factory=time.monotonic)
    last_command: float = -1.0
    acknowledgments: OrderedDict[str, Ack] = field(default_factory=OrderedDict)
    world: World = field(init=False)
    reference: Reference = field(default_factory=Reference)
    revision: int = 0
    store: DatasetStore | None = None
    controller: Controller = "scripted_reference"
    manual_action: Action = field(default_factory=Action)
    manual_until: float = 0.0
    last_manual: float = -1.0
    manual_changed_world: bool = False
    recorder: Recorder | None = None
    last_episode_id: str | None = None
    recording_error: str | None = None

    def __post_init__(self) -> None:
        self.world = World(self.seed)

    @property
    def tick(self) -> int:
        return self.world.tick

    def advance(self) -> None:
        if self.connected and self.world.status == "running":
            before = ObservationData(**asdict(self.world.observe()))
            action = (
                self.reference.action(self.world.observe())
                if self.controller == "scripted_reference"
                else self.manual_action
                if time.monotonic() < self.manual_until
                else Action()
            )
            step = self.world.step(action)
            if self.controller == "manual":
                self.manual_changed_world = True
            self.manual_action = Action(action.throttle, action.turn, action.lift)
            if self.recorder:
                self.recorder.append(
                    before,
                    action,
                    step,
                    self.world,
                    self.controller,
                    self.reference.stage if self.controller == "scripted_reference" else "manual",
                )
                if self.world.status in ("complete", "failed"):
                    self.finish_recording("terminal")
            self.revision += 1

    def finish_recording(
        self, reason: Literal["terminal", "stopped", "reset", "disconnected", "closed"]
    ) -> bool:
        if not self.recorder:
            return True
        if not self.recorder.frames:
            self.recorder = None
            self.recording_error = "No control steps were executed; no empty episode was saved."
            return True
        assert self.store is not None
        try:
            episode = self.recorder.finish(self.world, reason)
            self.store.save(episode)
            self.last_episode_id = episode.episode_id
            self.recording_error = None
            self.recorder = None
            return True
        except (ValueError, OSError, OverflowError) as error:
            self.recording_error = f"Recording could not be saved: {error}"
            self.world.pause()
            return False

    def disconnect(self) -> None:
        self.manual_action = Action()
        self.manual_until = 0
        self.finish_recording("disconnected")
        self.connected = False
        self.last_seen = time.monotonic()
        if self.world.pause("Collection paused because the viewer disconnected."):
            self.revision += 1

    def view(self) -> SessionView:
        state = self.world.state()
        return SessionView(
            session_id=self.session_id,
            generation=self.generation,
            tick=self.tick,
            seed=self.seed,
            scene=scene_from_state(
                state,
                self.reference.stage if self.controller == "scripted_reference" else "manual",
                self.controller,
            ),
            recording=self.recorder is not None,
            last_episode_id=self.last_episode_id,
            recording_error=self.recording_error,
        )

    def snapshot(self) -> Snapshot:
        return Snapshot(kind="snapshot", **self.view().model_dump())

    def execute(self, command: ClientMessage) -> Ack:
        self.last_seen = time.monotonic()
        if command.session_id == self.session_id and command.request_id in self.acknowledgments:
            return self.acknowledgments[command.request_id]
        reason: Rejection | None = None
        if command.session_id != self.session_id:
            reason = "session_mismatch"
        elif command.generation != self.generation:
            reason = "stale_generation"
        elif command.kind == "manual":
            if self.controller != "manual" or self.world.status != "running":
                reason = "invalid_state"
            elif self.last_seen - self.last_manual < 0.05 and command.action != ActionData():
                reason = "rate_limited"
            else:
                self.manual_action = Action(**command.action.model_dump())
                self.manual_until = self.last_seen + 0.25
                self.last_manual = self.last_seen
        elif self.last_seen - self.last_command < 0.1:
            reason = "rate_limited"
        elif command.kind == "set_controller":
            if self.world.status not in ("ready", "paused"):
                reason = "invalid_state"
            else:
                changed = self.controller != command.controller
                self.controller = command.controller
                self.manual_action = Action()
                self.manual_until = 0
                if (
                    changed
                    and self.controller == "scripted_reference"
                    and self.manual_changed_world
                ):
                    self.reference = Reference(
                        stage="deliver" if self.world.holding else "approach"
                    )
                    self.manual_changed_world = False
                self.world.event(
                    "info",
                    "Manual teaching selected."
                    if self.controller == "manual"
                    else "Scripted reference selected.",
                )
        elif command.kind == "record":
            if self.world.status != "ready" or self.recorder or not self.store:
                reason = "invalid_state"
            else:
                try:
                    self.recorder = Recorder(self.world)
                    self.recording_error = None
                    self.world.start(
                        "Manual teaching running."
                        if self.controller == "manual"
                        else "Scripted reference controller running."
                    )
                except ValueError as error:
                    self.recording_error = str(error)
                    reason = "invalid_state"
        elif command.kind == "stop_recording":
            if not self.recorder:
                reason = "invalid_state"
            else:
                # Capture final state before adding the stop/pause event.
                if not self.finish_recording(
                    "terminal" if self.world.status in ("complete", "failed") else "stopped"
                ):
                    reason = "storage_error"
                self.world.pause()
                self.manual_action = Action()
                self.manual_until = 0
        elif command.kind == "start":
            if not self.world.start(
                "Manual teaching running."
                if self.controller == "manual"
                else "Scripted reference controller running."
            ):
                reason = "invalid_state"
        elif command.kind == "pause":
            if not self.world.pause():
                reason = "invalid_state"
            self.manual_action = Action()
            self.manual_until = 0
        elif command.kind in ("reset", "new_seed"):
            if not self.finish_recording(
                "terminal" if self.world.status in ("complete", "failed") else "reset"
            ):
                reason = "storage_error"
            else:
                if command.kind == "new_seed":
                    seed = secrets.randbelow(100)
                    self.seed = seed if seed != self.seed else (seed + 1) % 100
                self.world.reset(self.seed)
                self.reference = Reference()
                self.manual_changed_world = False
                self.manual_action = Action()
                self.manual_until = 0
                self.generation += 1
        if reason is None:
            if command.kind != "manual":
                self.last_command = self.last_seen
            if command.kind != "ping":
                self.revision += 1
        ack = Ack(
            kind="ack",
            api_version="1",
            session_id=self.session_id,
            generation=self.generation,
            tick=self.tick,
            request_id=command.request_id,
            command=command.kind,
            accepted=reason is None,
            reason=reason,
        )
        self.acknowledgments[command.request_id] = ack
        if len(self.acknowledgments) > 64:
            self.acknowledgments.popitem(last=False)
        return ack


class Sessions:
    """Single-process local registry; fixed-step scheduling is owned by lifespan."""

    def __init__(
        self, limit: int = 16, idle_seconds: float = 120, store: DatasetStore | None = None
    ):
        self.store = store
        self.items: dict[str, Session] = {}
        self.limit = limit
        self.idle_seconds = idle_seconds

    def prune(self) -> None:
        now = time.monotonic()
        expired = [
            key
            for key, session in self.items.items()
            if not session.connected and now - session.last_seen > self.idle_seconds
        ]
        for key in expired:
            session = self.items[key]
            if session.finish_recording("closed"):
                del self.items[key]

    def create(self, seed: int) -> Session:
        self.prune()
        if len(self.items) >= self.limit:
            raise OverflowError("Close an existing greenhouse session and retry.")
        session = Session(seed, store=self.store)
        self.items[session.session_id] = session
        return session
