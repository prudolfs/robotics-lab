"""Release boundaries: saturated recording/ack state and a stubborn owned worker."""

import asyncio
import signal
import sys

from greenhouse.api.contracts import client_adapter
from greenhouse.api.sessions import Session
from greenhouse.datasets.store import DatasetStore
from greenhouse.training.manager import TrainingManager


def test_recording_and_snapshot_state_stay_bounded_across_repeated_resets(tmp_path):
    store = DatasetStore(tmp_path / "datasets")
    session = Session(42, connected=True, controller="manual", store=store)

    def command(kind, index):
        session.last_command = -1
        return session.execute(
            client_adapter.validate_python(
                {
                    "api_version": "1",
                    "kind": kind,
                    "session_id": session.session_id,
                    "generation": session.generation,
                    "request_id": f"release-{index}",
                }
            )
        )

    assert command("record", 0).accepted
    for _ in range(700):
        session.advance()
    assert session.recorder is None
    entry = store.get(session.last_episode_id)
    assert len(entry.episode.frames) == 600
    assert entry.episode.outcome == "failure"
    for index in range(1, 1001):
        command("ping", index)
        session.world.event("info", f"event-{index}")
    assert len(session.acknowledgments) == 64
    assert len(session.snapshot().scene.events) == 16
    assert len(session.snapshot().model_dump_json()) < 20000
    for index in range(1001, 1011):
        assert command("reset", index).accepted
        assert session.tick == 0 and session.world.status == "ready"
    assert len(store.ids()) == 1


def test_shutdown_kills_and_reaps_a_worker_that_ignores_termination(tmp_path):
    async def check():
        manager = TrainingManager(tmp_path / "training", DatasetStore(tmp_path / "datasets"))
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
            "print('ready',flush=True); time.sleep(60)",
            stdout=asyncio.subprocess.PIPE,
        )
        try:
            assert await process.stdout.readline() == b"ready\n"
            manager.process = process
            manager.monitor = asyncio.create_task(process.wait())
            await manager.close()
            assert process.returncode == -signal.SIGKILL
            assert manager.monitor.done()
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()

    asyncio.run(check())
