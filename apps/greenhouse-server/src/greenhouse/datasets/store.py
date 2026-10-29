"""Bounded local artifacts with immutable raw episodes and atomic review sidecars."""

import os
import threading
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

from greenhouse.datasets.episodes import Recorder, configuration, digest, validate_episode
from greenhouse.datasets.models import (
    Bundle,
    DatasetSummary,
    Entry,
    Episode,
    EpisodeSummary,
    ImportResult,
    ObservationData,
    Review,
    ValidationReport,
)
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import World

MAX_IMPORT_BYTES = 20 * 1024 * 1024
MAX_EPISODE_BYTES = 4 * 1024 * 1024
MAX_EPISODES = 200
MAX_STORE_BYTES = 256 * 1024 * 1024


def eligible(episode: Episode, review: Review) -> bool:
    final = episode.final_state
    return (
        episode.split == "train"
        and episode.outcome == "success"
        and final.collisions == final.invalid_actions == 0
        and review.label == "usable"
        and not review.excluded
    )


class DatasetStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def _path(self, episode_id: str, review: bool = False) -> Path:
        if len(episode_id) != 32 or any(char not in "0123456789abcdef" for char in episode_id):
            raise ValueError("Invalid episode id.")
        return self.root / f"{episode_id}{'.review' if review else ''}.json"

    def _atomic(self, path: Path, payload: bytes) -> None:
        temporary = self.root / f".{uuid4().hex}.tmp"
        try:
            temporary.write_bytes(payload)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def ids(self) -> list[str]:
        return sorted(path.stem for path in self.root.glob("*.json") if "." not in path.stem)

    def get(self, episode_id: str) -> Entry:
        with self.lock:
            episode = Episode.model_validate_json(self._path(episode_id).read_bytes())
            if episode.episode_id != episode_id:
                raise ValueError("Artifact identity mismatch.")
            review_path = self._path(episode_id, True)
            review = (
                Review.model_validate_json(review_path.read_bytes())
                if review_path.exists()
                else Review()
            )
            return Entry(episode=episode, sha256=digest(episode), review=review)

    def save(self, episode: Episode, review: Review | None = None) -> None:
        self.import_bundle(
            Bundle(
                episodes=[Entry(episode=episode, sha256=digest(episode), review=review or Review())]
            )
        )

    def review(self, episode_id: str, review: Review) -> Entry:
        with self.lock:
            entry = self.get(episode_id)
            if review.label == "usable" and (
                entry.episode.outcome != "success"
                or entry.episode.final_state.collisions
                or entry.episode.final_state.invalid_actions
            ):
                raise ValueError("Only successful, clean demonstrations can be marked usable.")
            self._atomic(self._path(episode_id, True), review.model_dump_json().encode())
            return self.get(episode_id)

    def summary(self) -> DatasetSummary:
        with self.lock:
            entries = [self.get(episode_id) for episode_id in self.ids()]
            return DatasetSummary(
                episodes=[
                    EpisodeSummary(
                        episode_id=entry.episode.episode_id,
                        seed=entry.episode.seed,
                        source=entry.episode.source,
                        split=entry.episode.split,
                        outcome=entry.episode.outcome,
                        steps=len(entry.episode.frames),
                        seconds=entry.episode.frames[-1].simulated_seconds,
                        interventions=sum(frame.intervention for frame in entry.episode.frames),
                        sha256=entry.sha256,
                        review=entry.review,
                    )
                    for entry in entries
                ],
                total_steps=sum(len(entry.episode.frames) for entry in entries),
                eligible_train=sum(eligible(entry.episode, entry.review) for entry in entries),
                artifact_location=str(self.root),
                max_import_bytes=MAX_IMPORT_BYTES,
                max_episodes=MAX_EPISODES,
            )

    def import_bundle(self, bundle: Bundle) -> ImportResult:
        # Validate the entire upload before writing anything. Source claims, labels,
        # split membership, and every stored action/state are checked, not just JSON shape.
        if len({entry.episode.episode_id for entry in bundle.episodes}) != len(bundle.episodes):
            raise ValueError("Duplicate episode ids inside the import.")
        for entry in bundle.episodes:
            if digest(entry.episode) != entry.sha256:
                raise ValueError("Episode checksum mismatch.")
            validate_episode(entry.episode)
            if entry.review.label == "usable" and (
                entry.episode.outcome != "success"
                or entry.episode.final_state.collisions
                or entry.episode.final_state.invalid_actions
            ):
                raise ValueError("Usable label conflicts with the task outcome.")
        with self.lock:
            new: list[Entry] = []
            duplicates = 0
            for entry in bundle.episodes:
                path = self._path(entry.episode.episode_id)
                if path.exists():
                    if self.get(entry.episode.episode_id).sha256 != entry.sha256:
                        raise ValueError("An existing immutable episode has a different checksum.")
                    duplicates += 1
                else:
                    new.append(entry)
            payloads = [
                (
                    self._path(entry.episode.episode_id),
                    entry.episode.model_dump_json().encode(),
                    self._path(entry.episode.episode_id, True),
                    entry.review.model_dump_json().encode(),
                )
                for entry in new
            ]
            if any(len(data) > MAX_EPISODE_BYTES for _, data, _, _ in payloads):
                raise ValueError("An episode exceeds the 4 MiB limit.")
            size = sum(path.stat().st_size for path in self.root.glob("*.json"))
            if (
                len(self.ids()) + len(new) > MAX_EPISODES
                or size + sum(len(data) + len(review) for _, data, _, review in payloads)
                > MAX_STORE_BYTES
            ):
                raise OverflowError(
                    "Dataset storage is full (200 episodes / 256 MiB). "
                    "Export or use another artifact directory."
                )
            written: list[Path] = []
            try:
                for path, data, review_path, review_data in payloads:
                    self._atomic(path, data)
                    written.append(path)
                    self._atomic(review_path, review_data)
                    written.append(review_path)
            except OSError:
                for path in written:
                    path.unlink(missing_ok=True)
                raise
            return ImportResult(imported=len(new), duplicates=duplicates)

    def export(self, ids: list[str] | None = None) -> bytes:
        with self.lock:
            selected = ids if ids is not None else self.ids()
            if not selected or len(selected) > 100:
                raise ValueError("Select between 1 and 100 episodes for an export.")
            # Bound memory before materializing the response.
            if sum(self._path(key).stat().st_size for key in selected) > MAX_IMPORT_BYTES - 100000:
                raise OverflowError(
                    "Export exceeds 20 MiB. Export smaller groups "
                    "using repeated ids query parameters."
                )
            payload = (
                Bundle(episodes=[self.get(key) for key in selected]).model_dump_json().encode()
            )
            if len(payload) > MAX_IMPORT_BYTES:
                raise OverflowError("Export exceeds 20 MiB.")
            return payload

    def validate(self) -> ValidationReport:
        with self.lock:
            entries = [self.get(key) for key in self.ids()]
        errors: list[str] = []
        skipped: list[str] = []
        included: list[str] = []
        for entry in entries:
            episode = entry.episode
            try:
                validate_episode(episode)
                if eligible(episode, entry.review):
                    included.append(episode.episode_id)
                else:
                    skipped.append(
                        f"{episode.episode_id}: {episode.split}, {episode.outcome}, "
                        f"{entry.review.label}, excluded={entry.review.excluded}"
                    )
            except ValueError as error:
                errors.append(f"{episode.episode_id}: {error}")
        return ValidationReport(
            checked=len(entries),
            ready_for_training=bool(included) and not errors,
            eligible_train_ids=included,
            skipped=skipped,
            errors=errors,
        )

    def collect_experts(self, seeds: list[int]) -> DatasetSummary:
        if len(set(seeds)) != len(seeds) or any(not 0 <= seed <= 99 for seed in seeds):
            raise ValueError("Use unique training seeds from 0 through 99.")
        current = configuration()
        with self.lock:
            existing = {
                entry.episode.seed
                for key in self.ids()
                if (entry := self.get(key)).episode.source == "scripted_expert"
                and entry.episode.configuration == current
            }
        entries: list[Entry] = []
        for seed in seeds:
            if seed in existing:
                continue
            world, reference = World(seed), Reference()
            recorder = Recorder(world)
            world.start()
            while world.status == "running":
                before = ObservationData(**asdict(world.observe()))
                action = reference.action(world.observe())
                step = world.step(action)
                recorder.append(before, action, step, world, "scripted_reference", reference.stage)
            episode = recorder.finish(world, "terminal")
            review = Review(
                label="usable",
                excluded=False,
                note="Scripted expert; verified action re-simulation and clean delivery.",
            )
            if not eligible(episode, review):
                review = Review(
                    label="needs_work", note="Scripted expert did not complete a clean delivery."
                )
            entries.append(Entry(episode=episode, sha256=digest(episode), review=review))
        if entries:
            self.import_bundle(Bundle(episodes=entries))
        return self.summary()
