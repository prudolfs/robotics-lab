"""Bounded latest-state streaming; slow clients never queue simulation frames."""

import asyncio
import contextlib
import os

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from greenhouse.api.contracts import Heartbeat, Hello, ServerMessage, StreamError, client_adapter
from greenhouse.api.sessions import Sessions


async def stream_session(websocket: WebSocket, session_id: str) -> None:
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
    lock = asyncio.Lock()
    loop = asyncio.get_running_loop()
    last_revision = -1
    last_snapshot = float("-inf")
    last_send = loop.time()

    async def send(message: ServerMessage) -> None:
        nonlocal last_send
        async with lock:
            await asyncio.wait_for(websocket.send_text(message.model_dump_json()), timeout=2)
            last_send = loop.time()

    async def snapshot() -> None:
        nonlocal last_revision, last_snapshot, last_send
        async with lock:
            await asyncio.sleep(max(0, 0.1 - (loop.time() - last_snapshot)))
            revision = session.revision
            text = session.snapshot().model_dump_json()
            await asyncio.wait_for(websocket.send_text(text), timeout=2)
            last_revision = revision
            last_snapshot = last_send = loop.time()

    async def publish() -> None:
        while registry.items.get(session_id) is session:
            if session.revision != last_revision:
                await snapshot()
            elif loop.time() - last_send >= 1:
                await send(
                    Heartbeat(
                        kind="heartbeat",
                        api_version="1",
                        session_id=session_id,
                        generation=session.generation,
                        tick=session.tick,
                    )
                )
            await asyncio.sleep(0.1)

    async def receive() -> None:
        while registry.items.get(session_id) is session:
            try:
                packet = await asyncio.wait_for(websocket.receive(), timeout=0.5)
            except TimeoutError:
                continue
            if packet["type"] == "websocket.disconnect":
                raise WebSocketDisconnect(packet.get("code", 1000))
            session.last_seen = loop.time()
            try:
                text = packet.get("text")
                if not isinstance(text, str) or len(text) > 4096:
                    raise ValueError("Expected a short JSON text command.")
                command = client_adapter.validate_json(text)
            except (ValidationError, ValueError):
                await send(
                    StreamError(
                        kind="error",
                        api_version="1",
                        session_id=session_id,
                        generation=session.generation,
                        tick=session.tick,
                        message="Expected a valid v1 greenhouse command.",
                    )
                )
                continue
            ack = session.execute(command)
            await send(ack)
            # Continuous input must never wait behind the 10 Hz snapshot gate.
            # The publisher streams its resulting physics state independently.
            if ack.accepted and command.kind not in ("ping", "manual"):
                await snapshot()

    tasks: list[asyncio.Task[None]] = []
    try:
        await websocket.accept()
        await send(
            Hello(
                kind="hello",
                api_version="1",
                session_id=session_id,
                generation=session.generation,
                tick=session.tick,
            )
        )
        await snapshot()
        tasks = [asyncio.create_task(publish()), asyncio.create_task(receive())]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
        await websocket.close(code=1000)
    except WebSocketDisconnect:
        pass
    except TimeoutError:
        with contextlib.suppress(RuntimeError, WebSocketDisconnect):
            await websocket.close(code=1013)
    finally:
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect, TimeoutError):
                await task
        session.disconnect()
