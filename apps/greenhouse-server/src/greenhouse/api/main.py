import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket

from greenhouse import __version__
from greenhouse.api.contracts import (
    Capabilities,
    CreateSession,
    Health,
    SessionView,
)
from greenhouse.api.sessions import Sessions
from greenhouse.api.stream import stream_session
from greenhouse.simulation.model import CONTROL_DT

PREFIX = "/api/v1/greenhouse"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    registry = Sessions()
    app.state.sessions = registry

    async def sweep() -> None:
        while True:
            await asyncio.sleep(30)
            registry.prune()

    async def simulate() -> None:
        loop = asyncio.get_running_loop()
        deadline = loop.time()
        while True:
            for session in tuple(registry.items.values()):
                try:
                    session.advance()
                except Exception:
                    logging.getLogger(__name__).exception("Greenhouse simulation failed")
                    session.world.status = "failed"
                    session.world.reason = "The simulation could not advance. Check the server log."
                    session.world.event("warning", session.world.reason)
                    session.revision += 1
            deadline += CONTROL_DT
            if deadline < loop.time() - CONTROL_DT:
                # Under load, run slower than wall time instead of skipping physics steps.
                deadline = loop.time()
            await asyncio.sleep(max(0, deadline - loop.time()))

    tasks = [asyncio.create_task(sweep()), asyncio.create_task(simulate())]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        for task in tasks:
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
    await stream_session(websocket, session_id)
