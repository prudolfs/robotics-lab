import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	ArrowUpRight,
	Box,
	Camera,
	Check,
	ChevronRight,
	Compass,
	Focus,
	Keyboard,
	Layers,
	MapPin,
	Pause,
	Play,
	RotateCcw,
	Route,
	ScanLine,
	Settings2,
	SlidersHorizontal,
	Square,
	Target,
} from 'lucide-react'
import { type ReactNode, useCallback, useState, useSyncExternalStore } from 'react'
import { Scene } from './components/scene'
import { SensorControls, SensorPanel } from './sensor/panel'
import { createAcquisition } from './sensor/runtime'
import { ROUTE_DURATION, ROUTE_LENGTH } from './sim/route'
import type { Simulation } from './sim/simulation'
import { useManualInput, useSimulation } from './sim/use-simulation'
import { usePresentation } from './store'

function clock(seconds: number) {
	const mins = Math.floor(seconds / 60)
	return `${String(mins).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}
function Stat({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="stat">
			<span>{label}</span>
			<strong>{children}</strong>
		</div>
	)
}
function PoseTable({ state }: { state: Simulation }) {
	const t = state.truth.pose,
		o = state.odometry.pose
	return (
		<table className="pose-table">
			<caption className="sr-only">Truth and encoder pose comparison</caption>
			<thead>
				<tr>
					<th scope="col">Pose</th>
					<th scope="col">
						<span className="legend-dot truth" />
						Truth
					</th>
					<th scope="col">
						<span className="legend-dot encoder" />
						Encoder
					</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<th scope="row">
						X <small>m</small>
					</th>
					<td data-testid="truth-x">{t.x.toFixed(3)}</td>
					<td>{o.x.toFixed(3)}</td>
				</tr>
				<tr>
					<th scope="row">
						Y <small>m</small>
					</th>
					<td data-testid="truth-y">{t.y.toFixed(3)}</td>
					<td>{o.y.toFixed(3)}</td>
				</tr>
				<tr>
					<th scope="row">
						Yaw <small>°</small>
					</th>
					<td>{(((t.heading * 180) / Math.PI) % 360).toFixed(1)}</td>
					<td>{(((o.heading * 180) / Math.PI) % 360).toFixed(1)}</td>
				</tr>
			</tbody>
		</table>
	)
}
export default function App() {
	const { controller, state } = useSimulation()
	const [acquisition] = useState(() => createAcquisition(controller))
	const sensor = useSyncExternalStore(
		acquisition.subscribe,
		acquisition.getSnapshot,
		acquisition.getSnapshot,
	)
	const [assetsReady, setAssetsReady] = useState(false)
	const [assetFailed, setAssetFailed] = useState(false)
	const handleReady = useCallback(() => setAssetsReady(true), [])
	const handleFailure = useCallback(() => {
		setAssetsReady(false)
		setAssetFailed(true)
	}, [])
	const press = useManualInput(controller)
	const { camera, setCamera, showTruth, showOdometry, showRoute, toggle, quality, setQuality } =
		usePresentation()
	const running = state.status === 'running',
		complete = state.status === 'complete',
		configLocked = state.tick > 0 || running || sensor.replaying
	const drift = Math.hypot(
		state.truth.pose.x - state.odometry.pose.x,
		state.truth.pose.y - state.odometry.pose.y,
	)
	const progress = state.config.mode === 'guided' ? Math.min(1, state.elapsed / ROUTE_DURATION) : 0
	const status = state.collision
		? 'Contact detected'
		: complete
			? 'Loop complete'
			: running
				? 'Running'
				: state.status === 'paused'
					? 'Paused'
					: 'Ready to explore'
	return (
		<div className="app-shell">
			<header className="app-header">
				<a className="brand" href="./" aria-label="SLAM Studio home">
					<span className="brand-mark">
						<ScanLine size={23} />
					</span>
					<span>
						SLAM<span className="brand-light"> Studio</span>
						<small>ROBOTICS LAB</small>
					</span>
				</a>
				<div className="header-context">
					<span className="header-divider" />
					<Box size={15} />
					<span>Inspection lab</span>
					<ChevronRight size={13} />
					<span className="muted">Inspection environment</span>
				</div>
				<span className="environment-badge">
					<span className="live-dot" />
					LOCAL SIMULATION
				</span>
			</header>
			<main className="workspace">
				<section className="viewport" aria-label="Simulation workspace">
					<Scene
						acquisition={acquisition}
						state={state}
						controller={controller}
						onReady={handleReady}
						onFailure={handleFailure}
					/>
					{!assetsReady && !assetFailed && (
						<div className="asset-loading" role="status">
							<span className="loading-orbit" />
							<strong>Preparing the inspection lab</strong>
							<span>Loading models and surface materials…</span>
						</div>
					)}
					<div className="scene-heading">
						<span className="eyebrow">SCENARIO 01 / INDOOR</span>
						<h1>
							Inspection lab<span className="title-dot">.</span>
						</h1>
						<p>Explore the lab. Follow the rover. Inspect the details.</p>
					</div>
					<fieldset className="view-controls" aria-label="Camera controls">
						<button
							type="button"
							aria-pressed={camera === 'overview'}
							onClick={() => setCamera('overview')}
						>
							<Compass size={15} />
							Overview
						</button>
						<button
							type="button"
							aria-pressed={camera === 'follow'}
							onClick={() => setCamera('follow')}
						>
							<Focus size={15} />
							Follow robot
						</button>
						<button
							type="button"
							aria-pressed={camera === 'robot'}
							onClick={() => setCamera('robot')}
						>
							<Camera size={15} />
							Robot eye
						</button>
						<button
							type="button"
							aria-pressed={camera === 'bench'}
							onClick={() => setCamera('bench')}
						>
							<Focus size={15} />
							Workbench
						</button>
					</fieldset>
					<fieldset className="scene-legend" aria-label="Scene layers">
						<span className="eyebrow">LAYERS</span>
						<button type="button" aria-pressed={showRoute} onClick={() => toggle('showRoute')}>
							<span className="line-swatch planned" />
							Planned loop
						</button>
						<button type="button" aria-pressed={showTruth} onClick={() => toggle('showTruth')}>
							<span className="line-swatch actual" />
							Ground truth
						</button>
						<button
							type="button"
							aria-pressed={showOdometry}
							onClick={() => toggle('showOdometry')}
						>
							<span className="line-swatch odometry" />
							Encoder odometry
						</button>
					</fieldset>
					<div className="scene-bottom">
						<div className="world-note">
							<span className="axis-glyph">↗</span>
							<div>
								<strong>10 × 8 m</strong>
								<span>
									{camera === 'robot'
										? 'Left camera mount · presentation view'
										: camera === 'bench'
											? 'Instrument workbench · material inspection'
											: camera === 'follow'
												? 'Camera follows the rover'
												: 'Orbit to inspect · Scroll to zoom'}
								</span>
							</div>
						</div>
						<SensorPanel acquisition={acquisition} />
					</div>
				</section>
				<aside className="inspector" aria-label="Simulation inspector">
					<div className="inspector-title">
						<span>
							<SlidersHorizontal size={17} />
							Inspector
						</span>
						<select
							aria-label="Graphics quality"
							className="quality-select"
							value={quality}
							onChange={(e) => setQuality(e.currentTarget.value as 'standard' | 'low')}
						>
							<option value="standard">Standard graphics</option>
							<option value="low">Low graphics</option>
						</select>
					</div>

					<section className="inspector-section">
						<div className="section-heading">
							<h2>
								<Route size={15} />
								Run configuration
							</h2>
							<span className="section-number">01</span>
						</div>
						<fieldset className="segmented" aria-label="Driving mode">
							<button
								type="button"
								disabled={configLocked}
								aria-pressed={state.config.mode === 'guided'}
								onClick={() => controller.reset({ mode: 'guided' })}
							>
								Guided loop
							</button>
							<button
								type="button"
								disabled={configLocked}
								aria-pressed={state.config.mode === 'manual'}
								onClick={() => controller.reset({ mode: 'manual' })}
							>
								Manual drive
							</button>
						</fieldset>
						<p className="section-description">
							{state.config.mode === 'guided'
								? 'A repeatable route around the equipment island.'
								: 'Start the drive, then use the controls below.'}
						</p>
						<div className="route-stats">
							{state.config.mode === 'guided' ? (
								<>
									<Stat label="Route length">
										{ROUTE_LENGTH.toFixed(1)}
										<small> m</small>
									</Stat>
									<Stat label="Cruise speed">
										0.30<small> m/s</small>
									</Stat>
								</>
							) : (
								<>
									<Stat label="Linear limit">
										0.45<small> m/s</small>
									</Stat>
									<Stat label="Turn limit">
										1.20<small> rad/s</small>
									</Stat>
								</>
							)}
						</div>
						<div className="config-row">
							<label htmlFor="seed">
								<Settings2 size={14} />
								Random seed
							</label>
							<input
								id="seed"
								aria-label="Random seed"
								type="number"
								min="0"
								max="4294967295"
								step="1"
								value={state.config.seed}
								disabled={configLocked}
								onChange={(e) => {
									const seed = e.currentTarget.valueAsNumber
									if (Number.isInteger(seed) && seed >= 0 && seed <= 4294967295)
										controller.reset({ seed })
								}}
							/>
						</div>
						<label className="toggle-row">
							<span>
								Motion & encoder noise<small>Repeatable with the same seed</small>
							</span>
							<input
								type="checkbox"
								checked={state.config.noise}
								disabled={configLocked}
								onChange={(e) => controller.reset({ noise: e.currentTarget.checked })}
							/>
						</label>
						{configLocked && <p className="config-hint">Reset to change the run configuration.</p>}
					</section>
					<SensorControls acquisition={acquisition} locked={configLocked} />
					<section className="inspector-section">
						<div className="section-heading">
							<h2>
								<MapPin size={15} />
								Pose comparison
							</h2>
							<span className="section-number">02</span>
						</div>
						<PoseTable state={state} />
						<div className="drift-stat">
							<span>Position difference</span>
							<strong data-testid="position-difference">
								{drift.toFixed(3)}
								<small> m</small>
							</strong>
						</div>
						<p className="section-description">
							Encoders estimate travel from wheel motion. Noise makes that estimate drift from the
							true position.
						</p>
					</section>
					<section className="inspector-section estimator-section">
						<div className="section-heading">
							<h2>
								<Target size={15} />
								Visual estimator
							</h2>
							<span className="section-number">03</span>
						</div>
						<div className="estimator-status">
							<span className="hollow-dot" />
							<span>Not connected</span>
							<span className="tiny-badge">NO ESTIMATE</span>
						</div>
						<p className="section-description">
							Visual tracking is not available yet. The trails above compare simulation truth with
							encoder odometry.
						</p>
						<div className="estimator-stats">
							<Stat label="Keyframes">—</Stat>
							<Stat label="Landmarks">—</Stat>
						</div>
					</section>
					<section className="drive-section" aria-label="Manual driving controls">
						<div className="section-heading">
							<h2>
								<Keyboard size={15} />
								Drive controls
							</h2>
							<span className="key-badge">WASD</span>
						</div>
						{state.config.mode === 'manual' ? (
							<>
								<div className="drive-pad">
									{[
										{ id: 'forward', name: 'Drive forward', icon: ArrowUp },
										{ id: 'left', name: 'Turn left', icon: ArrowLeft },
										{ id: 'back', name: 'Drive backward', icon: ArrowDown },
										{ id: 'right', name: 'Turn right', icon: ArrowRight },
									].map(({ id, name, icon: Icon }) => (
										<button
											type="button"
											key={id}
											className={`drive-${id}`}
											aria-label={name}
											disabled={!running}
											onPointerDown={(e) => {
												e.currentTarget.setPointerCapture(e.pointerId)
												press(id, true)
											}}
											onPointerUp={() => press(id, false)}
											onPointerCancel={() => press(id, false)}
											onLostPointerCapture={() => press(id, false)}
											onKeyDown={(e) => {
												if (e.key === ' ' || e.key === 'Enter') {
													e.preventDefault()
													press(id, true)
												}
											}}
											onKeyUp={() => press(id, false)}
											onBlur={() => press(id, false)}
										>
											<Icon size={18} />
										</button>
									))}
								</div>
								<p className="section-description">WASD or arrow keys · Space to pause</p>
							</>
						) : (
							<p className="section-description">
								Choose Manual drive before starting to take the wheel. Space pauses either mode.
							</p>
						)}
					</section>
					<div className="inspector-footer">
						<Layers size={14} />
						<span>
							Fixed timestep <strong>60 Hz</strong>
						</span>
						<span>Seed {state.config.seed}</span>
					</div>
				</aside>
			</main>
			<footer className="transport">
				<div className="transport-buttons">
					<button
						type="button"
						className="run-button"
						disabled={complete || !assetsReady || sensor.replaying || Boolean(sensor.error)}
						onClick={() => (running ? controller.pause() : controller.play())}
					>
						{running ? (
							<Pause size={16} fill="currentColor" />
						) : complete ? (
							<Check size={17} />
						) : (
							<Play size={16} fill="currentColor" />
						)}
						{running
							? 'Pause'
							: complete
								? 'Complete'
								: state.status === 'paused'
									? 'Resume'
									: state.config.mode === 'guided'
										? 'Run inspection'
										: 'Start drive'}
					</button>
					<button
						type="button"
						className="reset-button"
						aria-label="Reset simulation"
						title="Reset simulation"
						onClick={() => controller.reset()}
					>
						<RotateCcw size={17} />
					</button>
				</div>
				<div className="transport-progress">
					<div className="progress-label">
						<span
							className={state.collision ? 'contact-text' : ''}
							role="status"
							data-testid="run-status"
						>
							{status}
						</span>
						<span data-testid="elapsed-time">{clock(state.elapsed)}</span>
					</div>
					<progress aria-label="Inspection progress" max={1} value={progress} />
					<div className="progress-caption">
						<span>{state.segment}</span>
						<span>
							{state.config.mode === 'guided' ? `${clock(ROUTE_DURATION)} total` : 'Manual session'}
						</span>
					</div>
				</div>
				<div className="transport-stat">
					<span>DISTANCE</span>
					<strong>
						{state.distance.toFixed(2)} <small>m</small>
					</strong>
				</div>
				<div className="transport-stat speed-stat">
					<span>SPEED</span>
					<strong>
						{Math.hypot(state.truth.velocity.vx, state.truth.velocity.vy).toFixed(2)}{' '}
						<small>m/s</small>
					</strong>
				</div>
				<span className="transport-state">
					<Square size={10} fill="currentColor" />
					SIMULATION ONLY
					<ArrowUpRight size={13} />
				</span>
			</footer>
		</div>
	)
}
