"""Lightweight checkpoint compatibility contract; importing it never loads torch."""

POLICY_VERSION = "bc-masked-motors-v1"
ARCHITECTURE = "9 -> 96 tanh -> 96 tanh -> 10 (motor2, active2, lift3, grip3)"
FEATURES = [
    "target_forward/4",
    "target_left/4",
    "distance/4",
    "sin(bearing)",
    "cos(bearing)",
    "speed/0.6",
    "yaw_speed/1.6",
    "(lift_height-0.05)/0.23",
    "holding",
]
