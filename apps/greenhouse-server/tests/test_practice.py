import math
import time
from datetime import UTC, datetime

import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient
from gymnasium.utils.env_checker import check_env
from test_training import checkpoint as checkpoint
from test_training import store as store
from test_training import wait_job

from greenhouse.api.main import app
from greenhouse.practice.environment import CaretakerEnv
from greenhouse.practice.final_test import correct_reference, evaluate_sealed, seal
from greenhouse.practice.ppo import HybridActor, advantages, practice
from greenhouse.simulation.model import physics_model
from greenhouse.simulation.reference import Reference
from greenhouse.training.files import atomic_model
from greenhouse.training.models import Job, Rollout, TrainRequest
from greenhouse.training.policy import features


@pytest.mark.parametrize("stage", range(3))
def test_gym_contract_seed_reproduction_and_shared_model_isolation(stage):
    before = physics_model().geom_pos.copy()
    env = CaretakerEnv(stage)
    check_env(env, skip_render_check=True)
    first, _ = env.reset(seed=17)
    second, _ = env.reset(seed=17)
    np.testing.assert_array_equal(first, second)
    np.testing.assert_array_equal(before, physics_model().geom_pos)
    for seed in [10000, 20000, -1, True]:
        with pytest.raises(ValueError, match="training scenario"):
            env.reset(options={"scenario_seed": seed})
    env.reset(seed=7)
    with pytest.raises(ValueError):
        env.step({"motors": np.array([float("nan"), 0], dtype=np.float32)})
    env.close()


@pytest.mark.parametrize("stage", range(3))
def test_curriculum_is_feasible_and_rewards_reconcile_without_repeat_pickup_bonus(stage):
    # All 100 training placements retain complete reference routes with peripheral pots.
    for seed in range(100):
        env = CaretakerEnv(stage)
        env.reset(options={"scenario_seed": seed})
        actor = Reference()
        totals = {}
        while env.world.status == "running":
            action = actor.action(env.world.observe())
            _, reward, terminated, truncated, info = env.step(
                {
                    "motors": np.array([action.throttle, action.turn], dtype=np.float32),
                    "active": np.array([1, 1], dtype=np.int8),
                    "lift": (0.0, 1.0, -1.0).index(action.lift),
                    "grip": ("hold", "close", "open").index(action.grip),
                }
            )
            assert reward == pytest.approx(math.fsum(info["reward_components"].values()))
            for key, value in info["reward_components"].items():
                totals[key] = totals.get(key, 0) + value
        assert terminated and not truncated and env.world.delivered
        assert totals["pickup"] == 0.5 and totals["delivery"] == 10
        assert not env.world.collisions and not env.world.invalid_actions
        with pytest.raises(RuntimeError, match="Reset"):
            env.step(env.action_space.sample())


def test_gae_bootstraps_timeout_but_does_not_leak_across_reset():
    # At truncation bootstrap terminal observation V=3, never next episode advantage.
    adv = advantages(
        torch.tensor([1.0, 100.0]),
        torch.tensor([2.0, 0.0]),
        torch.tensor([3.0, 0.0]),
        torch.tensor([0.0, 1.0]),
        torch.tensor([1.0, 1.0]),
    )
    assert adv.tolist() == pytest.approx([1 + 0.99 * 3 - 2, 100])
    terminal = advantages(
        torch.tensor([1.0]),
        torch.tensor([2.0]),
        torch.tensor([3.0]),
        torch.tensor([1.0]),
        torch.tensor([1.0]),
    )
    assert terminal.item() == -1


def test_hybrid_probability_ratio_and_actual_ppo_updates_have_no_expert_recovery(
    checkpoint, monkeypatch
):
    manager, info, _ = checkpoint
    network = manager.load(info.checkpoint_id).network
    actor = HybridActor(network)
    x = torch.tensor([features(CaretakerEnv().world.observe())] * 16)
    actions = actor.sample(x)
    before, entropy = actor.score(x, actions)
    after, _ = actor.score(x, actions)
    assert torch.allclose((after - before).exp(), torch.ones(16))
    assert torch.isfinite(entropy).all()
    params = [parameter.detach().clone() for parameter in network.parameters()]
    points, candidates = [], []
    monkeypatch.setattr(
        Reference, "action", lambda *args: (_ for _ in ()).throw(AssertionError("expert"))
    )
    practice(network, 3072, 7, lambda: False, points.append, lambda i, net: candidates.append(i))
    assert len(points) == 3 and candidates == [1, 2, 3] and points[-1].steps == 3072
    assert any(
        not torch.equal(old, new) for old, new in zip(params, network.parameters(), strict=True)
    )
    with pytest.raises(InterruptedError):
        practice(network, 3072, 7, lambda: True, points.append, lambda *args: None)


def test_ppo_worker_requires_parent_and_persists_practice_and_same_seed_comparison(
    checkpoint, monkeypatch
):
    manager, info, _ = checkpoint
    monkeypatch.setenv("GREENHOUSE_DATASET_DIR", str(manager.datasets.root))
    monkeypatch.setenv("GREENHOUSE_TRAINING_DIR", str(manager.root))
    with TestClient(app) as client:
        prefix = "/api/v1/greenhouse/training"
        assert client.post(prefix + "/jobs", json={"algorithm": "ppo"}).status_code == 422
        started = client.post(
            prefix + "/jobs",
            json={
                "algorithm": "ppo",
                "parent_checkpoint": info.checkpoint_id,
                "ppo_steps": 3072,
                "budget_seconds": 90,
            },
        )
        assert started.status_code == 201, started.text
        key = started.json()["job_id"]
        assert client.get("/api/v1/greenhouse/health").status_code == 200
        result = wait_job(client, key, "completed", timeout=40)
        assert result["practice_steps"] == 3072 and len(result["practice_history"]) == 3
        assert len(result["checkpoints"]) == 4
        actual = client.get(prefix + f"/checkpoints/{key}-r1").json()
        assert actual["checkpoint"]["parent_checkpoint"] == info.checkpoint_id
        assert actual["checkpoint"]["algorithm"] == "ppo"
        assert actual["checkpoint"]["practice_steps"] == 1024
        for seed in (0, 20000):
            assert (
                client.post(
                    prefix + "/compare",
                    json={"seed": seed, "checkpoint_ids": [info.checkpoint_id, key + "-r1"]},
                ).status_code
                == 422
            )
        assert (
            client.post(
                prefix + "/compare",
                json={"seed": 10000, "checkpoint_ids": [info.checkpoint_id] * 2},
            ).status_code
            == 422
        )
        compared = client.post(
            prefix + "/compare",
            json={"seed": 10000, "checkpoint_ids": [info.checkpoint_id, key + "-r1"]},
        )
        assert compared.status_code == 200, compared.text
        entries = compared.json()["entries"]
        assert len(entries) == 3
        assert entries[0]["rollout"]["initial"] == entries[1]["rollout"]["initial"]
        assert entries[1]["rollout"]["initial"] == entries[2]["rollout"]["initial"]
        assert entries[2]["rollout"]["success"]
        for _ in range(100):
            if app.state.training.active_job is None:
                break
            time.sleep(0.01)
        cancelled = client.post(
            prefix + "/jobs",
            json={
                "algorithm": "ppo",
                "parent_checkpoint": info.checkpoint_id,
                "ppo_steps": 98304,
                "budget_seconds": 90,
            },
        ).json()
        client.post(prefix + f"/jobs/{cancelled['job_id']}/cancel")
        wait_job(client, cancelled["job_id"], "cancelled")


def test_final_test_seal_freezes_selection_checks_integrity_and_is_one_shot(
    checkpoint, tmp_path, monkeypatch
):
    manager, parent, weights = checkpoint
    key = "b" * 32
    directory = manager.directory(key)
    directory.mkdir()
    candidate = parent.model_copy(
        update={
            "job_id": key,
            "checkpoint_id": key + "-r1",
            "round": 1,
            "algorithm": "ppo",
            "practice_steps": 1024,
            "parent_checkpoint": parent.checkpoint_id,
        }
    )
    (directory / "r1.pt").write_bytes(weights.read_bytes())
    atomic_model(directory / "r1.checkpoint.json", candidate)
    atomic_model(
        directory / "status.json",
        Job(
            job_id=key,
            state="completed",
            phase="finished",
            request=TrainRequest(
                algorithm="ppo", parent_checkpoint=parent.checkpoint_id, ppo_steps=3072
            ),
            created_at=datetime.now(UTC).isoformat(),
            checkpoints=[candidate.checkpoint_id],
            message="test",
        ),
    )
    path = tmp_path / "test-seal.json"
    manifest = seal(manager.root, path, [key])
    assert manifest["test_seeds"] == list(range(20000, 20100))
    assert manifest["selected_checkpoint"] == parent.checkpoint_id  # Tie preserves original.
    with pytest.raises(ValueError, match="already exists"):
        seal(manager.root, path, [key])
    import inspect
    from pathlib import Path

    (path.parent / "original-runner.py").write_bytes(Path(inspect.getfile(seal)).read_bytes())
    called = []
    references = []

    def fake_rollout(seed, actor, *, final_test=False):
        assert final_test and 20000 <= seed <= 20099
        called.append(seed)
        if isinstance(actor, Reference):
            references.append(actor)
        return Rollout(
            seed=seed,
            success=False,
            clean_success=False,
            ticks=600,
            seconds=30.0,
            collisions=0,
            invalid_actions=0,
            failure="pickup_not_completed",
        )

    monkeypatch.setattr("greenhouse.practice.final_test.rollout", fake_rollout)
    report = evaluate_sealed(manager.root, path)
    assert len(called) == 300 and not report["selection_changed_after_test"]
    assert len(references) == len({id(actor) for actor in references}) == 100
    with pytest.raises(FileExistsError):
        evaluate_sealed(manager.root, path)
    corrected = correct_reference(manager.root, path)
    assert corrected["results"][1:] == report["results"][1:]
    assert corrected["audit_correction"]["learned_results_rerun"] is False
    with pytest.raises(FileExistsError):
        correct_reference(manager.root, path)
    corrupt = tmp_path / "corrupt-seal.json"
    seal(manager.root, corrupt, [key])
    (directory / "r1.pt").write_bytes(b"changed")
    with pytest.raises(ValueError, match="checksum"):
        evaluate_sealed(manager.root, corrupt)
    assert not corrupt.with_suffix(".started").exists()
