import math

import mujoco
import pytest

from greenhouse.simulation.model import LOW_HEIGHT, MAX_TICKS, TRAY
from greenhouse.simulation.reference import Reference
from greenhouse.simulation.world import Action, World


def run(seed):
    world = World(seed)
    reference = Reference()
    world.start()
    trace = []
    while world.status == "running":
        world.step(reference.action(world.observe()))
        trace.append(world.state())
    return world, trace


def place_capsule_at_tip(world):
    world.data.qpos[3:6] = [*world.tip(), LOW_HEIGHT]
    world.data.qvel[:] = 0
    mujoco.mj_forward(world.model, world.data)


def test_reset_reproduces_fixed_step_trajectory_and_worlds_are_independent():
    first, a = run(42)
    second, b = run(42)
    assert a == b
    assert first.model is second.model and first.data is not second.data
    first.reset(9)
    assert first.state() != second.state()
    first.reset(42)
    assert first.state() == World(42).state()


@pytest.mark.parametrize("seed", list(range(20)) + [10000, 10001, 10029])
def test_reference_completes_feasible_scenarios(seed):
    world, trace = run(seed)
    state = world.state()
    assert state.status == "complete" and state.delivered
    assert state.pickups == 1 and not state.holding
    assert state.collisions == state.invalid_actions == 0
    assert math.hypot(state.capsule[0] - TRAY[0], state.capsule[1] - TRAY[1]) < 0.20
    assert all(item.capsule[2] >= 0.045 for item in trace)
    assert any(item.holding and item.lift_height > 0.25 for item in trace)


def test_measured_speed_and_height_gate_pickup_and_release():
    world = World(42)
    world.start()
    place_capsule_at_tip(world)
    world.data.qvel[0] = 0.5
    world.step(Action(grip="close"))
    assert not world.holding and world.invalid_actions == 1
    world.data.qvel[:] = 0
    place_capsule_at_tip(world)
    world.lift_height = 0.25
    world.step(Action(grip="close"))
    assert not world.holding and world.invalid_actions == 2
    world.lift_height = LOW_HEIGHT
    world.step(Action(grip="close"))
    assert world.holding
    for _ in range(30):
        world.step(Action(lift=1))
    world.step(Action(grip="open"))
    assert world.holding and world.invalid_actions == 3
    for _ in range(30):
        world.step(Action(lift=-1))
    world.step(Action(grip="open"))
    assert not world.holding and not world.delivered
    assert world.status == "running"


def test_floor_contact_pause_and_terminal_freeze():
    world = World(42)
    world.start()
    for _ in range(40):
        world.step(Action())
    assert 0.045 < world.state().capsule[2] < 0.055
    world.pause()
    before = world.state()
    for _ in range(20):
        world.step(Action(throttle=1, lift=1, grip="close"))
    assert world.state() == before
    assert world.start()
    while world.status == "running":
        result = world.step(Action())
    assert world.tick == MAX_TICKS and result.truncated and not result.terminated
    before = world.state()
    world.step(Action(throttle=1))
    assert world.state() == before


@pytest.mark.parametrize("x,y,heading", [(2.7, 0, 0), (0, 0.95, math.pi / 2)])
def test_walls_and_pots_stop_a_run(x, y, heading):
    world = World(42)
    world.data.qpos[:3] = [x, y, heading]
    mujoco.mj_forward(world.model, world.data)
    world.start()
    for _ in range(80):
        world.step(Action(throttle=1))
        if world.status != "running":
            break
    assert world.status == "failed" and world.collisions == 1
    assert "Collision" in world.reason


def test_nonfinite_actions_and_bad_seeds_are_rejected_without_mutation():
    world = World(42)
    before = world.state()
    for value in [math.nan, math.inf, -math.inf]:
        with pytest.raises(ValueError):
            world.step(Action(throttle=value))
    for seed in [-1, 2**31, True, 4.2]:
        with pytest.raises(ValueError):
            world.reset(seed)
    assert world.state() == before


def test_scenario_generation_stays_in_the_reachable_clear_corridor():
    world = World(0)
    for seed in range(1000):
        world.reset(seed)
        state = world.state()
        assert -1.6 <= state.x <= -0.8 and -0.7 <= state.y <= 0.7
        assert -0.1 <= state.capsule[0] <= 0.65 and -0.7 <= state.capsule[1] <= 0.7
        assert world.observe().distance > 0.55
        assert state.tick == 0 and not state.holding and not state.delivered
