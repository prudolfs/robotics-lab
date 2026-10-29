"""PPO-Clip for the explicit hybrid actor; no expert labels or recovery in practice."""

from collections import Counter
from collections.abc import Callable
from typing import cast

import numpy as np
import torch
from torch import Tensor, nn
from torch.distributions import Bernoulli, Categorical, Normal

from greenhouse.practice.environment import CURRICULUM, CaretakerEnv
from greenhouse.training.models import PracticePoint
from greenhouse.training.policy import Network

CONFIG = {
    "algorithm": "hybrid-ppo-clip-v1",
    "rollout_steps": 1024,
    "minibatch": 256,
    "update_epochs": 4,
    "actor_lr": 0.00003,
    "value_lr": 0.0003,
    "gamma": 0.99,
    "gae_lambda": 0.95,
    "clip": 0.2,
    "target_kl": 0.015,
    "entropy_coefficient": 0.001,
    "gradient_clip": 0.5,
    "initial_motor_log_std": -3.5,
    "curriculum": list(CURRICULUM),
}


class HybridActor(nn.Module):
    def __init__(self, network: Network):
        super().__init__()
        self.network = network
        self.log_std = nn.Parameter(torch.full((2,), -3.5))

    def distribution(self, inputs: Tensor) -> tuple[Normal, Bernoulli, Categorical, Categorical]:
        output = self.network(inputs)
        return (
            Normal(output[..., :2], self.log_std.clamp(-5, -1).exp()),
            Bernoulli(logits=output[..., 2:4]),
            Categorical(logits=output[..., 4:7]),
            Categorical(logits=output[..., 7:10]),
        )

    def sample(self, inputs: Tensor) -> Tensor:
        motor, active, lift, grip = self.distribution(inputs)
        return torch.cat(
            (motor.sample(), active.sample(), lift.sample()[..., None], grip.sample()[..., None]),  # type: ignore[no-untyped-call]
            dim=-1,
        )

    def score(self, inputs: Tensor, actions: Tensor) -> tuple[Tensor, Tensor]:
        motor, active, lift, grip = self.distribution(inputs)
        # Retain sampled latent motors. tanh Jacobians cancel in the probability
        # ratio; this joint latent policy also includes axes gated off by active.
        logp = (
            motor.log_prob(actions[..., :2]).sum(-1)  # type: ignore[no-untyped-call]
            + active.log_prob(actions[..., 2:4]).sum(-1)  # type: ignore[no-untyped-call]
            + lift.log_prob(actions[..., 4].long())  # type: ignore[no-untyped-call]
            + grip.log_prob(actions[..., 5].long())  # type: ignore[no-untyped-call]
        )
        entropy = (
            motor.entropy().sum(-1) + active.entropy().sum(-1) + lift.entropy() + grip.entropy()  # type: ignore[no-untyped-call]
        )
        return logp, entropy


def advantages(
    rewards: Tensor, values: Tensor, next_values: Tensor, terminated: Tensor, ended: Tensor
) -> Tensor:
    """Bootstrap truncations, but never carry GAE across an episode reset."""
    result = torch.zeros_like(rewards)
    carry = torch.tensor(0.0)
    for index in reversed(range(len(rewards))):
        delta = rewards[index] + 0.99 * next_values[index] * (1 - terminated[index]) - values[index]
        carry = delta + 0.99 * 0.95 * (1 - ended[index]) * carry
        result[index] = carry
    return result


def practice(
    network: Network,
    total_steps: int,
    seed: int,
    cancelled: Callable[[], bool],
    report: Callable[[PracticePoint], None],
    checkpoint: Callable[[int, Network], None],
) -> None:
    actor = HybridActor(network)
    value = nn.Sequential(
        nn.Linear(9, 64), nn.Tanh(), nn.Linear(64, 64), nn.Tanh(), nn.Linear(64, 1)
    )
    optimizer = torch.optim.Adam(
        [
            {"params": actor.parameters(), "lr": 0.00003},
            {"params": value.parameters(), "lr": 0.0003},
        ],
        eps=1e-5,
    )
    for stage in range(3):
        env = CaretakerEnv(stage)
        observation, _ = env.reset(seed=seed + stage)
        for update in range(total_steps // 3 // 1024):
            inputs, actions, old_scores, values, next_values, rewards, terminals, ends = (
                [] for _ in range(8)
            )
            ledger: Counter[str] = Counter()
            episodes = deliveries = 0
            for step in range(1024):
                if step % 32 == 0 and cancelled():
                    raise InterruptedError("PPO practice cancelled.")
                x = torch.tensor(observation)
                with torch.no_grad():
                    action = actor.sample(x)
                    old_logp, _ = actor.score(x, action)
                    v = value(x).squeeze(-1)
                raw = action.numpy()
                observation, reward, terminated, truncated, info = env.step(
                    {
                        "motors": np.tanh(raw[:2]),
                        "active": raw[2:4].astype(np.int8),
                        "lift": int(raw[4]),
                        "grip": int(raw[5]),
                    }
                )
                with torch.no_grad():
                    next_v = value(torch.tensor(observation)).squeeze(-1)
                inputs.append(x)
                actions.append(action)
                old_scores.append(old_logp)
                values.append(v)
                next_values.append(next_v)
                rewards.append(reward)
                terminals.append(float(terminated))
                ends.append(float(terminated or truncated))
                ledger.update(info["reward_components"])
                if terminated or truncated:
                    episodes += 1
                    deliveries += int(info["delivered"])
                    observation, _ = env.reset()
            xs, acts, old, vs, nvs = [
                torch.stack(items) for items in (inputs, actions, old_scores, values, next_values)
            ]
            adv = advantages(
                torch.tensor(rewards), vs, nvs, torch.tensor(terminals), torch.tensor(ends)
            )
            returns = adv + vs
            adv = (adv - adv.mean()) / (adv.std(unbiased=False) + 1e-8)
            metrics: dict[str, float] = {}
            for _ in range(4):
                order = torch.randperm(1024)
                stop = False
                for offset in range(0, 1024, 256):
                    batch = order[offset : offset + 256]
                    logp, entropy = actor.score(xs[batch], acts[batch])
                    log_ratio = logp - old[batch]
                    ratio = log_ratio.exp()
                    policy_loss = -torch.minimum(
                        ratio * adv[batch], ratio.clamp(0.8, 1.2) * adv[batch]
                    ).mean()
                    predicted = cast(Tensor, value(xs[batch])).squeeze(-1)
                    value_loss = (predicted - returns[batch]).square().mean()
                    loss = policy_loss + 0.5 * value_loss - 0.001 * entropy.mean()
                    if not torch.isfinite(loss):
                        raise FloatingPointError("Non-finite PPO loss; candidate not published.")
                    kl = float(((ratio - 1) - log_ratio).mean().detach())
                    if kl > 0.015:
                        stop = True
                        break
                    optimizer.zero_grad()
                    torch.autograd.backward(loss)
                    nn.utils.clip_grad_norm_([*actor.parameters(), *value.parameters()], 0.5)
                    optimizer.step()
                    metrics = {
                        "policy_loss": float(policy_loss.detach()),
                        "value_loss": float(value_loss.detach()),
                        "entropy": float(entropy.mean().detach()),
                        "approximate_kl": kl,
                        "clip_fraction": float(((ratio - 1).abs() > 0.2).float().mean().detach()),
                    }
                if stop:
                    break
            if not metrics:
                raise ValueError("PPO update had no finite in-budget minibatch.")
            steps = stage * (total_steps // 3) + (update + 1) * 1024
            report(
                PracticePoint(
                    steps=steps,
                    stage=CURRICULUM[stage],
                    reward_components=dict(ledger),
                    completed_episodes=episodes,
                    deliveries=deliveries,
                    **metrics,
                )
            )
        env.close()
        checkpoint(stage + 1, network)
