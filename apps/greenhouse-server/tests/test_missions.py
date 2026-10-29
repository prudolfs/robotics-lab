import asyncio
import math
import time
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from greenhouse.api.contracts import client_adapter
from greenhouse.api.main import app
from greenhouse.api.sessions import Sessions
from greenhouse.datasets.store import DatasetStore
from greenhouse.missions import language
from greenhouse.missions.manager import MissionManager
from greenhouse.missions.models import MissionControl, MissionIntent, MissionRequest
from greenhouse.missions.skills import DOCK, docked
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import Action
from greenhouse.training.manager import TrainingManager


def drive_command(session, kind):
    session.last_command = -1
    return session.execute(
        client_adapter.validate_python(
            {
                "api_version": "1",
                "session_id": session.session_id,
                "generation": session.generation,
                "request_id": str(time.monotonic_ns()),
                "kind": kind,
            }
        )
    )


async def drive(manager, session, runtime):
    deadline = time.monotonic() + 15
    before = session.world.data.qpos[:2].copy()
    while runtime.active and time.monotonic() < deadline:
        session.advance()
        # Between-object selection must never teleport the robot.
        after = session.world.data.qpos[:2].copy()
        assert np.linalg.norm(after - before) < 0.04
        before = after
        await asyncio.sleep(
            0.001 if runtime.skill_done.is_set() or not runtime.current_skill else 0
        )
    assert not runtime.active, runtime.view()
    await manager.tasks[runtime.mission_id]
    return runtime.view()


def setup(tmp_path):
    sessions = Sessions()
    session = sessions.create(42)
    session.connected = True
    root = tmp_path / "missions"
    root.mkdir(exist_ok=True)
    training = TrainingManager(tmp_path / "training", DatasetStore(tmp_path / "datasets"))
    return sessions, session, root, training


def test_langgraph_three_collections_and_dock_preserve_pose_and_persist_verified_state(tmp_path):
    async def run():
        sessions, session, root, training = setup(tmp_path)
        async with AsyncSqliteSaver.from_conn_string(str(root / "graph.sqlite")) as saver:
            manager = MissionManager(root, sessions, training, saver)
            result = await manager.start(
                MissionRequest(
                    session_id=session.session_id, generation=0, controller="scripted_reference"
                )
            )
            runtime = manager.items[result.mission_id]
            session.world.reset = lambda *args: (_ for _ in ()).throw(AssertionError("pose reset"))
            final = await drive(manager, session, runtime)
            assert (
                final.state == "completed" and final.delivered == final.total == 3 and final.docked
            )
            assert docked(session.world) and not final.collisions and not final.invalid_actions
            assert math.hypot(final.last_world.x - DOCK[0], final.last_world.y - DOCK[1]) <= 0.12
            assert (
                len(
                    [
                        item
                        for item in final.trace
                        if item.node == "verify" and item.skill == "collect_deliver"
                    ]
                )
                == 3
            )
            checkpoint = await manager.checkpoint(final.mission_id)
            assert checkpoint.checkpoint_id and checkpoint.task_state.delivered == 3
            assert checkpoint.task_state.docked and not checkpoint.next_nodes
            assert await asyncio.to_thread(manager.path(final.mission_id).exists)
            assert not drive_command(session, "start").accepted  # Reset before regular control.
            await manager.close()

    asyncio.run(run())


def test_pause_disconnect_resume_generation_guards_and_frozen_history(tmp_path):
    async def run():
        sessions, session, root, training = setup(tmp_path)
        async with AsyncSqliteSaver.from_conn_string(str(root / "graph.sqlite")) as saver:
            manager = MissionManager(root, sessions, training, saver)
            result = await manager.start(
                MissionRequest(
                    session_id=session.session_id,
                    generation=0,
                    controller="scripted_reference",
                    intent=MissionIntent(capsule_count=1),
                )
            )
            runtime = manager.items[result.mission_id]
            for _ in range(30):
                session.advance()
                await asyncio.sleep(0.001)
            body = dict(session_id=session.session_id, generation=0)
            await manager.control(result.mission_id, MissionControl(action="pause", **body))
            position = session.world.data.qpos.copy()
            for _ in range(10):
                session.advance()
            np.testing.assert_array_equal(position, session.world.data.qpos)
            with pytest.raises(ValueError, match="session/generation"):
                await manager.control(
                    result.mission_id,
                    MissionControl(action="resume", session_id="other", generation=0),
                )
            await manager.control(result.mission_id, MissionControl(action="resume", **body))
            session.disconnect()
            assert runtime.state == "paused"
            with pytest.raises(ValueError, match="connected"):
                await manager.control(result.mission_id, MissionControl(action="resume", **body))
            session.connected = True
            await manager.control(result.mission_id, MissionControl(action="resume", **body))
            assert not drive_command(session, "record").accepted
            assert not drive_command(session, "start").accepted
            before = runtime.view().last_world
            assert drive_command(session, "reset").accepted
            await manager.tasks[result.mission_id]
            assert runtime.state == "orphaned" and session.generation == 1
            assert runtime.view().last_world.x == before.x
            assert runtime.view().last_world.y == before.y
            with pytest.raises(ValueError, match="reset|current"):
                await manager.control(result.mission_id, MissionControl(action="resume", **body))
            assert session.view().mission is None and session.tick == 0
            await manager.close()

    asyncio.run(run())


@pytest.mark.parametrize("kind", ["stationary", "raises"])
def test_learned_failure_never_uses_reference_and_replanning_is_bounded(
    tmp_path, monkeypatch, kind
):
    class Actor:
        def action(self, observation):
            if kind == "raises":
                raise RuntimeError("broken actor")
            return Action()

    async def run():
        sessions, session, root, training = setup(tmp_path)
        training.load = lambda key: Actor()
        training.checkpoint = lambda key: SimpleNamespace(weights_sha256="a" * 64)
        monkeypatch.setattr(
            Reference,
            "action",
            lambda *args: (_ for _ in ()).throw(AssertionError("hidden reference")),
        )
        async with AsyncSqliteSaver.from_conn_string(str(root / "graph.sqlite")) as saver:
            manager = MissionManager(root, sessions, training, saver)
            result = await manager.start(
                MissionRequest(
                    session_id=session.session_id,
                    generation=0,
                    checkpoint_id="a" * 32 + "-r0",
                    intent=MissionIntent(capsule_count=1),
                )
            )
            runtime = manager.items[result.mission_id]
            final = await drive(manager, session, runtime)
            assert final.state == "failed" and not final.delivered
            assert final.recoveries == (1 if kind == "stationary" else 0)
            assert final.total_ticks < 500
            assert sum(item.node == "recover" for item in final.trace) <= 2
            assert all("scripted reference" not in item.message for item in final.trace)
            await manager.close()

    asyncio.run(run())


def test_dock_only_cancel_restart_orphaned_checkpoint_and_duplicate_start(tmp_path):
    async def run():
        sessions, session, root, training = setup(tmp_path)
        async with AsyncSqliteSaver.from_conn_string(str(root / "graph.sqlite")) as saver:
            manager = MissionManager(root, sessions, training, saver)
            request = MissionRequest(
                session_id=session.session_id,
                generation=0,
                intent=MissionIntent(task="return_to_dock", capsule_count=0),
            )
            result = await manager.start(request)
            with pytest.raises(ValueError, match="already owns|fresh"):
                await manager.start(request)
            runtime = manager.items[result.mission_id]
            for _ in range(20):
                await asyncio.sleep(0.001)
                session.advance()
            await manager.close()
            assert runtime.state == "orphaned"
        async with AsyncSqliteSaver.from_conn_string(str(root / "graph.sqlite")) as saver:
            restarted = MissionManager(root, Sessions(), training, saver)
            assert restarted.get(result.mission_id).state == "orphaned"
            checkpoint = await restarted.checkpoint(result.mission_id)
            assert checkpoint.checkpoint_id and "execute" in checkpoint.next_nodes
            with pytest.raises(ValueError, match="persisted"):
                await restarted.control(
                    result.mission_id,
                    MissionControl(session_id=session.session_id, generation=0, action="resume"),
                )
            new_session = restarted.sessions.create(42)
            new_session.connected = True
            next_mission = await restarted.start(
                MissionRequest(
                    session_id=new_session.session_id,
                    generation=0,
                    intent=MissionIntent(task="return_to_dock", capsule_count=0),
                )
            )
            final = await drive(restarted, new_session, restarted.items[next_mission.mission_id])
            assert final.docked and final.total == final.delivered == 0
            assert drive_command(new_session, "reset").accepted
            third = await restarted.start(
                MissionRequest(
                    session_id=new_session.session_id,
                    generation=1,
                    intent=MissionIntent(task="return_to_dock", capsule_count=0),
                )
            )
            await restarted.control(
                third.mission_id,
                MissionControl(session_id=new_session.session_id, generation=1, action="cancel"),
            )
            await restarted.tasks[third.mission_id]
            assert restarted.get(third.mission_id).state == "cancelled"
            await restarted.close()

    asyncio.run(run())


def test_language_tool_is_optional_validated_one_call_and_never_executes(monkeypatch):
    assert not language.language_status().available
    with pytest.raises(ValueError, match="unavailable"):
        asyncio.run(language.draft("Collect three and dock"))
    monkeypatch.setenv("GREENHOUSE_MISSION_MODEL", "test-model")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    calls = []
    response = AIMessage(
        content="",
        tool_calls=[
            {
                "name": language.mission_tool.name,
                "args": {"task": "collect_and_dock", "capsule_count": 2, "reason": ""},
                "id": "draft-1",
            }
        ],
    )

    class Model:
        def bind_tools(self, tools, tool_choice):
            assert tools == [language.mission_tool] and tool_choice == language.mission_tool.name
            return self

        async def ainvoke(self, messages):
            calls.append(messages)
            if isinstance(response, Exception):
                raise response
            return response

    monkeypatch.setattr("langchain.chat_models.init_chat_model", lambda *args, **kwargs: Model())
    result = asyncio.run(language.draft("Collect two capsules and dock"))
    assert result.intent.capsule_count == 2 and len(calls) == 1
    response = AIMessage(content="", tool_calls=[])
    with pytest.raises(ValueError, match="one supported"):
        asyncio.run(language.draft("Collect two"))
    response = AIMessage(
        content="",
        tool_calls=[
            {
                "name": language.mission_tool.name,
                "args": {
                    "task": "unsupported",
                    "capsule_count": 0,
                    "reason": "Watering is unsupported.",
                },
                "id": "draft-2",
            }
        ],
    )
    with pytest.raises(ValueError, match="Watering"):
        asyncio.run(language.draft("Water all plants"))
    response = RuntimeError("secret provider headers")
    with pytest.raises(ValueError, match="could not produce") as error:
        asyncio.run(language.draft("Collect two"))
    assert "secret" not in str(error.value)
    response = TimeoutError()
    with pytest.raises(TimeoutError):
        asyncio.run(language.draft("Collect two"))


def test_http_mission_validation_unavailable_provider_and_live_checkpoint_api():
    with TestClient(app) as client:
        prefix = "/api/v1/greenhouse"
        assert client.get(prefix + "/capabilities").json()["missions"]
        catalog = client.get(prefix + "/missions").json()
        assert len(catalog["skills"]) == 3 and not catalog["language"]["available"]
        assert (
            client.post(prefix + "/missions/draft", json={"instruction": "Collect two"}).status_code
            == 503
        )
        session = client.post(prefix + "/sessions", json={"seed": 42}).json()
        body = {
            "session_id": session["session_id"],
            "generation": 0,
            "controller": "scripted_reference",
        }
        assert (
            client.post(prefix + "/missions", json=body).status_code == 422
        )  # No attached viewer.
        with client.websocket_connect(prefix + f"/sessions/{session['session_id']}/stream"):
            started = client.post(prefix + "/missions", json=body)
            assert started.status_code == 201, started.text
            identifier = started.json()["mission_id"]
            assert client.post(prefix + "/missions", json=body).status_code == 422
            for _ in range(100):
                saved = client.get(prefix + f"/missions/{identifier}/checkpoint").json()
                if saved.get("checkpoint_id"):
                    break
                time.sleep(0.01)
            assert saved["checkpoint_id"]
            control = {"session_id": session["session_id"], "generation": 0, "action": "cancel"}
            assert (
                client.post(prefix + f"/missions/{identifier}/control", json=control).status_code
                == 200
            )
            assert client.get(prefix + f"/missions/{identifier}").json()["state"] == "cancelled"
        assert client.get(prefix + "/missions/../wrong").status_code in (404, 422)
    with pytest.raises(ValueError):
        MissionIntent(capsule_count=4)
    with pytest.raises(ValueError):
        MissionIntent(task="return_to_dock", capsule_count=1)
    with pytest.raises(ValueError):
        MissionRequest(session_id="x", generation=0)
