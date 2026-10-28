"""Phase 0 only: a hybrid MuJoCo task, behavioral cloning and snapshot export.

No API server or production app. Idealized object sensing and constrained pickup
are deliberate; this probe does not claim to learn physical grasp mechanics.
"""

import argparse
import hashlib
import json
import math
import platform
import time
from pathlib import Path

import mujoco
import numpy as np
import torch
from torch import nn

ROOT = Path(__file__).resolve().parent
REPORTS = ROOT.parent.parent / "docs/greenhouse-demo/phase0"
DT = 0.05
SUBSTEPS = 10
TRAY = np.array([1.65, 0.65])
REACH = 0.34
OBSERVATIONS = [
    "target_forward_m / 4", "target_left_m / 4", "sin_bearing", "cos_bearing",
    "target_range_m / 4", "forward_velocity / 0.6", "left_velocity / 0.6",
    "yaw_velocity / 1.6", "holding",
]
XML = """
<mujoco model="greenhouse-phase0">
  <option timestep="0.005" integrator="implicitfast"/>
  <default><geom friction="0.8 0.01 0.001"/></default>
  <worldbody>
    <geom name="floor" type="plane" size="3 2 0.1" contype="3" conaffinity="3"/>
    <geom name="wall-north" type="box" pos="0 2.05 0.25" size="3.1 0.05 0.25"/>
    <geom name="wall-south" type="box" pos="0 -2.05 0.25" size="3.1 0.05 0.25"/>
    <geom name="wall-east" type="box" pos="3.05 0 0.25" size="0.05 2 0.25"/>
    <geom name="wall-west" type="box" pos="-3.05 0 0.25" size="0.05 2 0.25"/>
    <body name="robot" pos="0 0 0.18">
      <joint name="x" type="slide" axis="1 0 0" damping="1"/>
      <joint name="y" type="slide" axis="0 1 0" damping="1"/>
      <joint name="yaw" type="hinge" axis="0 0 1" damping="0.3"/>
      <geom name="chassis" type="cylinder" size="0.23 0.14" mass="2" contype="1" conaffinity="1"/>
    </body>
    <body name="capsule" pos="0 0 0.05">
      <freejoint name="capsule-free"/>
      <geom name="capsule-geom" type="sphere" size="0.05" mass="0.04" contype="2" conaffinity="2"/>
    </body>
  </worldbody>
  <actuator>
    <velocity joint="x" kv="40" ctrlrange="-0.6 0.6" forcerange="-10 10"/>
    <velocity joint="y" kv="40" ctrlrange="-0.6 0.6" forcerange="-10 10"/>
    <velocity joint="yaw" kv="5" ctrlrange="-1.6 1.6" forcerange="-3 3"/>
  </actuator>
</mujoco>
"""


class Environment:
    """Small prototype object; simulation owns state, not React or transport."""

    def __init__(self):
        self.model = mujoco.MjModel.from_xml_string(XML)
        self.data = mujoco.MjData(self.model)
        self.chassis = self.model.geom("chassis").id
        self.reset(0)

    def reset(self, seed):
        rng = np.random.default_rng(seed)
        mujoco.mj_resetData(self.model, self.data)
        self.data.qpos[:3] = [rng.uniform(-1.6, -0.8), rng.uniform(-0.7, 0.7), rng.uniform(-1, 1)]
        self.data.qpos[3:6] = [rng.uniform(-0.1, 0.65), rng.uniform(-0.7, 0.7), 0.05]
        self.data.qpos[6:10] = [1, 0, 0, 0]
        self.seed, self.tick = int(seed), 0
        self.holding = self.success = False
        self.pickups = self.invalid = self.collisions = 0
        self.in_contact = False
        mujoco.mj_forward(self.model, self.data)
        return self.observe()

    def target(self):
        return TRAY if self.holding else self.data.qpos[3:5].copy()

    def tip(self):
        heading = self.data.qpos[2]
        return self.data.qpos[:2] + REACH * np.array([math.cos(heading), math.sin(heading)])

    def observe(self):
        heading = self.data.qpos[2]
        c, s = math.cos(heading), math.sin(heading)
        dx, dy = self.target() - self.data.qpos[:2]
        forward, left = c * dx + s * dy, -s * dx + c * dy
        distance = math.hypot(forward, left)
        bearing = math.atan2(left, forward)
        vx, vy, yaw = self.data.qvel[:3]
        return np.array([
            forward / 4, left / 4, math.sin(bearing), math.cos(bearing), distance / 4,
            (c * vx + s * vy) / 0.6, (-s * vx + c * vy) / 0.6,
            yaw / 1.6, float(self.holding),
        ], dtype=np.float32)

    def step(self, action):
        v, omega, grip = np.clip(action, -1, 1)
        heading = self.data.qpos[2]
        # Ideal differential-drive velocity targets through planar servo joints.
        self.data.ctrl[:] = [0.6 * v * math.cos(heading), 0.6 * v * math.sin(heading), 1.6 * omega]
        for _ in range(SUBSTEPS):
            mujoco.mj_step(self.model, self.data)
            if self.holding:
                self.data.qpos[3:6] = [*self.tip(), 0.28]
                self.data.qpos[6:10] = [1, 0, 0, 0]
                self.data.qvel[3:] = 0
                mujoco.mj_forward(self.model, self.data)
        contact = any(
            self.chassis in (item.geom1, item.geom2) and
            self.model.geom(item.geom1 if item.geom2 == self.chassis else item.geom2).name != "floor"
            for item in self.data.contact
        )
        self.collisions += int(contact and not self.in_contact)
        self.in_contact = contact
        if grip > 0.5 and not self.holding:
            if np.linalg.norm(self.tip() - self.data.qpos[3:5]) < 0.10 and abs(v) < 0.25:
                self.holding = True
                self.pickups += 1
            else:
                self.invalid += 1
        elif grip < -0.5 and self.holding:
            self.holding = False
            self.success = bool(np.linalg.norm(self.tip() - TRAY) < 0.20 and abs(v) < 0.25)
            self.data.qpos[3:6] = [*self.tip(), 0.05]
            self.data.qvel[3:] = 0
            mujoco.mj_forward(self.model, self.data)
        self.tick += 1
        terminated = self.success or self.collisions > 0
        truncated = self.tick >= 600
        return self.observe(), terminated, truncated

    def snapshot(self):
        return {
            "version": 1, "generation": self.seed, "tick": self.tick, "time": self.tick * DT,
            "robot": {"id": "caretaker", "x": float(self.data.qpos[0]),
                      "y": float(self.data.qpos[1]), "heading": float(self.data.qpos[2]),
                      "holding": self.holding},
            "capsule": {"id": "capsule-1", "position": self.data.qpos[3:6].tolist()},
            "tray": {"id": "collection-tray", "position": [*TRAY.tolist(), 0.04]},
            "success": self.success,
        }


def expert(observation):
    distance = observation[4] * 4
    bearing = math.atan2(observation[2], observation[3])
    v = np.clip((distance - 0.36) * 2.5, 0, 0.85)
    if abs(bearing) > 0.35:
        v = 0
    omega = np.clip(bearing * 2.7, -1, 1)
    grip = 0
    if distance < 0.40 and abs(bearing) < 0.12:
        v = 0
        grip = -1 if observation[8] else 1
    return np.array([v, omega, grip], dtype=np.float32)


def rollout(env, seed, controller, record=False, collect=False):
    observation = env.reset(seed)
    frames, observations, actions = [], [], []
    started = time.perf_counter()
    for _ in range(600):
        action = controller(observation)
        if collect:
            observations.append(observation)
            actions.append(action)
        if record:
            frames.append(env.snapshot())
        observation, terminated, truncated = env.step(action)
        if terminated or truncated:
            break
    if record:
        frames.append(env.snapshot())
    return {
        "seed": seed, "success": env.success, "pickups": env.pickups,
        "collisions": env.collisions, "invalid_grasps": env.invalid,
        "simulated_seconds": env.tick * DT, "steps": env.tick,
        "wall_seconds": time.perf_counter() - started,
        "failure": None if env.success else "collision" if env.collisions else "timeout",
    }, frames, observations, actions


def make_policy():
    return nn.Sequential(nn.Linear(9, 64), nn.Tanh(), nn.Linear(64, 64), nn.Tanh(), nn.Linear(64, 3), nn.Tanh())


def controller_for(policy):
    def control(observation):
        with torch.inference_mode():
            return policy(torch.from_numpy(observation)).numpy()
    return control


def summarize(results):
    return {
        "episodes": len(results), "successes": sum(item["success"] for item in results),
        "pickups": sum(item["pickups"] > 0 for item in results),
        "collisions": sum(item["collisions"] for item in results),
        "invalid_grasps": sum(item["invalid_grasps"] for item in results),
        "mean_simulated_seconds": float(np.mean([item["simulated_seconds"] for item in results])),
        "control_steps_per_second": sum(item["steps"] for item in results) / sum(item["wall_seconds"] for item in results),
    }


def checks(env):
    a = rollout(env, 42, expert, record=True)[1]
    b = rollout(env, 42, expert, record=True)[1]
    assert a == b, "Same seed and commands must reproduce snapshots on this setup"
    env.reset(42)
    for _ in range(40):
        env.step([0, 0, 0])
    capsule_height = float(env.data.qpos[5])
    assert 0.045 < capsule_height < 0.055, "Capsule must remain in contact with the floor"
    env.reset(42)
    env.data.qpos[:3] = [2.70, 0, 0]
    mujoco.mj_forward(env.model, env.data)
    for _ in range(100):
        env.step([1, 0, 0])
    wall_bound = float(env.data.qpos[0])
    assert env.collisions > 0 and wall_bound < 2.82
    env.reset(42)
    env.step([0, 0, 1])
    assert not env.holding and env.invalid == 1
    env.reset(42)
    assert not env.holding and env.invalid == 0 and env.tick == 0
    env.data.qpos[3:6] = [*env.tip(), 0.05]
    mujoco.mj_forward(env.model, env.data)
    env.step([0, 0, 1])
    assert env.holding
    env.step([0, 0, 0])
    assert abs(env.data.qpos[5] - 0.28) < 1e-9
    env.step([0, 0, -1])
    assert not env.holding and not env.success
    return {"same_seed_exact_snapshots": True, "wall_contact_blocks_motion": True,
            "wall_robot_x": wall_bound, "invalid_grasp_rejected": True,
            "reset_clears_state": True, "carry_and_outside_tray_release": True,
            "capsule_floor_contact": True, "resting_capsule_height": capsule_height}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--training-seeds", type=int, default=100)
    args = parser.parse_args()
    REPORTS.mkdir(parents=True, exist_ok=True)
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    torch.set_num_threads(1)
    torch.manual_seed(7)
    np.random.seed(7)
    env = Environment()
    verification = checks(env)
    train_seeds = list(range(args.training_seeds))
    validation_seeds = list(range(10000, 10030))
    # Final test seeds are reserved in contract.json and never evaluated here.
    print("Collecting expert demonstrations", flush=True)
    x, y, expert_results = [], [], []
    for seed in train_seeds:
        result, _, observations, actions = rollout(env, seed, expert, collect=True)
        expert_results.append(result)
        x.extend(observations)
        y.extend(actions)
    x, y = np.array(x), np.array(y)
    # Include local training-state corrections around grasp/release boundaries.
    rng = np.random.default_rng(7)
    extra = []
    for _ in range(12000):
        angle = rng.uniform(-math.pi, math.pi)
        distance = rng.uniform(0.28, 3.8)
        bearing = rng.uniform(-math.pi, math.pi)
        env.reset(int(rng.integers(0, args.training_seeds)))
        env.data.qpos[:3] = [0, 0, angle]
        env.holding = bool(rng.integers(0, 2))
        if env.holding:
            env.data.qpos[:2] = TRAY - distance * np.array([math.cos(angle + bearing), math.sin(angle + bearing)])
        else:
            env.data.qpos[3:5] = distance * np.array([math.cos(angle + bearing), math.sin(angle + bearing)])
        env.data.qvel[:3] = [rng.uniform(-0.1, 0.4), rng.uniform(-0.1, 0.1), rng.uniform(-0.8, 0.8)]
        extra.append(env.observe())
    extra = np.array(extra)
    x = np.concatenate([x, extra])
    y = np.concatenate([y, np.array([expert(item) for item in extra])])
    # Transition examples are rare in successful rollouts; weight them explicitly.
    transition_indices = np.flatnonzero(np.abs(y[:, 2]) > 0.5)
    x = np.concatenate([x, np.repeat(x[transition_indices], 30, axis=0)])
    y = np.concatenate([y, np.repeat(y[transition_indices], 30, axis=0)])
    xt, yt = torch.from_numpy(x).float(), torch.from_numpy(y).float()
    dataset_hash = hashlib.sha256(x.tobytes() + y.tobytes()).hexdigest()
    np.savez_compressed(artifacts / "demonstrations.npz", observations=x, actions=y)
    print(f"Training on {len(x)} examples; validation seeds 10000..10029", flush=True)
    policy = make_policy()
    initial = [rollout(env, seed, controller_for(policy))[0] for seed in validation_seeds]
    optimizer = torch.optim.Adam(policy.parameters(), lr=0.002)
    started = time.perf_counter()
    history, best, best_score = [], None, -1
    for epoch in range(args.epochs):
        order = torch.randperm(len(xt))
        losses = []
        for ids in order.split(512):
            prediction = policy(xt[ids])
            loss = ((prediction - yt[ids]) ** 2 * torch.tensor([1.0, 1.0, 2.0])).mean()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(loss.item())
        if (epoch + 1) % 10 == 0 or epoch == args.epochs - 1:
            results = [rollout(env, seed, controller_for(policy))[0] for seed in validation_seeds]
            summary = summarize(results)
            history.append({"epoch": epoch + 1, "loss": float(np.mean(losses)), "validation": summary})
            score = summary["successes"] * 100 - summary["mean_simulated_seconds"]
            if score > best_score:
                best_score = score
                best = {key: value.clone() for key, value in policy.state_dict().items()}
            print(json.dumps(history[-1]), flush=True)
    train_wall = time.perf_counter() - started
    policy.load_state_dict(best)
    policy.eval()
    torch.save({"state_dict": policy.state_dict(), "dataset_sha256": dataset_hash,
                "observations": OBSERVATIONS, "simulator": "phase0-v1"}, artifacts / "policy.pt")
    final = [rollout(env, seed, controller_for(policy))[0] for seed in validation_seeds]
    reference = [rollout(env, seed, expert)[0] for seed in validation_seeds]
    report = {
        "platform": platform.platform(), "machine": platform.machine(),
        "python": platform.python_version(), "mujoco": mujoco.__version__, "torch": torch.__version__,
        "numpy": np.__version__, "device": "cpu", "training_seed": 7,
        "training_examples": len(x), "dataset_sha256": dataset_hash,
        "training_seconds_including_validation": train_wall, "checks": verification,
        "expert_training": summarize(expert_results), "expert_validation": summarize(reference),
        "initial_policy_validation": summarize(initial), "learned_validation": summarize(final),
        "validation_episodes": final, "history": history,
        "final_test_evaluated": False,
    }
    (REPORTS / "learning-probe.json").write_text(json.dumps(report, indent=2) + "\n")
    chosen = next((item["seed"] for item in final if item["success"]), validation_seeds[0])
    _, frames, _, _ = rollout(env, chosen, controller_for(policy), record=True)
    # Keep every second control snapshot: 10 Hz, render interpolation in browser.
    recording = {"kind": "recorded-python-policy", "source": "MuJoCo / PyTorch Phase 0",
                 "seed": chosen, "dt": DT * 2, "frames": frames[::2],
                 "final": frames[-1], "observation_assumptions": "ideal relative target pose"}
    (REPORTS / "python-snapshots.json").write_text(json.dumps(recording, separators=(",", ":")) + "\n")
    print(json.dumps({"expert": report["expert_validation"], "initial": report["initial_policy_validation"],
                      "learned": report["learned_validation"], "training_seconds": train_wall}, indent=2))
    if report["expert_validation"]["successes"] < 30:
        raise SystemExit("Reference controller feasibility failed")


if __name__ == "__main__":
    main()
