"""Prevent the authored kit from silently drifting away from MuJoCo geometry."""

import json
from pathlib import Path

import pytest

from greenhouse.simulation.model import (
    CAPSULE_RADIUS,
    CARRY_HEIGHT,
    LOW_HEIGHT,
    REACH,
    TRAY,
    TRAY_RADIUS,
    physics_model,
)

MANIFEST = json.loads(
    (Path(__file__).resolve().parents[3] / "assets/greenhouse-demo/manifest.json").read_text()
)


def test_authored_dimensions_match_compiled_collision_geometry():
    model = physics_model()
    robot = MANIFEST["robot"]
    assert model.geom("chassis").pos.tolist() == pytest.approx(robot["chassis"]["center"])
    assert model.geom("chassis").size.tolist() == pytest.approx(robot["chassis"]["halfSize"])
    for index, side in enumerate(["left", "right"]):
        geom = model.geom(f"wheel-{side}")
        assert geom.pos.tolist() == pytest.approx(robot["wheelCenters"][index])
        assert geom.size[0] == robot["wheelRadius"]
        assert geom.size[1] * 2 == robot["wheelWidth"]
    for wall in MANIFEST["walls"]:
        geom = model.geom(wall["id"])
        assert geom.pos.tolist() == pytest.approx(wall["center"])
        assert geom.size.tolist() == pytest.approx(wall["halfSize"])
    for index, position in enumerate(MANIFEST["potPositions"]):
        geom = model.geom(f"pot-{index}")
        assert geom.pos[:2].tolist() == pytest.approx(position[:2])
        assert geom.pos[2] - geom.size[1] == position[2]
        assert geom.size[0] == MANIFEST["pot"]["radius"]
        assert geom.size[1] * 2 == MANIFEST["pot"]["height"]
    assert model.geom("capsule-geom").size[0] == MANIFEST["capsule"]["radius"]
    assert CAPSULE_RADIUS == MANIFEST["capsule"]["radius"]
    assert REACH == robot["gripperReach"]
    assert LOW_HEIGHT == robot["liftMin"]
    assert CARRY_HEIGHT == robot["liftMax"]
    assert TRAY == tuple(MANIFEST["tray"]["position"][:2])
    assert TRAY_RADIUS == MANIFEST["tray"]["acceptanceRadius"]
    assert robot["maxDecorativeHeight"] < MANIFEST["benches"]["minimumUnderside"]
