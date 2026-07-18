import { CoordinateAxes } from './axes'
import { SimulatorCamera } from './camera'
import { InfiniteGrid } from './grid'
import { Lights } from './lights'

export type SimulatorSceneProps = {
	/** Show the infinite ground grid. Default: true. (Milestone 14 visualization toggle.) */
	showGrid?: boolean
	/** Show the RGB coordinate axes at the world origin. Default: true.
	 *  (Milestone 14 debug toggle.) */
	showAxes?: boolean
	children?: React.ReactNode
}

/**
 * The base 3D scene shared by every simulator view:
 * camera + orbit controls, lights, an infinite ground grid and axes.
 *
 * Children are rendered inside the scene so applications can drop in robots,
 * obstacles and debug overlays without re-implementing the surroundings.
 *
 * `showGrid` / `showAxes` (milestone 14) let the HUD toggle the scene's debug
 * chrome without touching any other upgrade to the scene.
 */
export function SimulatorScene({
	showGrid = true,
	showAxes = true,
	children,
}: SimulatorSceneProps) {
	return (
		<>
			<SimulatorCamera />
			<Lights />
			{showGrid && <InfiniteGrid />}
			{showAxes && <CoordinateAxes />}
			{children}
		</>
	)
}
