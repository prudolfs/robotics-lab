"""Session ownership and adapters around the independent fixed-step environment."""

import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass, field
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
from greenhouse.simulation.model import CONTROL_DT, POT_X, TRAY, WALLS
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import World


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

    def __post_init__(self) -> None:
        self.world = World(self.seed)

    @property
    def tick(self) -> int:
        return self.world.tick

    def advance(self) -> None:
        if self.connected and self.world.status == "running":
            self.world.step(self.reference.action(self.world.observe()))
            self.revision += 1

    def disconnect(self) -> None:
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
            scene=Scene(
                mode="reference_simulation",
                simulator_version=state.version,
                controller="scripted_reference",
                status=state.status,
                stage="done" if state.status == "complete" else self.reference.stage,
                elapsed_seconds=state.tick * CONTROL_DT,
                delivered=state.delivered,
                pickups=state.pickups,
                collisions=state.collisions,
                invalid_actions=state.invalid_actions,
                reason=state.reason,
                events=[
                    TaskEvent(tick=event.tick, kind=event.kind, text=event.text)
                    for event in state.events
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
                tray=SceneObject(
                    id="collection-tray", position=Vector3(x=TRAY[0], y=TRAY[1], z=0.0)
                ),
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
            ),
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
        elif self.last_seen - self.last_command < 0.1:
            reason = "rate_limited"
        elif command.kind == "start" and not self.world.start():
            reason = "invalid_state"
        elif command.kind == "pause" and not self.world.pause():
            reason = "invalid_state"
        else:
            self.last_command = self.last_seen
            if command.kind in ("reset", "new_seed"):
                if command.kind == "new_seed":
                    seed = secrets.randbelow(2_147_483_648)
                    self.seed = seed if seed != self.seed else (seed + 1) % 2_147_483_648
                self.world.reset(self.seed)
                self.reference = Reference()
                self.generation += 1
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

    def __init__(self, limit: int = 16, idle_seconds: float = 120):
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
            del self.items[key]

    def create(self, seed: int) -> Session:
        self.prune()
        if len(self.items) >= self.limit:
            raise OverflowError("Close an existing greenhouse session and retry.")
        session = Session(seed)
        self.items[session.session_id] = session
        return session
