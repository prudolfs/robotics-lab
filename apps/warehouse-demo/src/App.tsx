import { useEffect, useState } from 'react'
import { type CameraMode, Scene } from './components/scene'
import type { LayaStage } from './sim/laya-observation'
import type { PredictableStage } from './sim/predictable'
import { BAYS, TRUCK_SLOTS } from './sim/scenario'
import { useWarehouse } from './sim/use-warehouse'
import './styles.css'

type RendererStatus = 'loading' | 'webgpu' | 'unsupported' | 'error'

function clock(seconds: number): string {
	const minutes = Math.floor(seconds / 60)
	return `${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

function stageLabel(stage: PredictableStage | LayaStage): string {
	const labels: Record<PredictableStage | LayaStage, string> = {
		select: 'Selecting cargo and bay',
		'lane-clear': 'Clearing the dock',
		'lane-turn': 'Changing truck lane',
		approach: 'Approaching cargo',
		pickup: 'Picking up cargo',
		lift: 'Lifting cargo',
		retreat: 'Leaving truck',
		turn: 'Turning to rack',
		cross: 'Driving to bay',
		place: 'Placing cargo',
		lower: 'Lowering cargo',
		backtrack: 'Clearing the rack',
		'turn-to-dock': 'Turning to dock',
		'recover-pickup': 'Realigning at truck',
		'recover-place': 'Realigning at bay',
		stalled: 'Paused for review',
		done: 'Complete',
	}
	return labels[stage]
}

function decisionLabel(choices: Record<string, string>): string {
	if (choices.cargo) return `Cargo ${choices.cargo} → bay ${choices.bay}`
	const travel =
		choices.travel === 'at'
			? 'Stop'
			: `${choices.gear === 'reverse' ? 'Reverse' : 'Forward'} ${choices.travel === 'near' ? 'creep' : 'cruise'}`
	const forks = choices.fork === 'below' ? 'raise' : choices.fork === 'above' ? 'lower' : 'hold'
	return `${travel} · steer ${choices.steering?.replaceAll('_', ' ')} · forks ${forks}${choices.action !== 'none' ? ` · ${choices.action}` : ''}`
}

export default function App() {
	const [speed, setSpeed] = useState(1)
	const { controller, state } = useWarehouse(speed)
	const [camera, setCamera] = useState<CameraMode>('overview')
	const [assetsReady, setAssetsReady] = useState(false)
	const [showRoute, setShowRoute] = useState(true)
	const [rendererStatus, setRendererStatus] = useState<RendererStatus>('loading')
	const [wallTime, setWallTime] = useState(() => performance.now())
	useEffect(() => {
		const timer = setInterval(() => setWallTime(performance.now()), 500)
		return () => clearInterval(timer)
	}, [])
	const route = controller.getRoute()
	const mode = controller.getMode()
	const laya = controller.getLaya()
	const responseAge =
		laya.lastResponseAt === null ? null : Math.max(0, (wallTime - laya.lastResponseAt) / 1000)
	const running = state.status === 'running'
	const complete = state.status === 'complete'
	const currentCargo = state.pallets.find((item) => item.id === route.palletId)
	const destination = BAYS.find((item) => item.id === route.bayId)
	const remaining = state.pallets.filter((pallet) => pallet.location.kind === 'truck').length
	const statusLabel = complete
		? 'Delivery complete'
		: route.stage === 'stalled'
			? 'Controller paused'
			: state.contact
				? 'Contact detected'
				: running
					? 'Forklift active'
					: state.status === 'paused'
						? 'Paused'
						: 'Ready to unload'

	return (
		<div className="app-shell">
			<header className="app-header">
				<div className="brand">
					<span className="brand-mark" aria-hidden="true">
						▦
					</span>
					<span>
						Warehouse<span className="brand-light"> Studio</span>
						<small>ROBOTICS LAB</small>
					</span>
				</div>
				<div className="header-context">
					<span className="header-divider" />
					Dock 01 <span className="context-chevron">›</span> Receiving aisle
				</div>
				<div
					className={`environment-badge ${rendererStatus === 'webgpu' ? 'available' : ''}`}
					data-testid="renderer-status"
				>
					<span className="live-dot" />
					{rendererStatus === 'webgpu'
						? 'WEBGPU ACTIVE'
						: rendererStatus === 'loading'
							? 'CHECKING WEBGPU'
							: 'WEBGPU UNAVAILABLE'}
				</div>
			</header>

			<main className="workspace">
				<section className="viewport" aria-label="Warehouse simulation">
					<Scene
						state={state}
						cameraMode={camera}
						route={route}
						showRoute={showRoute}
						onAssetsReady={setAssetsReady}
						onRendererStatus={setRendererStatus}
					/>
					{(rendererStatus !== 'webgpu' || !assetsReady) && (
						<div className="renderer-overlay" role="status">
							<strong>
								{rendererStatus === 'error'
									? 'Could not load the warehouse'
									: rendererStatus === 'unsupported'
										? 'WebGPU is unavailable'
										: 'Preparing the warehouse'}
							</strong>
							<span>
								{rendererStatus === 'loading' || rendererStatus === 'webgpu'
									? 'Loading warehouse assets and initializing WebGPU…'
									: rendererStatus === 'error'
										? 'Reload to retry loading the warehouse assets.'
										: 'Use a browser and device with WebGPU support to view this demo.'}
							</span>
						</div>
					)}
					<div className="scene-heading">
						<span className="eyebrow">SCENARIO 01 / RECEIVING</span>
						<h1>
							Warehouse delivery<span className="title-dot">.</span>
						</h1>
						<p>Watch a forklift move cargo from truck to storage.</p>
					</div>
					<fieldset className="view-controls" aria-label="Camera controls">
						<button
							type="button"
							aria-pressed={camera === 'overview'}
							onClick={() => setCamera('overview')}
						>
							◎ Overview
						</button>
						<button
							type="button"
							aria-pressed={camera === 'follow'}
							onClick={() => setCamera('follow')}
						>
							▣ Follow forklift
						</button>
						<button
							type="button"
							aria-pressed={camera === 'dock'}
							onClick={() => setCamera('dock')}
						>
							Dock
						</button>
						<button
							type="button"
							aria-pressed={camera === 'rack'}
							onClick={() => setCamera('rack')}
						>
							Rack
						</button>
						<button
							type="button"
							aria-pressed={showRoute}
							onClick={() => setShowRoute((value) => !value)}
						>
							◇ Route
						</button>
					</fieldset>
					<div className="viewport-note">
						<span className="note-arrow">↗</span>
						<span>
							12 × 15.5 m warehouse
							<br />
							<small>Two-lane truck</small>
						</span>
					</div>
					<div className="viewport-caption">
						AUTONOMOUS DELIVERY <span>·</span> DOCK 01
					</div>
				</section>

				<aside className="inspector" aria-label="Warehouse inspector">
					<div className="inspector-header">
						<strong>Inspector</strong>
						<span>01 / DELIVERY</span>
					</div>
					<section className="inspector-section">
						<div className="section-title">
							<span>Run configuration</span>
							<small>01</small>
						</div>
						<label className="speed-row" htmlFor="control-mode">
							<span>Autonomous control</span>
							<select
								id="control-mode"
								value={mode}
								onChange={(event) =>
									controller.setMode(event.target.value as 'predictable' | 'laya')
								}
							>
								<option value="predictable">Predictable</option>
								<option value="laya">Full Laya</option>
							</select>
						</label>
						<p className="section-help">
							{mode === 'laya'
								? 'Laya chooses cargo, bays and driving commands. Changing mode restarts the same shipment.'
								: 'The forklift unloads every incoming pallet in a repeatable order.'}
						</p>
						<div className="property-row">
							<span>Scenario seed</span>
							<strong data-testid="seed">{state.seed}</strong>
						</div>
						<div className="property-row">
							<span>Incoming cargo</span>
							<strong>{state.scenario.cargo.length} pallets</strong>
						</div>
						<div className="property-row">
							<span>Existing stock</span>
							<strong>{state.scenario.existing.length} bays</strong>
						</div>
						<label className="speed-row" htmlFor="speed">
							<span>Playback speed</span>
							<select
								id="speed"
								value={mode === 'laya' ? 1 : speed}
								disabled={mode === 'laya'}
								onChange={(event) => setSpeed(Number(event.target.value))}
							>
								<option value={1}>1×</option>
								<option value={4}>4×</option>
								<option value={8}>8×</option>
							</select>
						</label>
					</section>

					{mode === 'laya' && (
						<section className="inspector-section laya-section" aria-label="Laya decisions">
							<div className="section-title">
								<span>Full Laya</span>
								<small data-testid="laya-connection">{laya.connection}</small>
							</div>
							<p className="section-help" data-testid="laya-decision">
								{laya.last
									? decisionLabel(laya.last.choices)
									: 'Waiting to start autonomous decisions.'}
							</p>
							<div className="property-row">
								<span>Response age</span>
								<strong>{responseAge === null ? '—' : `${responseAge.toFixed(1)} s`}</strong>
							</div>
							<div className="property-row">
								<span>Requests / rejected</span>
								<strong>
									{laya.requests} / {laya.rejections.length}
								</strong>
							</div>
							{laya.last && (
								<details>
									<summary>Decision probabilities · {Math.round(laya.last.latencyMs)} ms</summary>
									{Object.entries(laya.last.probabilities).map(([key, values]) => (
										<p className="section-help" key={key}>
											<strong>{key}</strong>:{' '}
											{Object.entries(values)
												.map(([name, p]) => `${name.replaceAll('_', ' ')} ${Math.round(p * 100)}%`)
												.join(' · ')}
										</p>
									))}
								</details>
							)}
							{laya.error && (
								<p className="controller-error" role="status">
									{laya.error}
								</p>
							)}
							{laya.rejections.slice(-3).map((rejection) => (
								<p className="section-help" key={rejection.time}>
									{clock(rejection.time)} · {rejection.reason}
								</p>
							))}
						</section>
					)}

					<section className="inspector-section">
						<div className="section-title">
							<span>Current transfer</span>
							<small>02</small>
						</div>
						<div className="transfer-card">
							<div>
								<span className="tiny-label">PICKUP</span>
								<strong>{route.palletId || '—'}</strong>
								<small>
									{TRUCK_SLOTS.find((item) => item.id === route.slotId)?.lane} truck lane
								</small>
							</div>
							<span className="transfer-arrow">→</span>
							<div>
								<span className="tiny-label">STORAGE</span>
								<strong>{route.bayId || '—'}</strong>
								<small>{destination ? `Bay ${destination.id.slice(1)}` : 'Available bay'}</small>
							</div>
						</div>
						<div className="property-row">
							<span>Step</span>
							<strong className="capitalize" data-testid="stage">
								{stageLabel(route.stage)}
							</strong>
						</div>
						<div className="property-row">
							<span>Current goal</span>
							<strong data-testid="current-goal">
								{route.goal ? `${route.goal.x.toFixed(1)}, ${route.goal.y.toFixed(1)} m` : '—'}
							</strong>
						</div>
						<div className="property-row">
							<span>Carried load</span>
							<strong data-testid="carried-load">{state.forklift.carriedId ?? 'None'}</strong>
						</div>
						<div className="property-row">
							<span>Fork height</span>
							<strong>{state.forklift.forkHeight.toFixed(2)} m</strong>
						</div>
						<div className="property-row">
							<span>Vehicle speed</span>
							<strong>{Math.abs(state.forklift.speed).toFixed(2)} m/s</strong>
						</div>
						<div className="property-row">
							<span>Contact / invalid</span>
							<strong>
								{state.contactCount} / {state.invalidActions}
							</strong>
						</div>
						<div className="progress-track">
							<div style={{ width: `${(state.delivered / state.scenario.cargo.length) * 100}%` }} />
						</div>
						<p className="section-help">
							{state.delivered} stored · {remaining} still in truck
						</p>
					</section>

					<section className="inspector-section bays-section">
						<div className="section-title">
							<span>Storage bays</span>
							<small>03</small>
						</div>
						<div className="bay-grid">
							{BAYS.map((bay) => {
								const occupant = state.pallets.find(
									(item) => item.location.kind === 'bay' && item.location.bayId === bay.id,
								)
								return (
									<div key={bay.id} className={`bay-tile ${occupant ? 'occupied' : 'empty'}`}>
										<span>{bay.id}</span>
										<strong>{occupant?.id ?? 'EMPTY'}</strong>
									</div>
								)
							})}
						</div>
					</section>

					<section className="inspector-section events-section">
						<div className="section-title">
							<span>Events</span>
							<small>04</small>
						</div>
						<ol className="event-list">
							{[...state.events]
								.reverse()
								.slice(0, 4)
								.map((event) => (
									<li key={event.id} className={event.kind}>
										<time>{clock(event.time)}</time>
										<span>{event.text}</span>
									</li>
								))}
						</ol>
					</section>
				</aside>
			</main>

			<footer className="transport">
				<div className="transport-buttons">
					<button
						className="primary-button"
						type="button"
						disabled={
							rendererStatus !== 'webgpu' ||
							!assetsReady ||
							running ||
							complete ||
							route.stage === 'stalled'
						}
						onClick={() => controller.start()}
					>
						{complete
							? '✓ Delivery complete'
							: state.status === 'paused'
								? '▶ Resume'
								: '▶ Start delivery'}
					</button>
					<button type="button" disabled={!running} onClick={() => controller.pause()}>
						Ⅱ Pause
					</button>
					<button type="button" onClick={() => controller.reset()} aria-label="Restart same seed">
						↺ Restart
					</button>
					<button type="button" onClick={() => controller.randomize()}>
						⚄ Randomize
					</button>
				</div>
				<div className="transport-status">
					<strong data-testid="run-status">{statusLabel}</strong>
					<span>
						Seed {state.seed} ·{' '}
						{complete
							? 'All cargo stored'
							: currentCargo?.location.kind === 'bay'
								? 'Cargo stored'
								: 'Delivery in progress'}
					</span>
				</div>
				<div className="transport-timer">
					<strong data-testid="elapsed">{clock(state.elapsed)}</strong>
					<span>SIMULATION TIME</span>
				</div>
			</footer>
		</div>
	)
}
