import { useState } from 'react'
import { Scene } from './components/scene'
import { BAYS, TRUCK_SLOTS } from './sim/scenario'
import { useWarehouse } from './sim/use-warehouse'
import './styles.css'

type RendererStatus = 'loading' | 'webgpu' | 'unsupported' | 'error'

function clock(seconds: number): string {
	const minutes = Math.floor(seconds / 60)
	return `${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

export default function App() {
	const [speed, setSpeed] = useState(1)
	const { controller, state } = useWarehouse(speed)
	const [camera, setCamera] = useState<'overview' | 'follow'>('overview')
	const [rendererStatus, setRendererStatus] = useState<RendererStatus>('loading')
	const route = controller.getRoute()
	const running = state.status === 'running'
	const sampleDone = route.stage === 'done'
	const currentCargo = state.pallets.find((item) => item.id === route.palletId)
	const destination = BAYS.find((item) => item.id === route.bayId)
	const remaining = state.scenario.cargo.length - state.delivered
	const statusLabel = sampleDone
		? 'Sample transfer complete'
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
					<Scene state={state} cameraMode={camera} onRendererStatus={setRendererStatus} />
					{rendererStatus !== 'webgpu' && (
						<div className="renderer-overlay" role="status">
							<strong>
								{rendererStatus === 'loading' ? 'Preparing the warehouse' : 'WebGPU is unavailable'}
							</strong>
							<span>
								{rendererStatus === 'loading'
									? 'Initializing the renderer…'
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
					</fieldset>
					<div className="viewport-note">
						<span className="note-arrow">↗</span>
						<span>
							12 × 12 m warehouse
							<br />
							<small>Two-lane truck</small>
						</span>
					</div>
					<div className="viewport-caption">
						PHASE 1 PREVIEW <span>·</span> ONE AUTONOMOUS PALLET TRANSFER
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
						<div className="mode-card">
							<span className="mode-dot" />
							Predictable preview <small>Phase 1</small>
						</div>
						<p className="section-help">
							A fixed one-pallet transfer demonstrates the warehouse and its physical rules. Full
							unloading and controller modes follow in later phases.
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
								value={speed}
								onChange={(event) => setSpeed(Number(event.target.value))}
							>
								<option value={1}>1×</option>
								<option value={4}>4×</option>
							</select>
						</label>
					</section>

					<section className="inspector-section">
						<div className="section-title">
							<span>Current transfer</span>
							<small>02</small>
						</div>
						<div className="transfer-card">
							<div>
								<span className="tiny-label">PICKUP</span>
								<strong>{route.palletId}</strong>
								<small>
									{TRUCK_SLOTS.find((item) => item.id === route.slotId)?.lane} truck lane
								</small>
							</div>
							<span className="transfer-arrow">→</span>
							<div>
								<span className="tiny-label">STORAGE</span>
								<strong>{route.bayId}</strong>
								<small>{destination ? `Bay ${destination.id.slice(1)}` : 'Available bay'}</small>
							</div>
						</div>
						<div className="property-row">
							<span>Step</span>
							<strong className="capitalize" data-testid="stage">
								{sampleDone ? 'Complete' : route.stage}
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
						disabled={rendererStatus !== 'webgpu' || running || sampleDone}
						onClick={() => controller.start()}
					>
						{sampleDone
							? '✓ Sample complete'
							: state.status === 'paused'
								? '▶ Resume'
								: '▶ Start transfer'}
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
						{currentCargo?.location.kind === 'bay' ? 'Cargo stored' : 'Delivery in progress'}
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
