import os
import time

import pytest
import torch
from fastapi.testclient import TestClient

from greenhouse.api.contracts import client_adapter
from greenhouse.api.main import app
from greenhouse.api.sessions import Session
from greenhouse.datasets.episodes import configuration
from greenhouse.datasets.models import Review
from greenhouse.datasets.store import DatasetStore
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import Action, World
from greenhouse.training.corrections import collect
from greenhouse.training.evaluation import rollout
from greenhouse.training.files import atomic_model, sha256
from greenhouse.training.learning import fit
from greenhouse.training.manager import TrainingManager
from greenhouse.training.models import CheckpointInfo, EvaluationSummary, TrainRequest
from greenhouse.training.policy import LearnedPolicy, Network, features
from greenhouse.training.spec import ARCHITECTURE, FEATURES, POLICY_VERSION

torch.set_num_threads(1)


@pytest.fixture
def store(tmp_path):
    store = DatasetStore(tmp_path / "datasets")
    store.collect_experts([0])
    return store


@pytest.fixture
def checkpoint(tmp_path, store):
    manager = TrainingManager(tmp_path / "training", store)
    identifier = "a" * 32
    directory = manager.directory(identifier)
    directory.mkdir()
    weights = directory / "r0.pt"
    torch.manual_seed(7)
    torch.save(Network().state_dict(), weights)
    summary = EvaluationSummary(
        successes=0,
        clean_successes=0,
        collisions=0,
        invalid_actions=0,
        mean_seconds=30,
        failure_counts={"pickup_not_completed": 30},
    )
    info = CheckpointInfo(
        checkpoint_id=f"{identifier}-r0",
        job_id=identifier,
        round=0,
        policy_version=POLICY_VERSION,
        features=FEATURES,
        architecture=ARCHITECTURE,
        torch_version=str(torch.__version__),
        weights_sha256=sha256(weights),
        configuration=configuration(),
        dataset_sha256="0" * 64,
        training_sha256="0" * 64,
        correction_sha256=[],
        episode_ids=store.ids(),
        episode_sha256=[store.get(store.ids()[0]).sha256],
        training_samples=191,
        correction_samples=0,
        correction_seeds=[],
        fitting_loss=1.0,
        evaluation=summary,
        reference=summary,
    )
    atomic_model(directory / "r0.checkpoint.json", info)
    return manager, info, weights


def test_normalization_and_decoder_use_learned_outputs_without_task_guards(monkeypatch):
    observation = World(42).observe()
    values = features(observation)
    assert len(values) == 9 and values[0] == observation.target_forward / 4
    assert values[-1] == 0 and values[-2] == 0
    network = Network()
    with torch.no_grad():
        for parameter in network.parameters():
            parameter.zero_()
        network.layers[-1].bias[:] = torch.tensor([0.5, 0.5, 5, -5, 0, 5, 0, 0, 0, 5])
    monkeypatch.setattr(
        Reference, "action", lambda *args: (_ for _ in ()).throw(AssertionError("hidden expert"))
    )
    action = LearnedPolicy(network).action(observation)
    assert 0 < action.throttle < 1 and action.turn == 0
    assert action.lift == 1 and action.grip == "open"  # Even while empty: no scripted state guard.
    session = Session(
        42, connected=True, controller="learned_policy", policy=LearnedPolicy(network)
    )
    session.world.start()
    session.advance()
    assert session.tick == 1 and session.world.data.ctrl[0] != 0


@pytest.mark.parametrize("kind", ["version", "configuration", "features", "weights", "nan"])
def test_loader_rejects_incompatible_or_changed_checkpoint_even_after_cache_hit(checkpoint, kind):
    manager, info, weights = checkpoint
    manager.load(info.checkpoint_id)
    if kind == "version":
        info = info.model_copy(update={"policy_version": "unknown-v9"})
    elif kind == "configuration":
        info = info.model_copy(
            update={"configuration": info.configuration.model_copy(update={"control_dt": 0.1})}
        )
    elif kind == "features":
        info = info.model_copy(update={"features": list(reversed(FEATURES))})
    elif kind == "weights":
        weights.write_bytes(b"changed")
    else:
        network = Network()
        with torch.no_grad():
            next(network.parameters()).fill_(float("nan"))
        torch.save(network.state_dict(), weights)
        info = info.model_copy(update={"weights_sha256": sha256(weights)})
    atomic_model(weights.with_suffix(".checkpoint.json"), info)
    with pytest.raises((ValueError, RuntimeError)):
        manager.load(info.checkpoint_id)


def test_frozen_training_snapshot_only_uses_reviewed_training_data(store, tmp_path):
    manager = TrainingManager(tmp_path / "training", store)
    before = manager.snapshot(TrainRequest())
    key = store.ids()[0]
    store.review(key, Review(label="needs_work", excluded=True))
    assert before.episodes[0].review.label == "usable"  # Snapshot remains frozen.
    with pytest.raises(ValueError, match="reviewed"):
        manager.snapshot(TrainRequest(episode_ids=[key]))
    with pytest.raises(ValueError):
        manager.snapshot(TrainRequest())


def test_corrections_label_but_never_execute_the_expert_and_reject_validation_seeds():
    class Stationary:
        def action(self, observation):
            return Action()

    x, y, records = collect(Stationary(), [0], lambda: False)
    assert len(x) == len(y) == len(records) == 600
    assert all(row["executed_action"]["throttle"] == 0 for row in records)
    assert any(abs(row["teacher_action"]["turn"]) > 0 for row in records)
    assert records[0]["observation"]["target_forward"] == pytest.approx(
        records[-1]["observation"]["target_forward"], abs=1e-12
    )
    with pytest.raises(ValueError, match="training seeds"):
        collect(Stationary(), [10000], lambda: False)
    with pytest.raises(ValueError, match="Final test"):
        rollout(20000, Stationary())


def test_fitting_cancellation_and_nonfinite_losses_are_explicit():
    network = Network()
    with pytest.raises(InterruptedError):
        fit(network, [[0.0] * 9], [[0.0] * 6], 2, lambda *args: None, lambda: True)
    with pytest.raises(FloatingPointError):
        fit(network, [[float("nan")] * 9], [[0.0] * 6], 2, lambda *args: None, lambda: False)


def test_learned_mode_requires_loaded_checkpoint_and_cannot_record_demonstrations(checkpoint):
    manager, info, _ = checkpoint
    session = Session(42)

    def command(kind, **extra):
        session.last_command = -1
        return session.execute(
            client_adapter.validate_python(
                {
                    "api_version": "1",
                    "session_id": session.session_id,
                    "generation": 0,
                    "request_id": f"r-{len(session.acknowledgments)}",
                    "kind": kind,
                    **extra,
                }
            )
        )

    assert (
        command(
            "set_controller", controller="learned_policy", checkpoint_id=info.checkpoint_id
        ).reason
        == "incompatible_checkpoint"
    )
    session.prepared_policy = (info.checkpoint_id, manager.load(info.checkpoint_id))
    assert command(
        "set_controller", controller="learned_policy", checkpoint_id=info.checkpoint_id
    ).accepted
    assert session.view().scene.controller == "learned_policy"
    assert not command("record").accepted
    assert command("set_controller", controller="manual").accepted
    assert session.policy is None and session.checkpoint_id is None
    session.world.reset(20000)
    session.seed = 20000
    assert not command(
        "set_controller", controller="learned_policy", checkpoint_id=info.checkpoint_id
    ).accepted


def wait_job(client, identifier, target=None, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/v1/greenhouse/training/jobs/{identifier}").json()
        if job["state"] in {"completed", "failed", "cancelled"}:
            if target:
                assert job["state"] == target, job
            return job
        time.sleep(0.05)
    raise AssertionError("Worker did not finish within the bounded test window")


def test_real_worker_api_responsiveness_persistence_cancel_and_failed_job(
    store, tmp_path, monkeypatch
):
    monkeypatch.setenv("GREENHOUSE_DATASET_DIR", str(store.root))
    monkeypatch.setenv("GREENHOUSE_TRAINING_DIR", str(tmp_path / "training"))
    with TestClient(app) as client:
        started = client.post(
            "/api/v1/greenhouse/training/jobs", json={"epochs": 10, "correction_rounds": 0}
        )
        assert started.status_code == 201, started.text
        key = started.json()["job_id"]
        assert client.post("/api/v1/greenhouse/training/jobs", json={}).status_code == 409
        began = time.monotonic()
        assert client.get("/api/v1/greenhouse/health").status_code == 200
        assert time.monotonic() - began < 0.5
        finished = wait_job(client, key, "completed")
        selected = finished["selected_checkpoint"]
        detail = client.get(f"/api/v1/greenhouse/training/checkpoints/{selected}")
        assert detail.status_code == 200
        assert detail.json()["evaluation"]["seeds"] == list(range(10000, 10030))
        metadata = detail.json()["checkpoint"]
        assert metadata["dataset_sha256"] and metadata["episode_ids"] == store.ids()
        assert not metadata["evaluation"]["final_test_evaluated"]
        assert not (tmp_path / "training" / key / "dataset.json").read_bytes().startswith(b"null")
        # Cancel while importing/fitting; the worker is a separate owned process.
        for _ in range(100):
            if app.state.training.active_job is None:
                break
            time.sleep(0.01)
        second = client.post(
            "/api/v1/greenhouse/training/jobs", json={"epochs": 300, "correction_rounds": 3}
        ).json()
        worker_pid = app.state.training.process.pid
        assert (
            client.post(f"/api/v1/greenhouse/training/jobs/{second['job_id']}/cancel").status_code
            == 200
        )
        wait_job(client, second["job_id"], "cancelled")
        for _ in range(100):
            if app.state.training.active_job is None:
                break
            time.sleep(0.01)
        with pytest.raises(ProcessLookupError):
            os.kill(worker_pid, 0)
        # Damage this test-owned snapshot before the new worker reads it. Failure
        # must persist as failed rather than publishing an unevaluated checkpoint.
        third = client.post(
            "/api/v1/greenhouse/training/jobs", json={"epochs": 10, "correction_rounds": 0}
        ).json()
        (tmp_path / "training" / third["job_id"] / "input.json").write_text("invalid")
        failed = wait_job(client, third["job_id"], "failed")
        assert not failed["checkpoints"] and failed["message"]
    service = TrainingManager(tmp_path / "training", store)
    assert service.job(key).state == "completed"
    assert service.load(selected)
    assert service.job(third["job_id"]).state == "failed"
