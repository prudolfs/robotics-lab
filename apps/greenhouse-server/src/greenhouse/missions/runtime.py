"""Physical mission execution: continuous robot pose, bounded skills and explicit provenance."""

from __future__ import annotations

import asyncio
import math
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

import mujoco

from greenhouse.datasets.episodes import capture
from greenhouse.datasets.models import StateData
from greenhouse.missions.models import (
    MissionCapsule,
    MissionRequest,
    MissionStatus,
    MissionTrace,
    MissionView,
    SkillName,
)
from greenhouse.missions.skills import align_action, dock_action, dock_error, docked
from greenhouse.simulation.model import LOW_HEIGHT, TRAY, TRAY_RADIUS
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import World

if TYPE_CHECKING:
    from greenhouse.api.sessions import Session
    from greenhouse.training.policy import LearnedPolicy


class MissionRuntime:
    def __init__(
        self,
        session: Session,
        request: MissionRequest,
        policy: LearnedPolicy | None,
        checkpoint_sha256: str | None,
    ):
        self.session = session
        self.world = session.world
        self.request = request
        self.policy = policy
        self.checkpoint_sha256 = checkpoint_sha256
        self.mission_id = uuid4().hex
        self.created_at = datetime.now(UTC).isoformat()
        self.state: MissionStatus = "running"
        self.current_skill: SkillName | None = None
        self.implementation: str | None = None
        self.delivered = self.total_ticks = self.recoveries = 0
        self.collisions = self.invalid_actions = 0
        self.is_docked = False
        self.message = "Observing the greenhouse before selecting a skill."
        self.trace: list[MissionTrace] = []
        self.trace_sequence = 0
        self.capsules = [
            MissionCapsule(
                id=f"mission-capsule-{i + 1}",
                position=World((session.seed + i) % 100).state().capsule,
                status="pending",
            )
            for i in range(request.intent.capsule_count)
        ]
        if self.capsules:
            self.capsules[0] = self.capsules[0].model_copy(
                update={"position": self.world.state().capsule}
            )
        self.final_world: StateData | None = None
        self.prepared_index = -1
        self.skill_ticks = 0
        self.last_progress = 0
        self.best_score = math.inf
        self.previous_holding = False
        self.previous_lift = LOW_HEIGHT
        self.reference = Reference()
        self.result = ""
        self.skill_done = asyncio.Event()
        self.changed = asyncio.Event()
        self.ready = asyncio.Event()
        self.ready.set()

    @property
    def active(self) -> bool:
        return self.state in ("running", "paused")

    def valid_identity(self) -> bool:
        return (
            self.session.session_id == self.request.session_id
            and self.session.generation == self.request.generation
            and self.session.mission is self
        )

    def log(self, node: str, message: str) -> None:
        self.message = message
        self.trace_sequence += 1
        self.trace.append(
            MissionTrace.model_validate(
                {
                    "sequence": self.trace_sequence,
                    "node": node,
                    "skill": self.current_skill,
                    "implementation": self.implementation,
                    "tick": self.total_ticks,
                    "message": message,
                }
            )
        )
        self.trace = self.trace[-96:]
        self.changed.set()
        self.session.revision += 1

    def view(self) -> MissionView:
        state = self.final_world or capture(self.world.state())
        capsules = list(self.capsules)
        if self.prepared_index in range(len(capsules)):
            i = self.prepared_index
            if capsules[i].status == "active":
                capsules[i] = capsules[i].model_copy(update={"position": tuple(state.capsule)})
        return MissionView(
            mission_id=self.mission_id,
            request=self.request,
            state=self.state,
            created_at=self.created_at,
            current_skill=self.current_skill,
            implementation=self.implementation,
            delivered=self.delivered,
            total=len(self.capsules),
            docked=self.is_docked,
            total_ticks=self.total_ticks,
            recoveries=self.recoveries,
            collisions=self.collisions,
            invalid_actions=self.invalid_actions,
            message=self.message,
            trace=self.trace,
            capsules=capsules,
            last_world=state,
            checkpoint_sha256=self.checkpoint_sha256,
        )

    def prepare_capsule(self) -> None:
        if self.prepared_index == self.delivered:
            return
        if self.world.holding:
            raise ValueError("Cannot select a new capsule while holding one.")
        item = self.capsules[self.delivered]
        # Only the next active capsule is materialized in the original one-object
        # physics world. The robot pose/velocity is never reset between objects.
        self.world.data.qpos[3:6] = item.position
        self.world.data.qpos[6:10] = [1, 0, 0, 0]
        self.world.data.qvel[3:] = 0
        self.world.delivered = False
        self.world.pickups = 0
        mujoco.mj_forward(self.world.model, self.world.data)
        self.prepared_index = self.delivered
        self.capsules[self.delivered] = item.model_copy(update={"status": "active"})

    def select(self) -> SkillName:
        if self.delivered >= len(self.capsules):
            return "return_to_dock"
        self.prepare_capsule()
        return "align_target" if abs(self.world.observe().bearing) > 0.65 else "collect_deliver"

    def implementation_for(self, skill: SkillName) -> str:
        return (
            "scripted heading alignment"
            if skill == "align_target"
            else "scripted return-to-dock"
            if skill == "return_to_dock"
            else f"learned checkpoint {self.request.checkpoint_id}"
            if self.request.controller == "learned_policy"
            else "scripted reference collection"
        )

    def begin(self, skill: SkillName) -> None:
        if not self.valid_identity() or not self.session.connected:
            raise ValueError("Mission session/generation is no longer connected and current.")
        self.current_skill = skill
        self.implementation = self.implementation_for(skill)
        if self.world.holding:
            raise ValueError("Skill entry requires an empty gripper.")
        if self.world.collisions:
            raise ValueError("Skill entry requires a collision-free world.")
        if skill == "return_to_dock" and self.delivered != len(self.capsules):
            raise ValueError("Dock entry requires all requested deliveries.")
        if skill == "collect_deliver" and abs(self.world.observe().bearing) > 0.65:
            raise ValueError("Collection entry requires heading alignment.")
        if skill == "collect_deliver" and abs(self.world.lift_height - LOW_HEIGHT) > 0.025:
            raise ValueError("Collection entry requires pickup height.")
        self.reference = Reference()
        self.skill_ticks = self.last_progress = 0
        self.best_score = math.inf
        self.previous_holding = self.world.holding
        self.previous_lift = self.world.lift_height
        self.skill_done.clear()
        self.result = ""
        self.world.tick = 0
        self.world.reason = None
        self.world.status = "paused" if self.state == "paused" else "running"
        self.session.controller = (
            "learned_policy"
            if (skill == "collect_deliver" and self.request.controller == "learned_policy")
            else "scripted_reference"
        )
        self.session.checkpoint_id = (
            self.request.checkpoint_id if self.session.controller == "learned_policy" else None
        )
        self.session.manual_changed_world = True
        self.log("execute", f"Executing {skill}: {self.implementation}.")

    def finish_skill(self, result: str) -> None:
        self.result = result
        self.world.pause("Mission skill boundary.")
        self.skill_done.set()
        self.changed.set()
        self.session.revision += 1

    def advance(self) -> None:
        if not self.active:
            return
        if not self.valid_identity():
            self.invalidate("Session generation changed; old mission commands are invalid.")
            return
        if not self.session.connected:
            self.pause("Viewer disconnected. Explicit resume on the same session is required.")
            return
        if self.state != "running" or not self.current_skill or self.skill_done.is_set():
            return
        if self.total_ticks >= 3600:
            self.finish_skill("mission_budget_exhausted")
            return
        try:
            if self.current_skill == "return_to_dock":
                action = dock_action(self.world)
            elif self.current_skill == "align_target":
                action = align_action(self.world)
            elif self.request.controller == "learned_policy":
                if self.policy is None:
                    raise ValueError("No checked learned actor is loaded.")
                action = self.policy.action(self.world.observe())
            else:
                action = self.reference.action(self.world.observe())
            collisions, invalid = self.world.collisions, self.world.invalid_actions
            self.world.step(action)
            self.collisions += self.world.collisions - collisions
            self.invalid_actions += self.world.invalid_actions - invalid
        except Exception:
            self.finish_skill("policy_or_physics_error")
            return
        self.total_ticks += 1
        self.skill_ticks += 1
        obs = self.world.observe()
        if self.world.collisions:
            self.finish_skill("collision")
            return
        if self.current_skill == "collect_deliver" and self.world.delivered:
            self.finish_skill("success")
            return
        if (
            self.current_skill == "align_target"
            and abs(obs.bearing) <= 0.60
            and abs(obs.yaw_speed) <= 0.12
        ):
            self.finish_skill("success")
            return
        if self.current_skill == "return_to_dock" and docked(self.world):
            self.finish_skill("success")
            return
        score = (
            dock_error(self.world)[0] + 0.15 * abs(dock_error(self.world)[2])
            if self.current_skill == "return_to_dock"
            else abs(obs.bearing)
            if self.current_skill == "align_target"
            else obs.distance
        )
        if (
            score < self.best_score - 0.01
            or obs.holding != self.previous_holding
            or abs(obs.lift_height - self.previous_lift) >= 0.01
        ):
            self.best_score = score
            self.last_progress = self.skill_ticks
            self.previous_holding = obs.holding
            self.previous_lift = obs.lift_height
        if self.skill_ticks - self.last_progress >= 120:
            self.finish_skill("no_progress")
        elif self.skill_ticks >= (160 if self.current_skill == "align_target" else 600):
            self.finish_skill("skill_timeout")
        self.session.revision += 1

    def verify(self) -> bool:
        if self.result != "success" or not self.valid_identity():
            return False
        if self.current_skill == "collect_deliver":
            state = self.world.state()
            if not (
                state.delivered
                and not state.holding
                and math.hypot(state.capsule[0] - TRAY[0], state.capsule[1] - TRAY[1])
                <= TRAY_RADIUS
            ):
                self.result = "unverified_delivery"
                return False
            self.capsules[self.delivered] = self.capsules[self.delivered].model_copy(
                update={"position": state.capsule, "status": "delivered"}
            )
            self.delivered += 1
        elif self.current_skill == "return_to_dock":
            self.is_docked = docked(self.world) and self.delivered == len(self.capsules)
            return self.is_docked
        elif abs(self.world.observe().bearing) > 0.60:
            return False
        return True

    def pause(
        self, message: str = "Mission paused. Resume is explicit and identity-checked."
    ) -> None:
        if self.state != "running":
            return
        self.state = "paused"
        self.ready.clear()
        self.world.pause(message)
        self.log("control", message)

    def resume(self) -> None:
        if self.state != "paused" or not self.valid_identity() or not self.session.connected:
            raise ValueError(
                "Only a paused mission in the same connected session/generation can resume."
            )
        self.state = "running"
        self.ready.set()
        if not self.skill_done.is_set() and self.current_skill:
            self.world.status = "running"
        self.log("control", "Explicitly resumed the current skill; no completed task was replayed.")

    def freeze(self) -> None:
        self.final_world = capture(self.world.state())

    def invalidate(self, message: str, state: MissionStatus = "orphaned") -> None:
        if not self.active:
            return
        self.state = state
        self.ready.set()
        self.world.pause(message)
        self.result = message
        self.skill_done.set()
        self.log("control", message)
        self.freeze()
