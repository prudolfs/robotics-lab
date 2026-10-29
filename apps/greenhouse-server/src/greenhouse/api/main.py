import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from greenhouse import __version__
from greenhouse.api.contracts import (
    Capabilities,
    CreateSession,
    Health,
    SessionView,
)
from greenhouse.api.datasets import router as dataset_router
from greenhouse.api.missions import router as mission_router
from greenhouse.api.sessions import Sessions
from greenhouse.api.stream import stream_session
from greenhouse.api.training import router as training_router
from greenhouse.datasets.store import DatasetStore
from greenhouse.missions.language import language_status
from greenhouse.missions.manager import MissionManager
from greenhouse.simulation.model import CONTROL_DT
from greenhouse.training.manager import TrainingManager

PREFIX = "/api/v1/greenhouse"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with AsyncExitStack() as stack:
        artifact_root = Path(os.environ.get("GREENHOUSE_DATASET_DIR", "runtime/datasets/v1"))
        app.state.datasets = await asyncio.to_thread(lambda: DatasetStore(artifact_root.resolve()))
        training_root = Path(os.environ.get("GREENHOUSE_TRAINING_DIR", "runtime/training/v1"))
        app.state.training = await asyncio.to_thread(
            lambda: TrainingManager(training_root.resolve(), app.state.datasets)
        )
        app.state.dataset_job = asyncio.Lock()
        registry = Sessions(store=app.state.datasets)
        app.state.sessions = registry
        mission_root = await asyncio.to_thread(
            lambda: Path(os.environ.get("GREENHOUSE_MISSION_DIR", "runtime/missions/v1")).resolve()
        )
        await asyncio.to_thread(mission_root.mkdir, parents=True, exist_ok=True)
        saver = await stack.enter_async_context(
            AsyncSqliteSaver.from_conn_string(str(mission_root / "graph.sqlite"))
        )
        app.state.missions = MissionManager(mission_root, registry, app.state.training, saver)

        async def persist_missions() -> None:
            while True:
                await asyncio.sleep(1)
                try:
                    await app.state.missions.flush()
                except OSError:
                    logging.getLogger(__name__).exception("Mission persistence failed")
                    for runtime in app.state.missions.items.values():
                        runtime.pause("Mission persistence failed. Physical execution is paused.")

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
                        session.world.reason = (
                            "The simulation could not advance. Check the server log."
                        )
                        session.world.event("warning", session.world.reason)
                        session.revision += 1
                deadline += CONTROL_DT
                if deadline < loop.time() - CONTROL_DT:
                    # Under load, run slower than wall time instead of skipping physics steps.
                    deadline = loop.time()
                await asyncio.sleep(max(0, deadline - loop.time()))

        tasks = [
            asyncio.create_task(sweep()),
            asyncio.create_task(simulate()),
            asyncio.create_task(persist_missions()),
        ]
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()
            for task in tasks:
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            await app.state.missions.close()
            await app.state.training.close()
            for session in registry.items.values():
                if not session.finish_recording("closed"):
                    logging.getLogger(__name__).error(session.recording_error)
            registry.items.clear()


app = FastAPI(title="Greenhouse Caretaker API", version=__version__, lifespan=lifespan)
app.include_router(dataset_router)
app.include_router(training_router)
app.include_router(mission_router)


@app.get(f"{PREFIX}/health", response_model=Health, operation_id="get_health")
def health() -> Health:
    return Health(server_version=__version__)


@app.get(f"{PREFIX}/capabilities", response_model=Capabilities, operation_id="get_capabilities")
def capabilities() -> Capabilities:
    return Capabilities(language_missions=language_status().available)


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
    session = registry.items.get(session_id)
    if session and not session.finish_recording(
        "terminal" if session.world.status in ("complete", "failed") else "closed"
    ):
        raise HTTPException(409, session.recording_error)
    if session and session.mission:
        session.mission.invalidate("The owning session was deleted.")
    registry.items.pop(session_id, None)
    return Response(status_code=204)


@app.websocket(f"{PREFIX}/sessions/{{session_id}}/stream")
async def stream(websocket: WebSocket, session_id: str) -> None:
    await stream_session(websocket, session_id)
