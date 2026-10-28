"""A deterministic, headless collection environment with an explicit abstract grasp.

MuJoCo handles body motion and contacts. Pickup attaches a capsule at a checked
gripper pose; fingers, motor dynamics and carried-load forces are not simulated.
"""

import math
import random
from collections import deque
from dataclasses import dataclass
from typing import Literal

import mujoco

from greenhouse.simulation.model import (
    CARRY_HEIGHT,
    LIFT_SPEED,
    LOW_HEIGHT,
    MAX_TICKS,
    PHYSICS_DT,
    REACH,
    SIM_VERSION,
    SUBSTEPS,
    TRAY,
    TRAY_RADIUS,
    WHEEL_RADIUS,
    physics_model,
)

Status = Literal["ready", "running", "paused", "complete", "failed"]


@dataclass(frozen=True)
class Action:
    throttle: float = 0.0
    turn: float = 0.0
    lift: float = 0.0
    grip: Literal["hold", "close", "open"] = "hold"


@dataclass(frozen=True)
class Observation:
    """Oracle relative target pose and exact robot state, not image perception."""

    target_forward: float
    target_left: float
    distance: float
    bearing: float
    speed: float
    yaw_speed: float
    lift_height: float
    holding: bool


@dataclass(frozen=True)
class Event:
    tick: int
    kind: Literal["info", "success", "warning"]
    text: str


@dataclass(frozen=True)
class State:
    version: str
    seed: int
    tick: int
    status: Status
    x: float
    y: float
    heading: float
    speed: float
    yaw_speed: float
    lift_height: float
    left_wheel_angle: float
    right_wheel_angle: float
    holding: bool
    capsule: tuple[float, float, float]
    delivered: bool
    pickups: int
    collisions: int
    invalid_actions: int
    reason: str | None
    events: tuple[Event, ...]


@dataclass(frozen=True)
class Step:
    observation: Observation
    reward: float
    terminated: bool
    truncated: bool


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


class World:
    def __init__(self, seed: int = 42):
        self.model = physics_model()
        self.data = mujoco.MjData(self.model)
        self.robot_geoms = {
            self.model.geom(name).id for name in ("chassis", "wheel-left", "wheel-right")
        }
        self.capsule_geom = self.model.geom("capsule-geom").id
        self.floor_geom = self.model.geom("floor").id
        self.events: deque[Event] = deque(maxlen=16)
        self.reset(seed)

    def reset(self, seed: int) -> Observation:
        if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed <= 2_147_483_647:
            raise ValueError("Seed must be an integer in [0, 2147483647].")
        rng = random.Random(seed)
        mujoco.mj_resetData(self.model, self.data)
        # Straight-line reference paths remain inside the central clear corridor.
        self.data.qpos[:3] = [rng.uniform(-1.6, -0.8), rng.uniform(-0.7, 0.7), rng.uniform(-1, 1)]
        self.data.qpos[3:6] = [rng.uniform(-0.1, 0.65), rng.uniform(-0.7, 0.7), LOW_HEIGHT]
        self.data.qpos[6:10] = [1, 0, 0, 0]
        self.seed = seed
        self.tick = 0
        self.status: Status = "ready"
        self.lift_height = LOW_HEIGHT
        self.holding = self.delivered = False
        self.pickups = self.collisions = self.invalid_actions = 0
        self.left_wheel_angle = self.right_wheel_angle = 0.0
        self.reason: str | None = None
        self.events.clear()
        self.event("info", "Ready to collect the seed capsule.")
        mujoco.mj_forward(self.model, self.data)
        return self.observe()

    def event(self, kind: Literal["info", "success", "warning"], text: str) -> None:
        self.events.append(Event(self.tick, kind, text))

    def start(self) -> bool:
        if self.status not in ("ready", "paused"):
            return False
        self.status = "running"
        self.event("info", "Scripted reference controller running.")
        return True

    def pause(self, reason: str = "Collection paused.") -> bool:
        if self.status != "running":
            return False
        self.status = "paused"
        self.event("info", reason)
        return True

    def tip(self) -> tuple[float, float]:
        x, y, heading = (float(value) for value in self.data.qpos[:3])
        return x + REACH * math.cos(heading), y + REACH * math.sin(heading)

    def observe(self) -> Observation:
        x, y, heading = (float(value) for value in self.data.qpos[:3])
        target = TRAY if self.holding else self.data.qpos[3:5]
        dx, dy = float(target[0]) - x, float(target[1]) - y
        c, s = math.cos(heading), math.sin(heading)
        forward, left = c * dx + s * dy, -s * dx + c * dy
        vx, vy, omega = (float(value) for value in self.data.qvel[:3])
        return Observation(
            forward,
            left,
            math.hypot(dx, dy),
            math.atan2(left, forward),
            c * vx + s * vy,
            omega,
            self.lift_height,
            self.holding,
        )

    def state(self) -> State:
        observation = self.observe()
        return State(
            SIM_VERSION,
            self.seed,
            self.tick,
            self.status,
            float(self.data.qpos[0]),
            float(self.data.qpos[1]),
            float(self.data.qpos[2]),
            observation.speed,
            observation.yaw_speed,
            self.lift_height,
            self.left_wheel_angle,
            self.right_wheel_angle,
            self.holding,
            (float(self.data.qpos[3]), float(self.data.qpos[4]), float(self.data.qpos[5])),
            self.delivered,
            self.pickups,
            self.collisions,
            self.invalid_actions,
            self.reason,
            tuple(self.events),
        )

    def attach(self) -> None:
        self.data.qpos[3:6] = [*self.tip(), self.lift_height]
        self.data.qpos[6:10] = [1, 0, 0, 0]
        self.data.qvel[3:] = 0

    def reject(self, reason: str) -> None:
        self.invalid_actions += 1
        if not self.events or self.events[-1].text != reason:
            self.event("warning", reason)

    def collision(self) -> bool:
        for contact in self.data.contact:
            a, b = int(contact.geom1), int(contact.geom2)
            if a == self.floor_geom or b == self.floor_geom:
                continue
            active = self.robot_geoms | ({self.capsule_geom} if self.holding else set())
            if (a in active) != (b in active):
                return True
        return False

    def step(self, action: Action) -> Step:
        if not all(math.isfinite(value) for value in (action.throttle, action.turn, action.lift)):
            raise ValueError("Actions must be finite.")
        if action.grip not in ("hold", "close", "open"):
            raise ValueError("Unknown gripper action.")
        if self.status != "running":
            timed_out = self.reason == "Collection timed out after 30 simulated seconds."
            return Step(
                self.observe(),
                0,
                self.status in ("complete", "failed") and not timed_out,
                timed_out,
            )
        before = self.observe()
        throttle, turn, lift = (
            clamp(value, -1, 1) for value in (action.throttle, action.turn, action.lift)
        )
        for _ in range(SUBSTEPS):
            heading = float(self.data.qpos[2])
            self.data.ctrl[:] = [
                0.6 * throttle * math.cos(heading),
                0.6 * throttle * math.sin(heading),
                1.6 * turn,
            ]
            self.lift_height = clamp(
                self.lift_height + lift * LIFT_SPEED * PHYSICS_DT, LOW_HEIGHT, CARRY_HEIGHT
            )
            mujoco.mj_step(self.model, self.data)
            if self.holding:
                self.attach()
                mujoco.mj_forward(self.model, self.data)
            observed = self.observe()
            # Wheel angles present measured body velocity; no rolling/slip claim.
            self.left_wheel_angle += (
                (observed.speed - observed.yaw_speed * 0.22) * PHYSICS_DT / WHEEL_RADIUS
            )
            self.right_wheel_angle += (
                (observed.speed + observed.yaw_speed * 0.22) * PHYSICS_DT / WHEEL_RADIUS
            )
            if self.collision():
                self.collisions += 1
                self.reason = "Collision with a greenhouse boundary or pot."
                self.status = "failed"
                self.event("warning", self.reason)
                break
        self.tick += 1
        reward = -0.001
        if self.status == "failed":
            return Step(self.observe(), -5, True, False)
        observation = self.observe()
        measured_speed = math.hypot(float(self.data.qvel[0]), float(self.data.qvel[1]))
        stationary = measured_speed <= 0.035 and abs(observation.yaw_speed) <= 0.12
        if action.grip == "close" and not self.holding:
            tx, ty = self.tip()
            error = math.hypot(tx - float(self.data.qpos[3]), ty - float(self.data.qpos[4]))
            height_error = abs(self.lift_height - float(self.data.qpos[5]))
            if not stationary:
                self.reject("Stop moving before closing the gripper.")
            elif error > 0.085 or abs(observation.bearing) > 0.18 or height_error > 0.025:
                self.reject("Align the gripper with the capsule at pickup height.")
            else:
                self.holding = True
                self.pickups += 1
                self.attach()
                mujoco.mj_forward(self.model, self.data)
                self.event("success", "Capsule secured in the gripper.")
                reward += 1
        elif action.grip == "open" and self.holding:
            if not stationary or self.lift_height > LOW_HEIGHT + 0.015:
                self.reject("Stop and lower the capsule before releasing it.")
            else:
                self.attach()
                self.holding = False
                self.delivered = (
                    math.hypot(
                        float(self.data.qpos[3]) - TRAY[0], float(self.data.qpos[4]) - TRAY[1]
                    )
                    <= TRAY_RADIUS
                )
                mujoco.mj_forward(self.model, self.data)
                if self.delivered:
                    self.status = "complete"
                    self.event("success", "Seed capsule delivered to the collection tray.")
                    reward += 10
                else:
                    self.event("warning", "Capsule released outside the collection tray.")
        if self.holding == before.holding:
            reward += before.distance - self.observe().distance
        if self.tick >= MAX_TICKS and self.status == "running":
            self.status = "failed"
            self.reason = "Collection timed out after 30 simulated seconds."
            self.event("warning", self.reason)
        timed_out = self.reason == "Collection timed out after 30 simulated seconds."
        return Step(
            self.observe(),
            reward,
            self.status in ("complete", "failed") and not timed_out,
            timed_out,
        )
