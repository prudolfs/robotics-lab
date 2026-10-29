"""Mission lifecycle endpoints; language drafts are optional and never start execution."""

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request

from greenhouse.missions import language
from greenhouse.missions.manager import MissionManager
from greenhouse.missions.models import (
    GraphCheckpoint,
    InstructionRequest,
    MissionCatalog,
    MissionControl,
    MissionDraft,
    MissionRequest,
    MissionView,
)

router = APIRouter(prefix="/api/v1/greenhouse/missions")


def manager(request: Request) -> MissionManager:
    service: MissionManager = request.app.state.missions
    return service


@contextmanager
def errors() -> Iterator[None]:
    try:
        yield
    except FileNotFoundError as error:
        raise HTTPException(404, "Mission checkpoint not found.") from error
    except (ValueError, RuntimeError) as error:
        raise HTTPException(422, str(error)) from error
    except OSError as error:
        raise HTTPException(
            503, "Mission storage is unavailable. Check the local artifact directory."
        ) from error


@router.get("", response_model=MissionCatalog)
async def catalog(request: Request) -> MissionCatalog:
    with errors():
        return await asyncio.to_thread(manager(request).catalog)


@router.post("", response_model=MissionView, status_code=201)
async def start(body: MissionRequest, request: Request) -> MissionView:
    with errors():
        return await manager(request).start(body)


@router.post("/draft", response_model=MissionDraft)
async def draft(body: InstructionRequest, request: Request) -> MissionDraft:
    if not language.language_status().available:
        raise HTTPException(503, language.language_status().message)
    service = manager(request)
    if service.language_lock.locked():
        raise HTTPException(409, "An instruction draft is already being prepared.")
    async with service.language_lock:
        try:
            return await language.draft(body.instruction)
        except TimeoutError as error:
            raise HTTPException(
                504, "Language planning timed out. Use structured selection or retry."
            ) from error
        except ValueError as error:
            raise HTTPException(422, str(error)) from error


@router.get("/{mission_id}", response_model=MissionView)
async def get(mission_id: str, request: Request) -> MissionView:
    with errors():
        return await asyncio.to_thread(manager(request).get, mission_id)


@router.post("/{mission_id}/control", response_model=MissionView)
async def control(mission_id: str, body: MissionControl, request: Request) -> MissionView:
    with errors():
        return await manager(request).control(mission_id, body)


@router.get("/{mission_id}/checkpoint", response_model=GraphCheckpoint)
async def checkpoint(mission_id: str, request: Request) -> GraphCheckpoint:
    with errors():
        return await manager(request).checkpoint(mission_id)
