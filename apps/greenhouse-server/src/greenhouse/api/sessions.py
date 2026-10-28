"""Ephemeral session transport state. No physics or imitation controller here."""

import random
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from uuid import uuid4

from greenhouse.api.contracts import (
    Ack,
    ClientMessage,
    Rejection,
    Robot,
    Scene,
    SceneObject,
    SessionView,
    Snapshot,
    Vector3,
)


def preview_scene(seed: int) -> Scene:
    """Only a seeded initial layout; no simulator stepping is implied."""
    rng = random.Random(seed)
    return Scene(
        mode="foundation_preview",
        robot=Robot(
            id="caretaker",
            holding=False,
            x=rng.uniform(-1.6, -0.8),
            y=rng.uniform(-0.7, 0.7),
            heading=0.0,
        ),
        capsule=SceneObject(
            id="capsule-1",
            position=Vector3(x=rng.uniform(-0.1, 0.65), y=rng.uniform(-0.7, 0.7), z=0.05),
        ),
        tray=SceneObject(id="collection-tray", position=Vector3(x=1.65, y=0.65, z=0.04)),
    )


@dataclass
class Session:
    seed: int
    session_id: str = field(default_factory=lambda: str(uuid4()))
    generation: int = 0
    tick: int = 0
    connected: bool = False
    last_seen: float = field(default_factory=time.monotonic)
    last_command: float = -1.0
    acknowledgments: OrderedDict[str, Ack] = field(default_factory=OrderedDict)

    def view(self) -> SessionView:
        return SessionView(
            session_id=self.session_id,
            generation=self.generation,
            tick=self.tick,
            seed=self.seed,
            scene=preview_scene(self.seed),
        )

    def snapshot(self) -> Snapshot:
        return Snapshot(kind="snapshot", **self.view().model_dump())

    def execute(self, command: ClientMessage) -> Ack:
        self.last_seen = time.monotonic()
        # Request IDs are idempotent: retries must never reset the session twice.
        if command.request_id in self.acknowledgments:
            return self.acknowledgments[command.request_id]
        reason: Rejection | None = None
        if command.session_id != self.session_id:
            reason = "session_mismatch"
        elif command.generation != self.generation:
            reason = "stale_generation"
        elif self.last_seen - self.last_command < 0.1:
            reason = "rate_limited"
        else:
            self.last_command = self.last_seen
            if command.kind == "reset_preview":
                self.seed = command.seed
                self.generation += 1
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
    """Single-process local development registry, capped and idle-expiring."""

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
