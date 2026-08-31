import { Canvas } from '@react-three/fiber'
import { Compass, MousePointer2, Rotate3D } from 'lucide-react'
import { useEffect } from 'react'
import { MissionScene } from '@/components/mission-scene'
import { SettingsPanel } from '@/components/settings-panel'
import { StatusBar } from '@/components/status-bar'
import { TopBar } from '@/components/top-bar'
import { usePlannerStore } from '@/store'
import { createWebGPURenderer, supportsWebGPU } from '@/webgpu'

export default function App() {
	const theme = usePlannerStore((state) => state.theme)
	const webgpuSupported = supportsWebGPU()

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
							<MissionScene />
						</Canvas>
					) : (
						<WebGPUFallback />
					)}
					<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_40%,rgb(2_10_7/0.2)_120%)]" />
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
					<div className="absolute bottom-[18px] left-[18px] z-[2] flex gap-3.5 rounded-lg border border-white/15 bg-[#08100d]/35 px-2.5 py-2 text-[11px] text-white/85 backdrop-blur-sm max-[620px]:hidden [&_span]:flex [&_span]:items-center [&_span]:gap-[5px] [&_svg]:size-[13px]">
						<span>
							<MousePointer2 />
							Select
						</span>
						<span>
							<Rotate3D />
							Orbit
						</span>
						<span>Scroll to zoom</span>
					</div>
					<div className="absolute right-5 bottom-[21px] z-[2] grid justify-items-center gap-[5px] text-[11px] text-white/85 drop-shadow-sm">
						<i className="block h-[7px] w-[72px] border-white/80 border-r border-b border-l" />
						<span>10 m</span>
					</div>
				</div>
				<SettingsPanel />
			</main>
			<StatusBar webgpuSupported={webgpuSupported} />
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
