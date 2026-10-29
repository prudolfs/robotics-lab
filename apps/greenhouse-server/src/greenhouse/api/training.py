"""Training jobs are subprocesses; endpoint reads and snapshot validation use threads."""

import asyncio

from fastapi import APIRouter, HTTPException, Request

from greenhouse.api.contracts import ComparisonDetail, PolicyDetail
from greenhouse.api.datasets import errors
from greenhouse.api.sessions import scene_from_state
from greenhouse.training.manager import TrainingManager
from greenhouse.training.models import (
    ComparedRollout,
    ComparisonRequest,
    Job,
    TrainingCatalog,
    TrainRequest,
)

router = APIRouter(prefix="/api/v1/greenhouse/training")


def manager(request: Request) -> TrainingManager:
    result: TrainingManager = request.app.state.training
    return result


@router.get("", response_model=TrainingCatalog)
async def catalog(request: Request) -> TrainingCatalog:
    with errors():
        return await asyncio.to_thread(manager(request).catalog)


@router.post("/jobs", response_model=Job, status_code=201)
async def start(body: TrainRequest, request: Request) -> Job:
    service = manager(request)
    if service.active_job or service.lock.locked():
        raise HTTPException(409, "A training job is already active or being prepared.")
    with errors():
        return await service.start(body)


@router.get("/jobs/{job_id}", response_model=Job)
async def status(job_id: str, request: Request) -> Job:
    with errors():
        return await asyncio.to_thread(manager(request).job, job_id)


@router.post("/jobs/{job_id}/cancel", response_model=Job)
async def cancel(job_id: str, request: Request) -> Job:
    with errors():
        return await manager(request).cancel(job_id)


@router.get("/checkpoints/{checkpoint_id}", response_model=PolicyDetail)
async def checkpoint(checkpoint_id: str, request: Request) -> PolicyDetail:
    def read() -> PolicyDetail:
        service = manager(request)
        info = service.checkpoint(checkpoint_id)
        if not info.compatible:
            raise ValueError(
                "This checkpoint is incompatible with the current simulator/policy format."
            )
        evaluation = service.evaluation(checkpoint_id)
        initial = evaluation.episodes[0].initial
        if initial is None:
            raise ValueError("Checkpoint evaluation has no recorded validation example.")
        return PolicyDetail(
            checkpoint=info,
            evaluation=evaluation,
            template=scene_from_state(initial, "learned", "learned_policy"),
        )

    with errors():
        return await asyncio.to_thread(read)


@router.post("/compare", response_model=ComparisonDetail)
async def compare(body: ComparisonRequest, request: Request) -> ComparisonDetail:
    service = manager(request)
    if service.comparison_lock.locked():
        raise HTTPException(409, "A comparison is already running.")
    if len(set(body.checkpoint_ids)) != 2:
        raise HTTPException(422, "Choose two distinct checkpoints.")

    def measure() -> ComparisonDetail:
        from greenhouse.simulation.reference import Reference
        from greenhouse.training.evaluation import rollout

        entries = []
        for checkpoint_id in body.checkpoint_ids:
            info = service.checkpoint(checkpoint_id)
            policy = service.load(checkpoint_id)
            entries.append(
                ComparedRollout(
                    label=f"{info.algorithm.upper()} · {checkpoint_id[:8]} · round {info.round}",
                    checkpoint_id=checkpoint_id,
                    rollout=rollout(body.seed, policy, record=True),
                )
            )
        reference = rollout(body.seed, Reference(), record=True)
        entries.append(
            ComparedRollout(label="Scripted reference", checkpoint_id=None, rollout=reference)
        )
        if reference.initial is None:
            raise ValueError("Comparison has no recorded state.")
        return ComparisonDetail(
            seed=body.seed,
            template=scene_from_state(reference.initial, "learned", "learned_policy"),
            entries=entries,
        )

    async with service.comparison_lock:
        with errors():
            return await asyncio.to_thread(measure)
