import asyncio
import contextlib
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from greenhouse import __version__
from greenhouse.api.contracts import (
    Capabilities,
    CreateSession,
    Health,
    Heartbeat,
    Hello,
    SessionView,
    StreamError,
    client_adapter,
)
from greenhouse.api.sessions import Sessions

PREFIX = "/api/v1/greenhouse"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    registry = Sessions()
    app.state.sessions = registry

    async def sweep() -> None:
        while True:
            await asyncio.sleep(30)
            registry.prune()

    task = asyncio.create_task(sweep())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        registry.items.clear()


app = FastAPI(title="Greenhouse Caretaker API", version=__version__, lifespan=lifespan)


@app.get(f"{PREFIX}/health", response_model=Health, operation_id="get_health")
def health() -> Health:
    return Health(server_version=__version__)


@app.get(f"{PREFIX}/capabilities", response_model=Capabilities, operation_id="get_capabilities")
def capabilities() -> Capabilities:
    return Capabilities()


@app.post(
    f"{PREFIX}/sessions", response_model=SessionView, status_code=201, operation_id="create_session"
)
async def create_session(body: CreateSession, request: Request) -> SessionView:
    registry: Sessions = request.app.state.sessions
    try:
        return registry.create(body.seed).view()
    except OverflowError as error:
        raise HTTPException(503, str(error)) from error


@app.get(
    f"{PREFIX}/sessions/{{session_id}}", response_model=SessionView, operation_id="get_session"
)
async def get_session(session_id: str, request: Request) -> SessionView:
    registry: Sessions = request.app.state.sessions
    session = registry.items.get(session_id)
    if session is None:
        raise HTTPException(404, "Greenhouse session not found. Reconnect to create a new session.")
    session.last_seen = asyncio.get_running_loop().time()
    return session.view()


@app.delete(f"{PREFIX}/sessions/{{session_id}}", status_code=204, operation_id="delete_session")
async def delete_session(session_id: str, request: Request) -> Response:
    registry: Sessions = request.app.state.sessions
    registry.items.pop(session_id, None)
    return Response(status_code=204)


@app.websocket(f"{PREFIX}/sessions/{{session_id}}/stream")
async def stream(websocket: WebSocket, session_id: str) -> None:
    origins = os.getenv(
        "GREENHOUSE_ALLOWED_ORIGINS",
        "http://127.0.0.1:8086,http://localhost:8086,http://127.0.0.1:4186,http://localhost:4186",
    ).split(",")
    origin = websocket.headers.get("origin")
    if origin and origin not in origins:
        await websocket.close(code=4403)
        return
    registry: Sessions = websocket.app.state.sessions
    session = registry.items.get(session_id)
    if session is None or session.connected:
        await websocket.close(code=4404 if session is None else 4409)
        return
    session.connected = True
    await websocket.accept()
    try:
        await websocket.send_text(
            Hello(
                kind="hello",
                api_version="1",
                session_id=session_id,
                generation=session.generation,
                tick=session.tick,
            ).model_dump_json()
        )
        await websocket.send_text(session.snapshot().model_dump_json())
        while registry.items.get(session_id) is session:
            try:
                text = await asyncio.wait_for(websocket.receive_text(), timeout=1)
            except TimeoutError:
                session.last_seen = asyncio.get_running_loop().time()
                await websocket.send_text(
                    Heartbeat(
                        kind="heartbeat",
                        api_version="1",
                        session_id=session_id,
                        generation=session.generation,
                        tick=session.tick,
                    ).model_dump_json()
                )
                continue
            try:
                if len(text) > 4096:
                    raise ValueError("message too large")
                command = client_adapter.validate_json(text)
            except (ValidationError, ValueError):
                await websocket.send_text(
                    StreamError(
                        kind="error",
                        api_version="1",
                        session_id=session_id,
                        generation=session.generation,
                        tick=session.tick,
                        message="Expected a valid v1 ping or reset_preview command.",
                    ).model_dump_json()
                )
                continue
            ack = session.execute(command)
            await websocket.send_text(ack.model_dump_json())
            if ack.accepted and command.kind == "reset_preview":
                await websocket.send_text(session.snapshot().model_dump_json())
        await websocket.close(code=1000)
    except WebSocketDisconnect:
        pass
    finally:
        session.connected = False
        session.last_seen = asyncio.get_running_loop().time()
