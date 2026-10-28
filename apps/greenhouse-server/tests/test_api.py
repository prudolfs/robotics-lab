import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from greenhouse.api.contracts import client_adapter, server_adapter
from greenhouse.api.main import PREFIX, app
from greenhouse.api.sessions import Sessions


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def create(client, seed=42):
    response = client.post(f"{PREFIX}/sessions", json={"seed": seed})
    assert response.status_code == 201
    return response.json()


def receive(socket):
    payload = socket.receive_json()
    server_adapter.validate_json(__import__("json").dumps(payload))
    return payload


def test_health_capabilities_and_http_schema(client):
    assert client.get(f"{PREFIX}/health").json()["api_version"] == "1"
    capabilities = client.get(f"{PREFIX}/capabilities").json()
    assert capabilities["mode"] == "foundation_preview"
    assert not capabilities["simulation"] and not capabilities["training"]
    paths = client.get("/openapi.json").json()["paths"]
    assert f"{PREFIX}/sessions" in paths
    assert not any("/stream" in path for path in paths)


@pytest.mark.parametrize(
    "body", [{"seed": -1}, {"seed": 2**31}, {"seed": "42"}, {"seed": 42, "extra": True}]
)
def test_invalid_http_inputs(client, body):
    assert client.post(f"{PREFIX}/sessions", json=body).status_code == 422


def test_seeded_preview_is_reproducible_and_deletion_idempotent(client):
    a, b = create(client), create(client)
    assert a["scene"] == b["scene"] and a["session_id"] != b["session_id"]
    assert client.get(f"{PREFIX}/sessions/{a['session_id']}").json() == a
    for _ in range(2):
        assert client.delete(f"{PREFIX}/sessions/{a['session_id']}").status_code == 204
    assert client.get(f"{PREFIX}/sessions/{a['session_id']}").status_code == 404


def test_stream_reset_ack_idempotency_stale_generation_and_invalid_messages(client):
    session = create(client)
    address = f"{PREFIX}/sessions/{session['session_id']}/stream"
    with client.websocket_connect(address) as socket:
        assert receive(socket)["kind"] == "hello"
        snapshot = receive(socket)
        assert snapshot["kind"] == "snapshot" and snapshot["tick"] == 0
        command = {
            "api_version": "1",
            "kind": "reset_preview",
            "session_id": session["session_id"],
            "generation": 0,
            "request_id": "reset-1",
            "seed": 9,
        }
        socket.send_json(command)
        ack = receive(socket)
        assert ack["accepted"] and ack["generation"] == 1
        reset = receive(socket)
        assert reset["seed"] == 9 and reset["generation"] == 1
        socket.send_json(command)
        assert receive(socket) == ack
        assert receive(socket)["generation"] == 1
        socket.send_json({**command, "request_id": "stale-1"})
        rejected = receive(socket)
        assert not rejected["accepted"] and rejected["reason"] == "stale_generation"
        socket.send_text('{"api_version":"2"}')
        assert receive(socket)["kind"] == "error"
        socket.send_text("x" * 4097)
        assert receive(socket)["kind"] == "error"
        # A valid connection survives invalid input; reconnect sees latest generation.
    with client.websocket_connect(address) as socket:
        assert receive(socket)["generation"] == 1
        assert receive(socket)["seed"] == 9


def test_session_mismatch_and_rate_limit(client):
    session = create(client)
    with client.websocket_connect(f"{PREFIX}/sessions/{session['session_id']}/stream") as socket:
        receive(socket)
        receive(socket)
        command = {
            "api_version": "1",
            "kind": "ping",
            "session_id": session["session_id"],
            "generation": 0,
            "request_id": "ping-1",
        }
        socket.send_json({**command, "session_id": "other", "request_id": "mismatch"})
        assert receive(socket)["reason"] == "session_mismatch"
        socket.send_json(command)
        assert receive(socket)["accepted"]
        socket.send_json({**command, "request_id": "too-fast"})
        assert receive(socket)["reason"] == "rate_limited"


def test_stream_unknown_session_and_disallowed_origin(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"{PREFIX}/sessions/missing/stream"):
            pass
    session = create(client)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"{PREFIX}/sessions/{session['session_id']}/stream",
            headers={"origin": "https://example.com"},
        ):
            pass


def test_single_stream_per_session(client):
    session = create(client)
    address = f"{PREFIX}/sessions/{session['session_id']}/stream"
    with client.websocket_connect(address) as socket:
        receive(socket)
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(address):
                pass


def test_capacity_expiration_and_shutdown(client):
    registry = Sessions(limit=1, idle_seconds=1)
    session = registry.create(42)
    with pytest.raises(OverflowError):
        registry.create(43)
    session.last_seen = time.monotonic() - 2
    assert registry.create(43).seed == 43
    app.state.sessions = Sessions(limit=0)
    assert client.post(f"{PREFIX}/sessions", json={"seed": 42}).status_code == 503


def test_client_schema_rejects_unknown_keys():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        client_adapter.validate_json(
            '{"api_version":"1","kind":"ping","session_id":"x","generation":0,"request_id":"x","extra":true}'
        )
