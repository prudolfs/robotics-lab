import { createWorld, type World } from '@robotics-lab/core'
import { loadMap, mapNames } from '@robotics-lab/maps'
import type { RobotState } from '@robotics-lab/robot'
import { createLidarConfig, type LidarConfig, type LidarScan } from '@robotics-lab/sensors'
import { create } from 'zustand'
import { createSimulation, robotSpeed, type SimState } from '@/sim/loop'
import { DEFAULT_TELEOP_CONFIG, type TeleopConfig } from '@/sim/teleop'

// Default spawn pose: center of the floor, facing +x.
export const SPAWN_POSE = { x: 0, y: 0, heading: 0 }

/** Default lidar spec for the HUD / sensor inspector. */
export const DEFAULT_LIDAR_CONFIG = createLidarConfig({ range: 8, rayCount: 180 })

export type SimulatorStore = {
	/** App state: names of all maps available to switch between. */
	mapNames: string[]
	/** App state: currently selected map name. */
	selectedMap: string
	/** App state: the world model derived from the selected map. */
	world: World
	/** Observed: latest robot snapshot sampled from the simulation. */
	robot: RobotState
	/** Observed: simulation clock in seconds. */
	simTime: number
	/** Observed: linear robot speed in m/s. */
	speed: number
	/** Observed: the current commanded wheel speeds (m/s). */
	input: { leftWheel: number; rightWheel: number }
	/** Observed: whether the simulation loop is currently advancing. */
	running: boolean
	/** Observed: the most recent lidar scan sampled from the simulation. */
	scan: LidarScan | null
	/** App state: teleop tuning exposed to the HUD slider / speed adjustment. */
	teleop: TeleopConfig
	/** App state: lidar configuration (range / resolution / noise). */
	lidar: LidarConfig
	/** App state: visualization toggles for the sensor overlays. */
	showLidar: boolean
	/** App state: show the robot's onboard camera viewport. */
	showCamera: boolean
	/** App action: switch the active map (the loop resets the sim on change). */
	selectMap: (name: string) => void
	/** App action: tune the teleop throttle (base speed). */
	setBaseSpeed: (value: number) => void
	/** App action: replace the lidar configuration. */
	setLidar: (config: LidarConfig) => void
	/** App action: toggle the lidar ray overlay. */
	toggleLidar: () => void
	/** App action: toggle the robot camera viewport. */
	toggleCamera: () => void
	/** Observer: push the latest simulation snapshot for rendering / HUD. */
	observe: (next: SimState) => void
}

function buildWorld(name: string): World {
	return createWorld(loadMap(name))
}

export function sampleState(next: SimState) {
	return {
		robot: next.robot,
		simTime: next.time,
		speed: robotSpeed(next.robot),
		input: next.input,
		running: next.running,
		scan: next.scan,
	}
}

export const useSimulatorStore = create<SimulatorStore>((set) => {
	const names = mapNames()
	const initial = names[0] ?? ''
	return {
		mapNames: names,
		selectedMap: initial,
		world: buildWorld(initial),
		// The loop is the authority; the store only mirrors its state so React
		// can observe it. The hook calls `observe` every frame after stepping.
		...sampleState(createSimulation({ spawnPose: SPAWN_POSE })),
		teleop: DEFAULT_TELEOP_CONFIG,
		lidar: DEFAULT_LIDAR_CONFIG,
		showLidar: true,
		showCamera: false,
		selectMap: (name) => {
			if (!names.includes(name)) return
			set({ selectedMap: name, world: buildWorld(name) })
		},
		setBaseSpeed: (value) =>
			set((s) => ({
				teleop: { ...s.teleop, baseSpeed: clampPositive(value) },
			})),
		setLidar: (config) => set({ lidar: config }),
		toggleLidar: () => set((s) => ({ showLidar: !s.showLidar })),
		toggleCamera: () => set((s) => ({ showCamera: !s.showCamera })),
		observe: (next) => set(sampleState(next)),
	}
})

/** Teleop throttle must stay strictly positive; clamp UI slip to a small floor. */
function clampPositive(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_TELEOP_CONFIG.baseSpeed
}
