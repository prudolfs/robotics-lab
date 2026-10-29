"""Learned inference only. No reference controller, task-stage oracle or recovery rules."""

import math
from pathlib import Path
from typing import Literal, cast

import torch
from torch import Tensor, nn

from greenhouse.simulation.world import Action, Observation

GRIPS = ("hold", "close", "open")
LIFTS = (0.0, 1.0, -1.0)


def features(observation: Observation) -> list[float]:
    return [
        observation.target_forward / 4,
        observation.target_left / 4,
        observation.distance / 4,
        math.sin(observation.bearing),
        math.cos(observation.bearing),
        observation.speed / 0.6,
        observation.yaw_speed / 1.6,
        (observation.lift_height - 0.05) / 0.23,
        float(observation.holding),
    ]


class Network(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.layers = nn.Sequential(
            nn.Linear(9, 96), nn.Tanh(), nn.Linear(96, 96), nn.Tanh(), nn.Linear(96, 10)
        )

    def forward(self, inputs: Tensor) -> Tensor:
        return cast(Tensor, self.layers(inputs))


class LearnedPolicy:
    def __init__(self, network: Network):
        self.network = network.eval()

    @torch.inference_mode()
    def action(self, observation: Observation) -> Action:
        output = self.network(torch.tensor(features(observation), dtype=torch.float32))
        # Both the motor values and exact-zero decisions are learned. These
        # categorical decisions are the documented decoder, not state-dependent guards.
        motors = torch.tanh(output[:2]) * (output[2:4] > 0).float()
        return Action(
            float(motors[0]),
            float(motors[1]),
            LIFTS[int(output[4:7].argmax())],
            cast("ActionGrip", GRIPS[int(output[7:10].argmax())]),
        )


# Keep the public Action type from the simulator; checkpoint files contain tensors only.
ActionGrip = Literal["hold", "close", "open"]


def load_weights(path: Path) -> LearnedPolicy:
    if path.stat().st_size > 1024 * 1024:
        raise ValueError("Checkpoint weights exceed the 1 MiB model limit.")
    network = Network()
    state = torch.load(path, map_location="cpu", weights_only=True)
    network.load_state_dict(state, strict=True)
    if not all(torch.isfinite(parameter).all() for parameter in network.parameters()):
        raise ValueError("Checkpoint contains non-finite weights.")
    return LearnedPolicy(network)
