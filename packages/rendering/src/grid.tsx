import { Grid } from '@react-three/drei'

/**
 * Infinite ground grid on the z=0 plane with two levels of detail, giving the
 * simulator a spatial reference without imposing a finite world.
 */
export function InfiniteGrid() {
	return (
		<Grid
			args={[200, 200]}
			cellSize={0.5}
			cellThickness={0.6}
			cellColor="#9ca3af"
			sectionSize={2}
			sectionThickness={1}
			sectionColor="#6b7280"
			fadeDistance={60}
			fadeStrength={1}
			infiniteGrid
		/>
	)
}
