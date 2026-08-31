export const CAMERA_MODES = ['orbit', 'follow', 'chase', 'fpv', 'cinematic'] as const
export type CameraMode = (typeof CAMERA_MODES)[number]

export const CAMERA_FOV_MIN = 30
export const CAMERA_FOV_MAX = 90
export const DEFAULT_CAMERA_FOV = 47

export function clampCameraFov(value: number): number {
	return Math.min(CAMERA_FOV_MAX, Math.max(CAMERA_FOV_MIN, value))
}
