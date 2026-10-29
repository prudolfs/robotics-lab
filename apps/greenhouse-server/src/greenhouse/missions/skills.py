"""Skill motor controllers and observable completion checks, independent of LangGraph/LLMs."""

import math

from greenhouse.missions.models import SkillContract
from greenhouse.simulation.world import Action, World, clamp

DOCK = (-2.55, -0.85)

CONTRACTS = [
    SkillContract(
        name="align_target",
        implementation="scripted heading alignment",
        preconditions=["empty gripper", "active capsule", "collision-free world"],
        completion=["absolute target bearing <= 0.60 rad", "measured yaw speed <= 0.12 rad/s"],
        failures=["no_progress", "collision", "skill_timeout"],
        max_ticks=160,
    ),
    SkillContract(
        name="collect_deliver",
        implementation="selected learned actor OR explicit scripted reference",
        preconditions=[
            "empty gripper at pickup height",
            "active capsule",
            "target aligned within 0.65 rad",
        ],
        completion=["world delivered flag", "released capsule inside tray", "gripper empty"],
        failures=[
            "no_progress",
            "collision",
            "skill_timeout",
            "policy_or_physics_error",
            "unverified_delivery",
        ],
        max_ticks=600,
    ),
    SkillContract(
        name="return_to_dock",
        implementation="scripted pose controller; no electrical charging",
        preconditions=["gripper empty", "all requested capsules delivered"],
        completion=[
            "within 0.12 m of dock",
            "heading within 0.15 rad of wall-facing pi",
            "measured speed <= 0.035 m/s and yaw speed <= 0.12 rad/s",
        ],
        failures=["no_progress", "collision", "skill_timeout", "gripper_not_empty"],
        max_ticks=600,
    ),
]


def dock_error(world: World) -> tuple[float, float, float]:
    state = world.state()
    dx, dy = DOCK[0] - state.x, DOCK[1] - state.y
    bearing = math.atan2(
        math.sin(math.atan2(dy, dx) - state.heading), math.cos(math.atan2(dy, dx) - state.heading)
    )
    heading = math.atan2(math.sin(math.pi - state.heading), math.cos(math.pi - state.heading))
    return math.hypot(dx, dy), bearing, heading


def docked(world: World) -> bool:
    distance, _, heading = dock_error(world)
    obs = world.observe()
    return (
        not obs.holding
        and distance <= 0.12
        and abs(heading) <= 0.15
        and abs(obs.speed) <= 0.035
        and abs(obs.yaw_speed) <= 0.12
    )


def dock_action(world: World) -> Action:
    distance, bearing, heading = dock_error(world)
    if distance <= 0.08:
        return Action(turn=0 if abs(heading) <= 0.08 else clamp(heading * 1.8, -0.65, 0.65))
    return Action(
        throttle=0 if abs(bearing) > 0.4 else clamp(distance * 2, 0, 0.7),
        turn=clamp(bearing * 2, -0.7, 0.7),
    )


def align_action(world: World) -> Action:
    bearing = world.observe().bearing
    return Action(turn=0 if abs(bearing) <= 0.5 else clamp(bearing * 2, -0.7, 0.7))
