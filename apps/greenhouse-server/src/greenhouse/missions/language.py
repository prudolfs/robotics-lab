"""One optional LangChain tool call translates instructions; it cannot execute motor actions."""

import asyncio
import os
from typing import Any

from langchain_core.tools import StructuredTool

from greenhouse.missions.models import LanguageStatus, MissionDraft, MissionIntent


class PlanningError(ValueError):
    """Safe, user-facing planning rejection."""


def language_status() -> LanguageStatus:
    model = os.environ.get("GREENHOUSE_MISSION_MODEL", "").strip()
    available = bool(model and os.environ.get("OPENAI_API_KEY"))
    return LanguageStatus(
        available=available,
        model=model or None,
        message="Optional instruction planning is configured. "
        "One tool call per draft, no motor calls."
        if available
        else "Language planning is unavailable. "
        "Use the structured mission form without a provider.",
    )


def propose_mission(**arguments: Any) -> dict[str, Any]:
    """Propose a supported greenhouse mission; never execute it."""
    return MissionIntent.model_validate(arguments).model_dump()


mission_tool = StructuredTool.from_function(
    func=propose_mission,
    name="propose_greenhouse_mission",
    description="Propose collection of one to three capsules followed by docking, or dock only. "
    "Use unsupported for watering, plant care, hardware or any other unavailable task.",
    args_schema=MissionIntent,
)


async def draft(instruction: str) -> MissionDraft:
    status = language_status()
    if not status.available or not status.model:
        raise ValueError(status.message)
    # Importing/configuring a provider does not happen on the structured path.
    from langchain.chat_models import init_chat_model

    try:
        model = init_chat_model(status.model, model_provider="openai", timeout=12, max_retries=0)
        runnable = model.bind_tools([mission_tool], tool_choice=mission_tool.name)
        async with asyncio.timeout(15):
            message = await runnable.ainvoke(
                [
                    (
                        "system",
                        "Translate the instruction into one proposed greenhouse mission tool call. "
                        "Only capsule collection followed by docking, or docking alone, "
                        "is supported. "
                        "Do not claim execution. "
                        "Do not reinterpret unsupported tasks as collection. "
                        "For dock only use capsule_count=0. Maximum three capsules. "
                        "Reject instructions requiring more than three "
                        "rather than reducing their count.",
                    ),
                    ("human", instruction),
                ]
            )
        calls = message.tool_calls
        if len(calls) != 1 or calls[0]["name"] != mission_tool.name:
            raise PlanningError("The provider did not return one supported mission tool call.")
        result = mission_tool.invoke(calls[0]["args"])
        intent = MissionIntent.model_validate(result)
        if intent.task == "unsupported":
            raise PlanningError(
                intent.reason or "This instruction requests an unsupported greenhouse task."
            )
        return MissionDraft(intent=intent, model=status.model)
    except (TimeoutError, PlanningError):
        raise
    except Exception as error:
        # Never expose provider credentials, headers or arbitrary upstream bodies.
        raise PlanningError(
            "The language provider could not produce a valid mission. "
            "Retry the draft or use structured selection."
        ) from error
