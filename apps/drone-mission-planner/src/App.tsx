import { Canvas } from '@react-three/fiber'
import { createDroneSensorConfig, type DroneSensorConfig } from '@robotics-lab/sensors'
import { Compass, Rotate3D } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type CameraMode, DEFAULT_CAMERA_FOV } from '@/camera'
import { CameraControls } from '@/components/camera-controls'
import { ManualFlightHud } from '@/components/manual-flight-hud'
import { MissionScene } from '@/components/mission-scene'
import { SensorHud } from '@/components/sensor-hud'
import { SettingsPanel } from '@/components/settings-panel'
import { SimulationControls } from '@/components/simulation-controls'
import { StatusBar } from '@/components/status-bar'
import { TopBar } from '@/components/top-bar'
import { bootstrapWaypoints } from '@/mission'
import { useDroneSensors } from '@/simulation/use-drone-sensors'
import { useDroneSimulation } from '@/simulation/use-drone-simulation'
import { usePlannerStore } from '@/store'
import { createWebGPURenderer, supportsWebGPU } from '@/webgpu'

const sensorWaypoint = {
	x: bootstrapWaypoints[1]?.position.x ?? 0,
	y: bootstrapWaypoints[1]?.altitude ?? 0,
	z: bootstrapWaypoints[1]?.position.y ?? 0,
}

export default function App() {
	const theme = usePlannerStore((state) => state.theme)
	const world = usePlannerStore((state) => state.world)
	const webgpuSupported = supportsWebGPU()
	const { simulation, controls, flightControl } = useDroneSimulation()
	const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
	const [cameraFov, setCameraFov] = useState(DEFAULT_CAMERA_FOV)
	const [sensorConfig, setSensorConfig] = useState<DroneSensorConfig>(() =>
		createDroneSensorConfig(),
	)
	const [showLidarRays, setShowLidarRays] = useState(true)
	const [showLidarHits, setShowLidarHits] = useState(true)
	const sensorReadings = useDroneSensors(simulation, world, sensorConfig, sensorWaypoint)

	useEffect(() => {
		document.documentElement.classList.toggle('dark', theme === 'dark')
	}, [theme])

	return (
		<div className="grid h-full w-full grid-rows-[68px_minmax(0,1fr)_34px] bg-background max-[620px]:grid-rows-[58px_minmax(0,1fr)_34px]">
			<TopBar />
			<main className="grid min-h-0 grid-cols-[minmax(0,1fr)_318px] max-[620px]:grid-cols-1 max-[860px]:grid-cols-[minmax(0,1fr)_270px] max-[620px]:grid-rows-[minmax(260px,55%)_minmax(0,45%)]">
				<div
					className="relative min-h-0 min-w-0 overflow-hidden bg-[linear-gradient(180deg,#b9d0d2_0%,#e0e2d8_45%,#9da793_100%)] dark:bg-[linear-gradient(180deg,#9eb1aa_0%,#c8d0c5_44%,#727e70_100%)] [&_canvas]:block [&_canvas]:touch-none"
					data-testid="mission-viewport"
				>
					{webgpuSupported ? (
						<Canvas gl={createWebGPURenderer} dpr={[1, 2]} fallback={<WebGPUFallback />}>
							<MissionScene
								droneState={simulation.drone}
								cameraMode={cameraMode}
								cameraFov={cameraFov}
								sensorReadings={sensorReadings}
								showLidarRays={showLidarRays}
								showLidarHits={showLidarHits}
							/>
						</Canvas>
					) : (
						<WebGPUFallback />
					)}
					<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_40%,rgb(2_10_7/0.2)_120%)]" />
					<SimulationControls simulation={simulation} controls={controls} />
					<CameraControls
						mode={cameraMode}
						fov={cameraFov}
						onModeChange={setCameraMode}
						onFovChange={setCameraFov}
					/>
					<ManualFlightHud
						simulation={simulation}
						flightControl={flightControl}
						controls={controls}
					/>
					<SensorHud
						readings={sensorReadings}
						config={sensorConfig}
						showRays={showLidarRays}
						showHits={showLidarHits}
						onConfigChange={setSensorConfig}
						onShowRaysChange={setShowLidarRays}
						onShowHitsChange={setShowLidarHits}
					/>
					<div className="absolute top-[18px] left-[18px] z-[2] flex items-center gap-2 font-semibold text-[11px] text-white/85 uppercase tracking-[0.08em] drop-shadow-sm">
						<span className="rounded border border-white/35 px-[5px] py-[3px] text-[9px]">3D</span>
						Mission space
					</div>
					<div
						className="absolute top-[17px] right-[18px] z-[2] grid size-11 place-items-center rounded-[11px] border border-white/30 bg-[#08100d]/25 text-white backdrop-blur-sm"
						aria-hidden="true"
					>
						<Compass className="size-[22px]" />
						<span className="absolute -top-[7px] -right-[5px] grid size-[17px] place-items-center rounded-full bg-primary font-extrabold text-[8px] text-primary-foreground">
							N
						</span>
					</div>
					<div className="absolute right-5 bottom-[21px] z-[2] grid justify-items-center gap-[5px] text-[11px] text-white/85 drop-shadow-sm">
						<i className="block h-[7px] w-[72px] border-white/80 border-r border-b border-l" />
						<span>10 m</span>
					</div>
				</div>
				<SettingsPanel />
			</main>
			<StatusBar
				webgpuSupported={webgpuSupported}
				simulation={simulation}
				sensorReadings={sensorReadings}
			/>
		</div>
	)
}

function WebGPUFallback() {
	return (
		<div
			className="absolute inset-0 z-[3] grid place-content-center justify-items-center bg-[linear-gradient(180deg,#53665f,#24342d)] p-[30px] text-center text-[#eef5f0]"
			role="alert"
		>
			<span className="mb-4 grid size-12 place-items-center rounded-xl border border-white/20 bg-white/10 text-primary">
				<Rotate3D />
			</span>
			<strong className="text-[17px]">WebGPU is required</strong>
			<p className="mt-[7px] max-w-[380px] text-[#eef5f0]/70 text-xs leading-6">
				Open Flightdeck in a current browser with WebGPU enabled to view the mission space.
			</p>
		</div>
	)
}
