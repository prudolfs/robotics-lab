"""Dataset operations use bounded uploads and a worker thread, outside live stepping."""

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response

from greenhouse.api.contracts import EpisodeDetail
from greenhouse.api.sessions import scene_from_state
from greenhouse.datasets.episodes import configuration
from greenhouse.datasets.models import (
    Bundle,
    DatasetSummary,
    ExpertRequest,
    ImportResult,
    Review,
    ValidationReport,
)
from greenhouse.datasets.store import MAX_IMPORT_BYTES, DatasetStore

router = APIRouter(prefix="/api/v1/greenhouse")


def store(request: Request) -> DatasetStore:
    result: DatasetStore = request.app.state.datasets
    return result


@contextmanager
def errors() -> Iterator[None]:
    try:
        yield
    except FileNotFoundError as error:
        raise HTTPException(404, "Demonstration not found.") from error
    except OverflowError as error:
        raise HTTPException(413, str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except OSError as error:
        raise HTTPException(
            503, "Dataset storage is unavailable. Check the local artifact directory."
        ) from error


@router.get("/dataset", response_model=DatasetSummary)
async def summary(request: Request) -> DatasetSummary:
    with errors():
        return await asyncio.to_thread(store(request).summary)


@router.post("/dataset/expert", response_model=DatasetSummary)
async def experts(body: ExpertRequest, request: Request) -> DatasetSummary:
    lock: asyncio.Lock = request.app.state.dataset_job
    if lock.locked():
        raise HTTPException(409, "A dataset collection or validation is already running.")
    async with lock:
        with errors():
            return await asyncio.to_thread(store(request).collect_experts, body.seeds)


@router.get("/episodes/{episode_id}", response_model=EpisodeDetail)
async def episode(episode_id: str, request: Request) -> EpisodeDetail:
    with errors():
        entry = await asyncio.to_thread(store(request).get, episode_id)
        if entry.episode.configuration != configuration():
            raise ValueError("The demonstration uses an incompatible simulator configuration.")
        first = entry.episode.frames[0]
        return EpisodeDetail(
            entry=entry,
            template=scene_from_state(entry.episode.initial_state, first.stage, first.controller),
        )


@router.patch("/episodes/{episode_id}/review", response_model=EpisodeDetail)
async def review(episode_id: str, body: Review, request: Request) -> EpisodeDetail:
    with errors():
        await asyncio.to_thread(store(request).review, episode_id, body)
        return await episode(episode_id, request)


@router.post("/dataset/validate", response_model=ValidationReport)
async def validate(request: Request) -> ValidationReport:
    lock: asyncio.Lock = request.app.state.dataset_job
    if lock.locked():
        raise HTTPException(409, "A dataset collection or validation is already running.")
    async with lock:
        with errors():
            return await asyncio.to_thread(store(request).validate)


@router.get("/dataset/export")
async def export(
    request: Request, ids: Annotated[list[str] | None, Query(max_length=100)] = None
) -> Response:
    with errors():
        payload = await asyncio.to_thread(store(request).export, ids)
        return Response(
            payload,
            media_type="application/json",
            headers={
                "Content-Disposition": 'attachment; filename="greenhouse-demonstrations-v1.json"'
            },
        )


@router.post("/dataset/import", response_model=ImportResult)
async def import_dataset(request: Request) -> ImportResult:
    lock: asyncio.Lock = request.app.state.dataset_job
    if lock.locked():
        raise HTTPException(409, "A dataset collection or validation is already running.")
    # Stream and count before parsing; an absent or dishonest Content-Length cannot
    # bypass the limit. No archive extraction or client-supplied filesystem paths.
    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > MAX_IMPORT_BYTES:
            raise HTTPException(413, "Import exceeds the 20 MiB limit.")
        payload.extend(chunk)
    async with lock:
        with errors():
            bundle = await asyncio.to_thread(Bundle.model_validate_json, bytes(payload))
            return await asyncio.to_thread(store(request).import_bundle, bundle)
