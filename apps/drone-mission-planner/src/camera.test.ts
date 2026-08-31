import { CAMERA_FOV_MAX, CAMERA_FOV_MIN, CAMERA_MODES, clampCameraFov } from './camera'

describe('flight camera configuration', () => {
	it('provides every milestone camera mode', () => {
		expect(CAMERA_MODES).toEqual(['orbit', 'follow', 'chase', 'fpv', 'cinematic'])
	})

	it('clamps field of view to a usable perspective range', () => {
		expect(clampCameraFov(10)).toBe(CAMERA_FOV_MIN)
		expect(clampCameraFov(62)).toBe(62)
		expect(clampCameraFov(120)).toBe(CAMERA_FOV_MAX)
	})
})
