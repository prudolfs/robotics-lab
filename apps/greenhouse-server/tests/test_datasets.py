import json
import time
from dataclasses import asdict

import pytest
from fastapi.testclient import TestClient

from greenhouse.api.contracts import client_adapter
from greenhouse.api.main import app
from greenhouse.api.sessions import Session
from greenhouse.datasets.episodes import Recorder, digest, validate_episode
from greenhouse.datasets.models import Bundle, Entry, Episode, ObservationData, Review
from greenhouse.datasets.store import MAX_IMPORT_BYTES, DatasetStore
from greenhouse.simulation.world import Action, World


@pytest.fixture
def store(tmp_path):
    return DatasetStore(tmp_path / "episodes")


@pytest.fixture
def expert(store):
    summary = store.collect_experts([42])
    return store.get(summary.episodes[0].episode_id).episode


def altered(episode, **changes):
    payload = episode.model_dump(mode="json")
    payload.update(changes)
    return Episode.model_validate_json(json.dumps(payload))


def manual_episode():
    world = World(7)
    recorder = Recorder(world)
    world.start("Manual teaching running.")
    for _ in range(4):
        before = ObservationData(**asdict(world.observe()))
        action = Action(lift=1.0)
        step = world.step(action)
        recorder.append(before, action, step, world, "manual", "manual")
    return recorder.finish(world, "stopped")


def command(session, kind, **payload):
    # Control timing is tested separately; each helper call represents a distinct
    # UI operation after acknowledgment, not a burst of simultaneous commands.
    session.last_command = -1.0
    result = session.execute(
        client_adapter.validate_python(
            {
                "api_version": "1",
                "session_id": session.session_id,
                "generation": session.generation,
                "request_id": f"r-{len(session.acknowledgments)}",
                "kind": kind,
                **payload,
            }
        )
    )
    assert result.accepted, result
    return result


def test_expert_has_contiguous_steps_observations_grasp_events_and_verified_outcome(store, expert):
    validate_episode(expert)
    assert expert.source == "scripted_expert" and expert.outcome == "success"
    assert expert.split == "train" and expert.initial_state.tick == 0
    assert [frame.tick for frame in expert.frames] == list(range(1, len(expert.frames) + 1))
    assert any(frame.action.grip == "close" for frame in expert.frames)
    assert any(frame.action.grip == "open" for frame in expert.frames)
    assert expert.final_state.delivered and expert.frames[-1].terminated
    assert store.validate().ready_for_training


@pytest.mark.parametrize(
    "change",
    [
        "action",
        "observation",
        "state",
        "source",
        "outcome",
        "split",
        "configuration",
        "timing",
        "terminal",
        "intervention",
        "events",
    ],
)
def test_semantic_validation_rejects_forged_but_well_formed_episodes(expert, change):
    payload = expert.model_dump(mode="json")
    if change == "action":
        payload["frames"][0]["action"]["throttle"] = -1.0
    elif change == "observation":
        payload["frames"][0]["observation"]["distance"] += 0.1
    elif change == "state":
        payload["frames"][0]["state"]["x"] += 0.1
    elif change == "source":
        payload["source"] = "user"
    elif change == "outcome":
        payload["outcome"] = "failure"
    elif change == "split":
        payload["split"] = "validation"
    elif change == "configuration":
        payload["configuration"]["control_dt"] = 0.1
    elif change == "timing":
        payload["frames"][0]["simulated_seconds"] = 2.0
    elif change == "terminal":
        payload["frames"][0]["terminated"] = True
    elif change == "intervention":
        payload["frames"][0]["intervention"] = True
    else:
        payload["frames"][0]["state"]["events"][0]["tick"] = 2
    with pytest.raises(ValueError):
        validate_episode(Episode.model_validate_json(json.dumps(payload)))


def test_review_exclusion_and_import_never_rewrite_source_episodes(store, expert, tmp_path):
    path = store._path(expert.episode_id)
    original = path.read_bytes()
    original_hash = digest(expert)
    bundle = store.export()
    store.review(
        expert.episode_id, Review(label="needs_work", note="Inspect approach", excluded=True)
    )
    assert path.read_bytes() == original
    assert store.get(expert.episode_id).sha256 == original_hash
    assert not store.validate().ready_for_training
    result = store.import_bundle(Bundle.model_validate_json(bundle))
    assert result.imported == 0 and result.duplicates == 1
    assert store.get(expert.episode_id).review.note == "Inspect approach"
    other = DatasetStore(tmp_path / "other")
    other.import_bundle(Bundle.model_validate_json(bundle))
    assert other.export() == bundle


def test_repeated_expert_collection_preserves_existing_data_and_reviews(store, expert):
    store.review(expert.episode_id, Review(label="needs_work", excluded=True, note="Keep excluded"))
    assert len(store.collect_experts([42]).episodes) == 1
    assert store.get(expert.episode_id).review.note == "Keep excluded"
    assert not store.validate().ready_for_training


def test_incomplete_manual_attempt_is_preserved_and_cannot_be_marked_successful(store):
    episode = manual_episode()
    validate_episode(episode)
    store.save(episode)
    assert episode.source == "user" and episode.outcome == "incomplete"
    assert episode.frames[0].intervention
    assert not store.validate().ready_for_training
    with pytest.raises(ValueError, match="successful"):
        store.review(episode.episode_id, Review(label="usable", excluded=False))
    assert store.get(episode.episode_id).review.label == "unreviewed"


def test_split_leakage_and_reserved_test_collection_are_blocked(store, expert):
    for seed in (20000, 20099):
        with pytest.raises(ValueError, match="reserved"):
            Recorder(World(seed))
    with pytest.raises(ValueError):
        store.collect_experts([10000])
    world = World(10000)
    recorder = Recorder(world)
    world.start()
    before = ObservationData(**asdict(world.observe()))
    step = world.step(Action())
    recorder.append(before, Action(), step, world, "manual", "manual")
    episode = recorder.finish(world, "stopped")
    validate_episode(episode)
    assert episode.split == "validation"
    with pytest.raises(ValueError, match="split"):
        validate_episode(altered(episode, split="train"))


def test_import_is_all_or_nothing_and_checks_content_hash(store, expert, tmp_path):
    destination = DatasetStore(tmp_path / "imported")
    good = store.get(expert.episode_id)
    bad_episode = altered(expert, episode_id="a" * 32, outcome="failure")
    bad = Entry(episode=bad_episode, sha256=digest(bad_episode), review=Review())
    with pytest.raises(ValueError):
        destination.import_bundle(Bundle(episodes=[good, bad]))
    assert destination.ids() == []
    with pytest.raises(ValueError, match="checksum"):
        destination.import_bundle(
            Bundle(episodes=[Entry(episode=expert, sha256="0" * 64, review=Review())])
        )
    with pytest.raises(ValueError, match="Duplicate"):
        destination.import_bundle(Bundle(episodes=[good, good]))
    with pytest.raises(ValueError):
        destination.get("../../secrets")


def test_manual_lease_expires_neutral_stop_is_accepted_and_stale_input_is_rejected(
    store, monkeypatch
):
    clock = [100.0]
    monkeypatch.setattr("greenhouse.api.sessions.time.monotonic", lambda: clock[0])
    session = Session(42, connected=True, store=store)
    command(session, "set_controller", controller="manual")
    command(session, "record")
    command(session, "manual", action={"throttle": 0.5})
    session.advance()
    assert session.recorder.frames[-1].action.throttle == 0.5
    # Neutral stop bypasses manual rate limiting; releasing a key must not wait.
    command(session, "manual", action={})
    session.advance()
    assert session.recorder.frames[-1].action.throttle == 0
    clock[0] += 0.1
    command(session, "manual", action={"turn": 0.5})
    clock[0] += 0.3
    session.advance()
    assert session.recorder.frames[-1].action.turn == 0
    session.disconnect()
    assert session.world.status == "paused" and session.recorder is None
    assert store.get(session.last_episode_id).episode.end_reason == "disconnected"
    command(session, "reset")
    stale = session.execute(
        client_adapter.validate_python(
            {
                "api_version": "1",
                "kind": "manual",
                "session_id": session.session_id,
                "generation": 0,
                "request_id": "stale-input",
                "action": {"throttle": 1.0},
            }
        )
    )
    assert not stale.accepted and stale.reason == "stale_generation"
    assert session.manual_until == 0


def test_intervention_is_labeled_mixed_and_survives_roundtrip(store):
    session = Session(42, connected=True, store=store)
    command(session, "record")
    for _ in range(5):
        session.advance()
    command(session, "pause")
    command(session, "set_controller", controller="manual")
    command(session, "start")
    session.advance()
    command(session, "pause")
    command(session, "set_controller", controller="scripted_reference")
    command(session, "start")
    while session.world.status == "running":
        session.advance()
    assert session.recording_error is None
    episode = store.get(session.last_episode_id).episode
    assert episode.source == "mixed" and episode.outcome == "success"
    assert sum(frame.intervention for frame in episode.frames) == 2
    validate_episode(episode)


def test_reset_saves_old_generation_and_does_not_record_reset_state(store):
    session = Session(42, connected=True, store=store)
    command(session, "set_controller", controller="manual")
    command(session, "record")
    session.advance()
    command(session, "new_seed")
    episode = store.get(session.last_episode_id).episode
    assert episode.seed == 42 and episode.end_reason == "reset"
    assert episode.final_state.tick == 1
    assert session.tick == 0 and session.generation == 1 and session.seed != 42


def test_controller_selection_without_executed_manual_steps_preserves_reference_stage(store):
    session = Session(42, connected=True, store=store)
    command(session, "record")
    while session.reference.stage == "approach":
        session.advance()
    stage = session.reference.stage
    command(session, "pause")
    command(session, "set_controller", controller="manual")
    command(session, "set_controller", controller="scripted_reference")
    assert session.reference.stage == stage
    command(session, "start")
    while session.world.status == "running":
        session.advance()
    assert session.recording_error is None
    validate_episode(store.get(session.last_episode_id).episode)


def test_manual_acknowledgments_do_not_queue_behind_snapshot_publication(tmp_path, monkeypatch):
    monkeypatch.setenv("GREENHOUSE_DATASET_DIR", str(tmp_path))
    with TestClient(app) as client:
        session = client.post("/api/v1/greenhouse/sessions", json={"seed": 42}).json()
        with client.websocket_connect(
            f"/api/v1/greenhouse/sessions/{session['session_id']}/stream"
        ) as socket:

            def send(kind, request_id, **extra):
                socket.send_json(
                    {
                        "api_version": "1",
                        "session_id": session["session_id"],
                        "generation": 0,
                        "kind": kind,
                        "request_id": request_id,
                        **extra,
                    }
                )

            def ack(request_id):
                for _ in range(50):
                    message = socket.receive_json()
                    if message["kind"] == "ack" and message["request_id"] == request_id:
                        assert message["accepted"]
                        return
                raise AssertionError("Missing acknowledgment")

            send("set_controller", "mode", controller="manual")
            ack("mode")
            time.sleep(0.12)
            send("start", "start")
            ack("start")
            began = time.monotonic()
            for index in range(5):
                send("manual", f"stop-{index}", action={})
            ack("stop-4")
            assert time.monotonic() - began < 0.25


def test_recording_save_failure_remains_recoverable_and_blocks_reset(store, monkeypatch):
    session = Session(42, connected=True, store=store)
    command(session, "record")
    session.advance()
    original = store.save
    monkeypatch.setattr(store, "save", lambda *args: (_ for _ in ()).throw(OSError("disk full")))
    session.last_command = -1
    ack = session.execute(
        client_adapter.validate_python(
            {
                "api_version": "1",
                "kind": "reset",
                "session_id": session.session_id,
                "generation": 0,
                "request_id": "save-error",
            }
        )
    )
    assert not ack.accepted and ack.reason == "storage_error"
    assert session.generation == 0 and session.recorder is not None
    assert "disk full" in session.recording_error
    monkeypatch.setattr(store, "save", original)
    command(session, "stop_recording")
    assert session.recorder is None and session.last_episode_id


def test_dataset_http_limits_roundtrip_and_configuration_errors(tmp_path, monkeypatch):
    monkeypatch.setenv("GREENHOUSE_DATASET_DIR", str(tmp_path))
    with TestClient(app) as client:
        assert client.get("/api/v1/greenhouse/dataset").json()["episodes"] == []
        assert (
            client.post("/api/v1/greenhouse/dataset/expert", json={"seeds": [20000]}).status_code
            == 422
        )
        response = client.post("/api/v1/greenhouse/dataset/expert", json={"seeds": [42]})
        assert response.status_code == 200
        episode_id = response.json()["episodes"][0]["episode_id"]
        detail = client.get(f"/api/v1/greenhouse/episodes/{episode_id}").json()
        assert detail["template"]["robot"]["x"] == detail["entry"]["episode"]["initial_state"]["x"]
        payload = client.get("/api/v1/greenhouse/dataset/export").content
        result = client.post("/api/v1/greenhouse/dataset/import", content=payload)
        assert result.json() == {"imported": 0, "duplicates": 1}
        assert client.post("/api/v1/greenhouse/dataset/validate").json()["ready_for_training"]
        assert (
            client.post(
                "/api/v1/greenhouse/dataset/import", content=b"x" * (MAX_IMPORT_BYTES + 1)
            ).status_code
            == 413
        )
        assert (
            client.post(
                "/api/v1/greenhouse/dataset/import", json={"schema_version": 2, "episodes": []}
            ).status_code
            == 422
        )
        assert client.get("/api/v1/greenhouse/episodes/not-an-id").status_code == 422
