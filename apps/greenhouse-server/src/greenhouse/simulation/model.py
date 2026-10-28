"""Shared physical dimensions for MuJoCo and exported scene descriptions."""

from dataclasses import dataclass
from functools import lru_cache

import mujoco

CONTROL_DT = 0.05
SUBSTEPS = 10
PHYSICS_DT = CONTROL_DT / SUBSTEPS
REACH = 0.34
CAPSULE_RADIUS = 0.05
LOW_HEIGHT = 0.05
CARRY_HEIGHT = 0.28
LIFT_SPEED = 0.18
WHEEL_RADIUS = 0.14
TRAY = (1.65, 0.65)
TRAY_RADIUS = 0.20
MAX_TICKS = 600
SIM_VERSION = "greenhouse-world-v1"


@dataclass(frozen=True)
class Obstacle:
    id: str
    x: float
    y: float
    z: float
    half_x: float
    half_y: float
    half_z: float


WALLS = (
    Obstacle("wall-north", 0, 2.05, 0.12, 3.1, 0.05, 0.12),
    Obstacle("wall-south", 0, -2.05, 0.12, 3.1, 0.05, 0.12),
    Obstacle("wall-east", 3.05, 0, 0.12, 0.05, 2, 0.12),
    Obstacle("wall-west", -3.05, 0, 0.12, 0.05, 2, 0.12),
)
POT_X = (-2.0, -1.0, 0.0, 1.0, 2.0)


@lru_cache(maxsize=1)
def physics_model() -> mujoco.MjModel:
    """The compiled model is immutable; each World owns independent MjData."""
    walls = "".join(
        f'<geom name="{wall.id}" type="box" pos="{wall.x} {wall.y} {wall.z}" '
        f'size="{wall.half_x} {wall.half_y} {wall.half_z}" contype="3" conaffinity="3"/>'
        for wall in WALLS
    )
    pots = "".join(
        f'<geom name="pot-{index}" type="cylinder" pos="{x} 1.65 0.15" '
        'size="0.15 0.15" contype="3" conaffinity="3"/>'
        for index, x in enumerate(POT_X)
    )
    return mujoco.MjModel.from_xml_string(f"""
    <mujoco model="greenhouse-world-v1">
      <option timestep="{PHYSICS_DT}" integrator="implicitfast"/>
      <default><geom friction="0.8 0.01 0.001"/></default>
      <worldbody>
        <geom name="floor" type="plane" size="3 2 0.1" contype="2" conaffinity="2"/>
        {walls}{pots}
        <body name="robot" pos="0 0 0">
          <joint name="x" type="slide" axis="1 0 0" damping="1"/>
          <joint name="y" type="slide" axis="0 1 0" damping="1"/>
          <joint name="yaw" type="hinge" axis="0 0 1" damping="0.3"/>
          <geom name="chassis" type="box" pos="0 0 0.21" size="0.21 0.18 0.14"
            mass="1.8" contype="1" conaffinity="1"/>
          <geom name="wheel-left" type="cylinder" pos="0 0.22 0.14" size="0.14 0.04"
            euler="90 0 0" mass="0.1" contype="1" conaffinity="1"/>
          <geom name="wheel-right" type="cylinder" pos="0 -0.22 0.14" size="0.14 0.04"
            euler="90 0 0" mass="0.1" contype="1" conaffinity="1"/>
        </body>
        <body name="capsule" pos="0 0 0.05">
          <freejoint name="capsule-free"/>
          <geom name="capsule-geom" type="sphere" size="0.05" mass="0.04"
            contype="2" conaffinity="2"/>
        </body>
      </worldbody>
      <actuator>
        <velocity joint="x" kv="40" ctrlrange="-0.6 0.6" forcerange="-10 10"/>
        <velocity joint="y" kv="40" ctrlrange="-0.6 0.6" forcerange="-10 10"/>
        <velocity joint="yaw" kv="5" ctrlrange="-1.6 1.6" forcerange="-3 3"/>
      </actuator>
    </mujoco>
    """)
