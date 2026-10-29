"""Gymnasium adapter: original physics, explicit train-only curriculum and reward ledger."""

import copy
import math
from typing import Any, cast

import gymnasium as gym
import mujoco
import numpy as np
from numpy.typing import NDArray

from greenhouse.simulation.world import Action, World
from greenhouse.training.policy import GRIPS, LIFTS, ActionGrip, features

REWARD_VERSION = "practice-ledger-v1"
CURRICULUM = ("near-pickup", "full-placement", "peripheral-pots")


class CaretakerEnv(gym.Env[NDArray[np.float32], dict[str, Any]]):
    metadata = {"render_modes": []}

    def __init__(self, stage: int = 1):
        if stage not in range(3):
            raise ValueError("Unknown curriculum stage.")
        self.stage = stage
        self.observation_space = gym.spaces.Box(-np.inf, np.inf, (9,), dtype=np.float32)
        self.action_space = gym.spaces.Dict(
            {
                "motors": gym.spaces.Box(-1.0, 1.0, (2,), dtype=np.float32),
                "active": gym.spaces.MultiBinary(2),
                "lift": gym.spaces.Discrete(3),
                "grip": gym.spaces.Discrete(3),
            }
        )
        self.world = World()
        if stage == 2:
            # Never mutate the cached base model used by datasets or live sessions.
            self.world.model = copy.copy(self.world.model)
            self.world.data = mujoco.MjData(self.world.model)
            for name, xy in (("pot-0", (-0.35, 1.30)), ("pot-4", (1.10, -1.25))):
                self.world.model.geom_pos[self.world.model.geom(name).id, :2] = xy
        self.lift_awarded = False
        self.pickup_awarded = False

    def reset(
        self, *, seed: int | None = None, options: dict[str, Any] | None = None
    ) -> tuple[NDArray[np.float32], dict[str, Any]]:
        super().reset(seed=seed)
        # Gym's seed initializes the sampling RNG, not the dataset scenario split.
        scenario = (options or {}).get("scenario_seed", int(self.np_random.integers(0, 100)))
        if (
            not isinstance(scenario, int)
            or isinstance(scenario, bool)
            or scenario not in range(100)
        ):
            raise ValueError("Practice accepts training scenario seeds 0–99 only.")
        self.world.reset(scenario)
        if self.stage == 0:
            rng = np.random.default_rng(scenario)
            self.world.data.qpos[:3] = [
                float(self.world.data.qpos[3]) - float(rng.uniform(0.65, 0.95)),
                float(self.world.data.qpos[4]) + float(rng.uniform(-0.15, 0.15)),
                float(rng.uniform(-0.25, 0.25)),
            ]
            mujoco.mj_forward(self.world.model, self.world.data)
        self.lift_awarded = self.pickup_awarded = False
        self.world.start("PPO training scenario.")
        return np.asarray(features(self.world.observe()), dtype=np.float32), {
            "scenario_seed": scenario,
            "stage": CURRICULUM[self.stage],
        }

    def step(
        self, action: dict[str, Any]
    ) -> tuple[NDArray[np.float32], float, bool, bool, dict[str, Any]]:
        if self.world.status != "running":
            raise RuntimeError("Reset after a terminated or truncated episode.")
        if not self.action_space.contains(action):
            raise ValueError("Action is outside the declared hybrid space.")
        before = self.world.observe()
        invalid, collisions = self.world.invalid_actions, self.world.collisions
        decoded = Action(
            float(action["motors"][0] * action["active"][0]),
            float(action["motors"][1] * action["active"][1]),
            LIFTS[int(action["lift"])],
            cast(ActionGrip, GRIPS[int(action["grip"])]),
        )
        result = self.world.step(decoded)
        after = self.world.observe()
        first_pickup = after.holding and not self.pickup_awarded
        first_lift = after.holding and after.lift_height >= 0.265 and not self.lift_awarded
        components = {
            "progress": max(-0.05, min(0.05, before.distance - after.distance))
            if before.holding == after.holding
            else 0.0,
            "pickup": 0.5 if first_pickup else 0.0,
            "lift": 0.25 if first_lift else 0.0,
            "delivery": 10.0 if self.world.delivered else 0.0,
            "collision": -5.0 * (self.world.collisions - collisions),
            "invalid": -0.1 * (self.world.invalid_actions - invalid),
            "time": -0.005,
            "outside_release": -1.0
            if before.holding and not after.holding and not self.world.delivered
            else 0.0,
        }
        self.pickup_awarded |= first_pickup
        self.lift_awarded |= first_lift
        reward = math.fsum(components.values())
        return (
            np.asarray(features(after), dtype=np.float32),
            reward,
            result.terminated,
            result.truncated,
            {
                "reward_components": components,
                "delivered": self.world.delivered,
                "collisions": self.world.collisions,
                "invalid_actions": self.world.invalid_actions,
            },
        )
