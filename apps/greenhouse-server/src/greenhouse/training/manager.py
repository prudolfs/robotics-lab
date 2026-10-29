"""Bounded single-process job ownership with persisted snapshots and child workers."""

import asyncio
import hashlib
import os
import re
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

from greenhouse.datasets.episodes import configuration, validate_episode
from greenhouse.datasets.models import Bundle
from greenhouse.datasets.store import DatasetStore, eligible
from greenhouse.training.files import atomic_model, sha256
from greenhouse.training.models import (
    CheckpointInfo,
    Evaluation,
    Job,
    TrainingCatalog,
    TrainRequest,
    WorkerInput,
)
from greenhouse.training.spec import ARCHITECTURE, FEATURES, POLICY_VERSION

if TYPE_CHECKING:
    from greenhouse.training.policy import LearnedPolicy

MAX_JOBS = 12
MAX_STORAGE = 512 * 1024 * 1024
MAX_SNAPSHOT = 64 * 1024 * 1024
TERMINAL = {"completed", "cancelled", "failed"}


class TrainingManager:
    def __init__(self, root: Path, datasets: DatasetStore):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.datasets = datasets
        self.process: asyncio.subprocess.Process | None = None
        self.monitor: asyncio.Task[None] | None = None
        self.active_job: str | None = None
        self.lock = asyncio.Lock()
        self.comparison_lock = asyncio.Lock()
        self.cache: dict[str, LearnedPolicy] = {}
        self.cache_hashes: dict[str, str] = {}
        for path in self.root.glob("*/status.json"):
            job = Job.model_validate_json(path.read_bytes())
            if job.state not in TERMINAL:
                atomic_model(
                    path,
                    job.model_copy(
                        update={
                            "state": "failed",
                            "phase": "finished",
                            "message": "API ownership was interrupted. Start a new job; "
                            "validated checkpoints remain available.",
                        }
                    ),
                )

    def directory(self, job_id: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{32}", job_id):
            raise ValueError("Invalid training job id.")
        return self.root / job_id

    def checkpoint_path(self, checkpoint_id: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{32}-r[0-3]", checkpoint_id):
            raise ValueError("Invalid checkpoint id.")
        job_id, round_id = checkpoint_id.split("-")
        return self.directory(job_id) / round_id

    def job(self, job_id: str) -> Job:
        directory = self.directory(job_id)
        job = Job.model_validate_json((directory / "status.json").read_bytes())
        return job.model_copy(update={"cancel_requested": (directory / "cancel.flag").exists()})

    def checkpoint(self, checkpoint_id: str) -> CheckpointInfo:
        path = self.checkpoint_path(checkpoint_id).with_suffix(".checkpoint.json")
        info = CheckpointInfo.model_validate_json(path.read_bytes())
        if info.checkpoint_id != checkpoint_id:
            raise ValueError("Checkpoint identity mismatch.")
        compatible = (
            info.configuration == configuration()
            and info.policy_version == POLICY_VERSION
            and info.features == FEATURES
            and info.architecture == ARCHITECTURE
        )
        return info.model_copy(update={"compatible": compatible})

    def evaluation(self, checkpoint_id: str) -> Evaluation:
        return Evaluation.model_validate_json(
            self.checkpoint_path(checkpoint_id).with_suffix(".evaluation.json").read_bytes()
        )

    def catalog(self) -> TrainingCatalog:
        jobs = [self.job(path.parent.name) for path in self.root.glob("*/status.json")]
        jobs.sort(key=lambda item: item.created_at, reverse=True)
        checkpoints = [
            self.checkpoint(path.parent.name + "-" + path.name.split(".")[0])
            for path in self.root.glob("*/*.checkpoint.json")
        ]
        return TrainingCatalog(
            jobs=jobs,
            checkpoints=checkpoints,
            active_job=self.active_job,
            artifact_location=str(self.root),
        )

    def snapshot(self, request: TrainRequest) -> Bundle:
        with self.datasets.lock:
            ids = request.episode_ids if request.episode_ids is not None else self.datasets.ids()
            if len(ids) != len(set(ids)):
                raise ValueError("Episode selection contains duplicate ids.")
            entries = [self.datasets.get(key) for key in ids]
        if request.episode_ids is not None and any(
            not eligible(entry.episode, entry.review) for entry in entries
        ):
            raise ValueError(
                "Selected episodes must be reviewed, included, clean training successes."
            )
        entries = [entry for entry in entries if eligible(entry.episode, entry.review)]
        if not entries or len(entries) > 100:
            raise ValueError("Choose between 1 and 100 eligible training episodes.")
        for entry in entries:
            validate_episode(entry.episode)
        return Bundle(episodes=entries)

    async def start(self, request: TrainRequest) -> Job:
        if self.lock.locked():
            raise ValueError("A training job is being prepared. Wait for it to start.")
        async with self.lock:
            if self.active_job:
                raise ValueError(
                    "A training worker is already active. Cancel it or wait for completion."
                )
            parent = None
            if request.algorithm == "ppo":
                if not request.parent_checkpoint:
                    raise ValueError("PPO requires an explicit compatible imitation checkpoint.")
                parent = await asyncio.to_thread(self.checkpoint, request.parent_checkpoint)
                if parent.algorithm != "bc":
                    raise ValueError(
                        "PPO starts from an imitation checkpoint, not another PPO run."
                    )
                await asyncio.to_thread(self.load, request.parent_checkpoint)
            elif request.parent_checkpoint:
                raise ValueError("Imitation fitting does not take a parent checkpoint.")
            bundle = await asyncio.to_thread(self.snapshot, request)
            payload = bundle.model_dump_json().encode()
            size = await asyncio.to_thread(
                lambda: sum(path.stat().st_size for path in self.root.rglob("*") if path.is_file())
            )
            count = await asyncio.to_thread(lambda: len(list(self.root.glob("*/status.json"))))
            if (
                len(payload) > MAX_SNAPSHOT
                or size + len(payload) + 32 * 1024 * 1024 > MAX_STORAGE
                or count >= MAX_JOBS
            ):
                raise ValueError(
                    "Training artifact limit reached (12 jobs, 512 MiB store, 64 MiB snapshot). "
                    "Select a fresh training directory."
                )
            job_id = uuid4().hex
            directory = self.directory(job_id)
            await asyncio.to_thread(directory.mkdir)
            job = Job(
                job_id=job_id,
                state="preparing",
                phase="snapshot",
                request=request,
                created_at=datetime.now(UTC).isoformat(),
                message="Starting the isolated CPU training worker.",
            )
            specification = WorkerInput(
                owner_pid=os.getpid(),
                job=job,
                dataset_sha256=hashlib.sha256(payload).hexdigest(),
                episode_ids=[entry.episode.episode_id for entry in bundle.episodes],
                episode_sha256=[entry.sha256 for entry in bundle.episodes],
            )

            def prepare() -> None:
                atomic_model(directory / "status.json", job)
                atomic_model(directory / "input.json", specification)
                (directory / "dataset.json").write_bytes(payload)
                if parent is not None:
                    weights = self.checkpoint_path(parent.checkpoint_id).with_suffix(".pt")
                    shutil.copyfile(weights, directory / "parent.pt")
                    if sha256(directory / "parent.pt") != parent.weights_sha256:
                        raise ValueError("Parent checkpoint changed during snapshot preparation.")
                    atomic_model(directory / "parent.json", parent)

            await asyncio.to_thread(prepare)
            self.active_job = job_id
            try:
                with (directory / "worker.log").open("wb") as log:
                    self.process = await asyncio.create_subprocess_exec(
                        sys.executable,
                        "-m",
                        "greenhouse.training.worker",
                        "--job-dir",
                        str(directory),
                        stdout=log,
                        stderr=asyncio.subprocess.STDOUT,
                        env={**os.environ, "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"},
                    )
                self.monitor = asyncio.create_task(self.watch(job_id, self.process))
            except OSError as error:
                self.active_job = None
                failed = job.model_copy(
                    update={
                        "state": "failed",
                        "phase": "finished",
                        "message": f"Worker could not start: {error}",
                    }
                )
                await asyncio.to_thread(atomic_model, directory / "status.json", failed)
                return failed
            return job

    async def watch(self, job_id: str, process: asyncio.subprocess.Process) -> None:
        code = await process.wait()
        job = await asyncio.to_thread(self.job, job_id)
        if job.state not in TERMINAL:
            cancelled = job.cancel_requested
            job = job.model_copy(
                update={
                    "state": "cancelled" if cancelled else "failed",
                    "phase": "finished",
                    "message": "Training cancelled."
                    if cancelled
                    else f"Worker exited with code {code}; inspect worker.log.",
                }
            )
            await asyncio.to_thread(atomic_model, self.directory(job_id) / "status.json", job)
        self.active_job = None
        self.process = None

    async def cancel(self, job_id: str) -> Job:
        job = await asyncio.to_thread(self.job, job_id)
        if job.state in TERMINAL:
            return job
        if self.active_job != job_id:
            raise ValueError("This server does not own the requested active job.")
        await asyncio.to_thread((self.directory(job_id) / "cancel.flag").touch)
        return job.model_copy(update={"cancel_requested": True})

    async def close(self) -> None:
        if self.active_job:
            await self.cancel(self.active_job)
        if self.monitor:
            try:
                await asyncio.wait_for(asyncio.shield(self.monitor), timeout=3)
            except TimeoutError:
                if self.process and self.process.returncode is None:
                    self.process.terminate()
                try:
                    await asyncio.wait_for(asyncio.shield(self.monitor), timeout=3)
                except TimeoutError:
                    if self.process and self.process.returncode is None:
                        self.process.kill()
                    await self.monitor

    def load(self, checkpoint_id: str) -> "LearnedPolicy":
        # Hash and compatibility checks also run on cache hits: changing an artifact
        # must never silently activate an old cached or incompatible model.
        info = self.checkpoint(checkpoint_id)
        weights = self.checkpoint_path(checkpoint_id).with_suffix(".pt")
        if not info.compatible or sha256(weights) != info.weights_sha256:
            raise ValueError("Checkpoint is incompatible or its weights checksum does not match.")
        if (
            checkpoint_id not in self.cache
            or self.cache_hashes.get(checkpoint_id) != info.weights_sha256
        ):
            import torch

            from greenhouse.training.policy import load_weights

            torch.set_num_threads(1)
            if len(self.cache) >= 2:
                oldest = next(iter(self.cache))
                self.cache.pop(oldest)
                self.cache_hashes.pop(oldest, None)
            self.cache[checkpoint_id] = load_weights(weights)
            self.cache_hashes[checkpoint_id] = info.weights_sha256
        return self.cache[checkpoint_id]
