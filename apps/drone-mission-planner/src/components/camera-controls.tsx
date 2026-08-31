import { Camera, Eye, Film, Navigation, Orbit } from 'lucide-react'
import { CAMERA_FOV_MAX, CAMERA_FOV_MIN, type CameraMode, clampCameraFov } from '@/camera'
import { Button } from '@/components/ui/button'

const modes = [
	{ id: 'orbit', label: 'Orbit', icon: Orbit },
	{ id: 'follow', label: 'Follow', icon: Navigation },
	{ id: 'chase', label: 'Chase', icon: Camera },
	{ id: 'fpv', label: 'FPV', icon: Eye },
	{ id: 'cinematic', label: 'Cinema', icon: Film },
] as const

export function CameraControls({
	mode,
	fov,
	onModeChange,
	onFovChange,
}: {
	mode: CameraMode
	fov: number
	onModeChange: (mode: CameraMode) => void
	onFovChange: (fov: number) => void
}) {
	return (
		<section
			className="absolute top-[72px] left-[18px] z-[4] rounded-xl border border-white/15 bg-[#08100d]/75 p-2 text-white shadow-xl backdrop-blur-md max-[620px]:top-[66px] max-[620px]:left-3"
			aria-label="Camera controls"
		>
			<div className="flex gap-1">
				{modes.map(({ id, label, icon: Icon }) => (
					<Button
						aria-label={`${label} camera`}
						aria-pressed={mode === id}
						className={
							mode === id
								? 'bg-primary text-primary-foreground hover:bg-primary/90'
								: 'text-white/60 hover:bg-white/10 hover:text-white'
						}
						key={id}
						size="sm"
						variant="ghost"
						onClick={() => onModeChange(id)}
					>
						<Icon />
						<span className="max-[860px]:sr-only">{label}</span>
					</Button>
				))}
			</div>
			<label className="mt-2 flex items-center gap-2 border-white/10 border-t px-1 pt-2">
				<span className="text-[8px] text-white/45 uppercase tracking-[0.1em]">FOV</span>
				<input
					aria-label="Camera field of view"
					className="h-1 flex-1 cursor-pointer accent-primary"
					type="range"
					min={CAMERA_FOV_MIN}
					max={CAMERA_FOV_MAX}
					value={fov}
					onChange={(event) => onFovChange(clampCameraFov(event.target.valueAsNumber))}
				/>
				<output className="w-7 text-right font-mono text-[9px] tabular-nums">{fov}°</output>
			</label>
		</section>
	)
}
