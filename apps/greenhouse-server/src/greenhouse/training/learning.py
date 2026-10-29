"""Supervised motor regression plus learned stop, lift and gripper decisions."""

from collections.abc import Callable

import torch
from torch import Tensor, nn

from greenhouse.datasets.models import Episode
from greenhouse.simulation.world import Action, Observation
from greenhouse.training.policy import GRIPS, LIFTS, Network, features


def examples(episodes: list[Episode]) -> tuple[list[list[float]], list[list[float]]]:
    inputs, targets = [], []
    for episode in episodes:
        for frame in episode.frames:
            inputs.append(features(Observation(**frame.observation.model_dump())))
            targets.append(target(Action(**frame.action.model_dump())))
    return inputs, targets


def target(action: Action) -> list[float]:
    return [
        action.throttle,
        action.turn,
        float(abs(action.throttle) > 1e-5),
        float(abs(action.turn) > 1e-5),
        float(min(range(3), key=lambda i: abs(LIFTS[i] - action.lift))),
        float(GRIPS.index(action.grip)),
    ]


def fit(
    network: Network,
    inputs: list[list[float]],
    targets: list[list[float]],
    epochs: int,
    report: Callable[[int, float], None],
    cancelled: Callable[[], bool],
) -> float:
    x, y = torch.tensor(inputs, dtype=torch.float32), torch.tensor(targets, dtype=torch.float32)
    # Rare lift/grip commands must not disappear under thousands of driving/hold
    # labels. Weights are derived exclusively from this frozen training data.
    weights: list[Tensor] = []
    for column in [4, 5]:
        count = torch.bincount(y[:, column].long(), minlength=3).float().clamp_min(1)
        weight = (len(y) / (3 * count)).sqrt().clamp(max=15)
        weights.append(weight)
    positive = y[:, 2:4].sum(dim=0).clamp_min(1)
    pos_weight = ((len(y) - positive) / positive).clamp(0.1, 10)
    optimizer = torch.optim.AdamW(network.parameters(), lr=0.002, weight_decay=1e-5)
    loss_value = 0.0
    network.train()
    for epoch in range(1, epochs + 1):
        if cancelled():
            raise InterruptedError("Training cancelled.")
        order = torch.randperm(len(x))
        total = 0.0
        for offset in range(0, len(order), 256):
            batch = order[offset : offset + 256]
            output = network(x[batch])
            label = y[batch]
            motor = nn.functional.smooth_l1_loss(torch.tanh(output[:, :2]), label[:, :2])
            stopping = nn.functional.binary_cross_entropy_with_logits(
                output[:, 2:4], label[:, 2:4], pos_weight=pos_weight
            )
            lift = nn.functional.cross_entropy(
                output[:, 4:7], label[:, 4].long(), weight=weights[0]
            )
            grip = nn.functional.cross_entropy(
                output[:, 7:10], label[:, 5].long(), weight=weights[1]
            )
            loss = 12 * motor + stopping + lift + grip
            if not torch.isfinite(loss):
                raise FloatingPointError(
                    "Fitting produced a non-finite loss; no checkpoint was published."
                )
            optimizer.zero_grad()
            torch.autograd.backward(loss)
            nn.utils.clip_grad_norm_(network.parameters(), 5)
            optimizer.step()
            total += float(loss.detach()) * len(batch)
        loss_value = total / len(x)
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            report(epoch, loss_value)
    network.eval()
    return loss_value
