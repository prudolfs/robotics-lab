"""LangGraph task orchestration with SQLite checkpoints and bounded live ownership."""

import asyncio
import contextlib
import json
import re
from pathlib import Path
from typing import Any, TypedDict, cast

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph

from greenhouse.api.sessions import Sessions
from greenhouse.missions.language import language_status
from greenhouse.missions.models import (
    GraphCheckpoint,
    MissionCatalog,
    MissionControl,
    MissionRequest,
    MissionView,
    SkillName,
)
from greenhouse.missions.runtime import MissionRuntime
from greenhouse.missions.skills import CONTRACTS
from greenhouse.training.files import atomic_model
from greenhouse.training.manager import TrainingManager


class GraphState(TypedDict):
    mission_id: str
    skill: str
    outcome: str
    finished: bool
    task_state: dict[str, Any]


class MissionManager:
    def __init__(
        self, root: Path, sessions: Sessions, training: TrainingManager, saver: AsyncSqliteSaver
    ):
        self.root, self.sessions, self.training = root, sessions, training
        self.items: dict[str, MissionRuntime] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.lock, self.storage_lock = asyncio.Lock(), asyncio.Lock()
        self.language_lock = asyncio.Lock()
        root.mkdir(parents=True, exist_ok=True)
        for path in root.glob("*.mission.json"):
            item = MissionView.model_validate_json(path.read_bytes())
            if item.state in ("running", "paused"):
                atomic_model(
                    path,
                    item.model_copy(
                        update={
                            "state": "orphaned",
                            "message": "API restarted; the physical session no longer exists. "
                            "This checkpoint is inspectable but cannot issue commands. "
                            "Start a new mission.",
                        }
                    ),
                )
        builder = StateGraph(GraphState)
        builder.add_node("observe", self.observe)
        builder.add_node("select", self.select)
        builder.add_node("execute", self.execute)
        builder.add_node("verify", self.verify)
        builder.add_node("recover", self.recover)
        builder.add_edge(START, "observe")
        builder.add_edge("observe", "select")
        builder.add_edge("select", "execute")
        builder.add_edge("execute", "verify")
        builder.add_conditional_edges(
            "verify",
            lambda state: (
                "end"
                if state["finished"]
                else "select"
                if state["outcome"] == "verified"
                else "recover"
            ),
            {"end": END, "select": "select", "recover": "recover"},
        )
        builder.add_conditional_edges(
            "recover",
            lambda state: "end" if state["finished"] else "observe",
            {"end": END, "observe": "observe"},
        )
        self.graph = builder.compile(checkpointer=saver)

    def path(self, mission_id: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{32}", mission_id):
            raise ValueError("Invalid mission identity.")
        return self.root / f"{mission_id}.mission.json"

    async def save(self, runtime: MissionRuntime) -> None:
        async with self.storage_lock:
            view = runtime.view()
            await asyncio.to_thread(atomic_model, self.path(runtime.mission_id), view)
            runtime.changed.clear()

    def get(self, mission_id: str) -> MissionView:
        path = self.path(mission_id)
        runtime = self.items.get(mission_id)
        return runtime.view() if runtime else MissionView.model_validate_json(path.read_bytes())

    def catalog(self) -> MissionCatalog:
        ids = {
            path.name.split(".")[0] for path in self.root.glob("*.mission.json")
        } | self.items.keys()
        missions = sorted(
            (self.get(key) for key in ids), key=lambda item: item.created_at, reverse=True
        )
        return MissionCatalog(
            missions=missions,
            skills=CONTRACTS,
            language=language_status(),
            artifact_location=str(self.root),
        )

    def validate(self, request: MissionRequest) -> None:
        session = self.sessions.items.get(request.session_id)
        if not session or session.generation != request.generation or not session.connected:
            raise ValueError("Mission requires the current connected session and generation.")
        if session.seed not in range(100):
            raise ValueError("Interactive missions use training scenario seeds 0–99 only.")
        if session.recorder or session.world.status != "ready" or session.world.tick != 0:
            raise ValueError(
                "Reset to a fresh ready world without recording before starting a mission."
            )
        if session.mission and session.mission.active:
            raise ValueError("This session already owns an active mission.")

    async def start(self, request: MissionRequest) -> MissionView:
        async with self.lock:
            self.validate(request)
            if sum(item.active for item in self.items.values()) >= 4:
                raise ValueError(
                    "Four missions are already active. Cancel one before starting another."
                )
            count, size = await asyncio.to_thread(
                lambda: (
                    len(list(self.root.glob("*.mission.json"))),
                    sum(path.stat().st_size for path in self.root.glob("*") if path.is_file()),
                )
            )
            if count >= 32 or size >= 64 * 1024 * 1024:
                raise ValueError(
                    "Mission store limit reached (32 missions / 64 MiB). Choose a fresh directory."
                )
            policy, weights_hash = None, None
            if request.controller == "learned_policy" and request.intent.capsule_count:
                assert request.checkpoint_id is not None
                policy = await asyncio.to_thread(self.training.load, request.checkpoint_id)
                weights_hash = self.training.checkpoint(request.checkpoint_id).weights_sha256
            self.validate(request)  # Loading must not authorize a stale/mutated world.
            session = self.sessions.items[request.session_id]
            runtime = MissionRuntime(session, request, policy, weights_hash)
            await self.save(runtime)
            session.mission = runtime
            self.items[runtime.mission_id] = runtime
            self.tasks[runtime.mission_id] = asyncio.create_task(self.run(runtime))
            session.revision += 1
            return runtime.view()

    async def checkpoint(self, mission_id: str) -> GraphCheckpoint:
        self.get(mission_id)
        state = await self.graph.aget_state({"configurable": {"thread_id": mission_id}})
        configuration = (state.config or {}).get("configurable", {})
        task = state.values.get("task_state") if state.values else None
        return GraphCheckpoint(
            mission_id=mission_id,
            checkpoint_id=configuration.get("checkpoint_id"),
            next_nodes=list(state.next),
            task_state=MissionView.model_validate_json(json.dumps(task)) if task else None,
        )

    async def control(self, mission_id: str, body: MissionControl) -> MissionView:
        runtime = self.items.get(mission_id)
        if (
            not runtime
            or body.session_id != runtime.request.session_id
            or body.generation != runtime.request.generation
        ):
            raise ValueError(
                "This persisted mission does not belong to the current live session/generation."
            )
        if (
            not runtime.valid_identity()
            or self.sessions.items.get(body.session_id) is not runtime.session
        ):
            raise ValueError(
                "The mission session was reset, replaced or expired; it cannot resume."
            )
        if not runtime.active:
            raise ValueError("This mission has already ended.")
        if body.action == "pause":
            runtime.pause()
        elif body.action == "resume":
            runtime.resume()
        else:
            runtime.invalidate("Mission cancelled explicitly. Robot pose preserved.", "cancelled")
        await self.save(runtime)
        return runtime.view()

    def runtime(self, state: GraphState) -> MissionRuntime:
        runtime = self.items[state["mission_id"]]
        if not runtime.valid_identity():
            runtime.invalidate("Session/generation changed before the next graph node.")
        return runtime

    async def observe(self, state: GraphState) -> dict[str, Any]:
        runtime = self.runtime(state)
        runtime.log(
            "observe", "Observed physical counters, capsule inventory and session identity."
        )
        return {"task_state": runtime.view().model_dump(mode="json")}

    async def select(self, state: GraphState) -> dict[str, Any]:
        runtime = self.runtime(state)
        if not runtime.active:
            return {"skill": "", "finished": True}
        skill = runtime.select()
        runtime.current_skill = skill
        runtime.implementation = runtime.implementation_for(skill)
        runtime.log(
            "select",
            f"Selected {skill}; {runtime.delivered}/{len(runtime.capsules)} capsules verified.",
        )
        return {"skill": skill, "task_state": runtime.view().model_dump(mode="json")}

    async def execute(self, state: GraphState) -> dict[str, Any]:
        runtime = self.runtime(state)
        if not runtime.active:
            return {"outcome": "interrupted", "finished": True}
        skill = state["skill"]
        if skill not in ("align_target", "collect_deliver", "return_to_dock"):
            raise ValueError("Graph selected an unknown skill.")
        await runtime.ready.wait()
        if not runtime.active:
            return {"outcome": "interrupted", "finished": True}
        runtime.begin(cast(SkillName, skill))
        await self.save(runtime)
        # Physics advances on the existing authoritative 20 Hz session clock.
        # The graph checkpoints task boundaries, never individual motor ticks.
        await runtime.skill_done.wait()
        return {"outcome": runtime.result, "task_state": runtime.view().model_dump(mode="json")}

    async def verify(self, state: GraphState) -> dict[str, Any]:
        runtime = self.runtime(state)
        if not runtime.active:
            return {"finished": True, "outcome": "interrupted"}
        valid = runtime.verify()
        if valid:
            runtime.log(
                "verify",
                f"Verified {runtime.current_skill} from physical state, not model narration.",
            )
            if runtime.is_docked:
                runtime.state = "completed"
                runtime.world.status = "complete"
                runtime.freeze()
                runtime.log(
                    "verify", "All requested deliveries and dock pose verified. Mission complete."
                )
        else:
            runtime.log("verify", f"Skill verification failed: {runtime.result}.")
        await self.save(runtime)
        return {
            "outcome": "verified" if valid else runtime.result,
            "finished": runtime.is_docked,
            "task_state": runtime.view().model_dump(mode="json"),
        }

    async def recover(self, state: GraphState) -> dict[str, Any]:
        runtime = self.runtime(state)
        retry = (
            runtime.active
            and runtime.recoveries < 1
            and not runtime.world.holding
            and not runtime.collisions
            and runtime.total_ticks < 3600
            and runtime.result in ("no_progress", "skill_timeout")
        )
        if retry:
            runtime.recoveries += 1
            runtime.log(
                "recover",
                "Bounded replan 1/1: re-observe and retry the same skill without "
                "resetting the robot or substituting the reference controller.",
            )
        else:
            runtime.state = "failed" if runtime.active else runtime.state
            runtime.world.pause()
            runtime.log(
                "recover", f"Mission stopped: {runtime.result}; no further recovery is allowed."
            )
        await self.save(runtime)
        return {"finished": not retry, "task_state": runtime.view().model_dump(mode="json")}

    async def run(self, runtime: MissionRuntime) -> None:
        try:
            await self.graph.ainvoke(
                GraphState(
                    mission_id=runtime.mission_id,
                    skill="",
                    outcome="",
                    finished=False,
                    task_state=runtime.view().model_dump(mode="json"),
                ),
                {"configurable": {"thread_id": runtime.mission_id}, "recursion_limit": 80},
            )
        except asyncio.CancelledError:
            runtime.invalidate(
                "Server stopped. Mission checkpoint is inspectable; physical ownership ended."
            )
            raise
        except Exception:
            runtime.invalidate(
                "Mission graph or skill precondition failed. Inspect the task trace.", "failed"
            )
        finally:
            await self.save(runtime)

    async def flush(self) -> None:
        for runtime in tuple(self.items.values()):
            if (
                runtime.active
                and self.sessions.items.get(runtime.request.session_id) is not runtime.session
            ):
                runtime.invalidate("The owning physical session expired or was replaced.")
            if runtime.active or runtime.changed.is_set():
                await self.save(runtime)

    async def close(self) -> None:
        for runtime in self.items.values():
            runtime.invalidate("Server stopped; physical session ownership ended.")
        for task in self.tasks.values():
            if not task.done():
                task.cancel()
        for task in self.tasks.values():
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await self.flush()
