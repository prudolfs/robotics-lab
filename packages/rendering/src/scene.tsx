import { CoordinateAxes } from './axes'
import { SimulatorCamera } from './camera'
import { InfiniteGrid } from './grid'
import { Lights } from './lights'

/**
 * The base 3D scene shared by every simulator view:
 * camera + orbit controls, lights, an infinite ground grid and axes.
 *
 * Children are rendered inside the scene so applications can drop in robots,
 * obstacles and debug overlays without re-implementing the surroundings.
 */
export function SimulatorScene({ children }: { children?: React.ReactNode }) {
	return (
		<>
			<SimulatorCamera />
			<Lights />
			<InfiniteGrid />
			<CoordinateAxes />
			{children}
		</>
	)
}
