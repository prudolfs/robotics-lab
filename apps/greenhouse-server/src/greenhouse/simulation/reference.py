"""Scripted expert over declared observations; deliberately not a learned policy."""

from dataclasses import dataclass
from typing import Literal

from greenhouse.simulation.model import CARRY_HEIGHT, LOW_HEIGHT
from greenhouse.simulation.world import Action, Observation, clamp

Stage = Literal["approach", "grasp", "lift", "deliver", "lower", "release", "done"]


@dataclass
class Reference:
    stage: Stage = "approach"

    def action(self, observation: Observation) -> Action:
        if self.stage in ("approach", "deliver"):
            settled = abs(observation.speed) < 0.025 and abs(observation.yaw_speed) < 0.08
            arrived = observation.distance < 0.385 and abs(observation.bearing) < 0.08
            if arrived and settled:
                self.stage = "grasp" if self.stage == "approach" else "lower"
                return Action()
            throttle = clamp((observation.distance - 0.35) * 2.5, 0, 0.85)
            if abs(observation.bearing) > 0.35 or arrived:
                throttle = 0
            return Action(throttle, clamp(observation.bearing * 2.7, -1, 1))
        if self.stage == "grasp":
            if observation.holding:
                self.stage = "lift"
                return Action()
            return Action(grip="close")
        if self.stage == "lift":
            if observation.lift_height >= CARRY_HEIGHT - 0.003:
                self.stage = "deliver"
                return Action()
            return Action(lift=1)
        if self.stage == "lower":
            if observation.lift_height <= LOW_HEIGHT + 0.003:
                self.stage = "release"
                return Action()
            return Action(lift=-1)
        if self.stage == "release":
            if not observation.holding:
                self.stage = "done"
                return Action()
            return Action(grip="open")
        return Action()
