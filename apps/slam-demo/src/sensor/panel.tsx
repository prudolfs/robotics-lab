import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Acquisition, SensorOptions } from './runtime'

function useAcquisition(acquisition: Acquisition) {
	return useSyncExternalStore(
		acquisition.subscribe,
		acquisition.getSnapshot,
		acquisition.getSnapshot,
	)
}
export function SensorPanel({ acquisition }: { acquisition: Acquisition }) {
	const s = useAcquisition(acquisition),
		canvas = useRef<HTMLCanvasElement>(null)
	const [eye, setEye] = useState<'left' | 'right'>('left')
	useLayoutEffect(() => {
		const node = canvas.current,
			frame = s.latest
		if (!node) return
		const context = node.getContext('2d')
		if (!context) return
		if (!frame) {
			context.clearRect(0, 0, node.width, node.height)
			return
		}
		node.width = frame.calibration.width
		node.height = frame.calibration.height
		context.putImageData(
			new ImageData(new Uint8ClampedArray(frame[eye]), node.width, node.height),
			0,
			0,
		)
	}, [s.latest, eye])
	const k = s.latest?.calibration
	return (
		<section className="camera-slot sensor-panel" aria-label="Stereo camera preview">
			<div className="camera-slot-header">
				<strong>Stereo input</strong>
				<span className="tiny-badge">
					{s.replaying
						? 'RECORDED PIXELS'
						: s.options.mode === 'rendered'
							? 'RENDERED STEREO'
							: 'SYNTHETIC · ORACLE'}
				</span>
			</div>
			<div className="sensor-eye-tabs">
				{(['left', 'right'] as const).map((side) => (
					<button type="button" key={side} aria-pressed={eye === side} onClick={() => setEye(side)}>
						{side === 'left' ? 'Left image' : 'Right image'}
					</button>
				))}
			</div>
			<div className="sensor-image">
				<canvas
					ref={canvas}
					width={640}
					height={480}
					aria-label={`Processed ${eye} image`}
					data-checksum={s.latest?.checksum ?? ''}
				/>
				{s.latest ? (
					<>
						<div
							className="epipolar-line"
							style={{ top: `${(100 * (k?.cy ?? 240)) / (k?.height ?? 480)}%` }}
						/>
						{eye === 'left' && s.latest.vo && (
							<svg
								className="vo-overlay"
								viewBox={`0 0 ${k?.width ?? 640} ${k?.height ?? 480}`}
								aria-label="Visual odometry feature overlay"
							>
								{s.latest.vo.overlays.map((feature) => (
									<g
										key={`${s.latest?.frameId}-${feature.u}-${feature.v}`}
										stroke={feature.accepted ? '#69f4be' : '#ffad78'}
										fill="none"
										strokeWidth="1.1"
									>
										{feature.from && (
											<line
												x1={feature.from[0]}
												y1={feature.from[1]}
												x2={feature.u}
												y2={feature.v}
											/>
										)}
										{feature.prediction && (
											<line
												stroke="#f9e177"
												strokeWidth="1.6"
												x1={feature.prediction[0]}
												y1={feature.prediction[1]}
												x2={feature.u}
												y2={feature.v}
											/>
										)}
										{feature.accepted ? (
											<circle cx={feature.u} cy={feature.v} r="2.5" />
										) : (
											<path d={`M ${feature.u - 2} ${feature.v - 2} l 4 4 m -4 0 l 4 -4`} />
										)}
									</g>
								))}
							</svg>
						)}
						<span className="image-caption">
							Center row ·{' '}
							{s.options.mode === 'synthetic' && !s.replaying
								? 'oracle observations'
								: 'processed image + VO overlay'}
						</span>
					</>
				) : (
					<div className="sensor-empty">{s.error || s.status}</div>
				)}
			</div>
			<div className="sensor-frame-meta" aria-live="off">
				<span data-testid="sensor-frame">
					{s.latest
						? `Pair ${s.latest.frameId} · ${s.latest.timestamp.toFixed(3)} s`
						: 'Waiting for pixels'}
				</span>
				<span data-testid="sensor-generation">Run {s.generation < 0 ? 0 : s.generation}</span>
			</div>
			<div className="camera-slot-footer">
				<span>
					{k?.width ?? 640} × {k?.height ?? 480} · {((k?.baseline ?? 0.12) * 1000).toFixed(0)} mm
				</span>
				<span>10 Hz target · {s.latency.toFixed(1)} ms latency</span>
			</div>
			<p className="sensor-disclosure">
				Exact worker-processed image.{' '}
				{s.latest?.kind === 'synthetic'
					? `${s.latest.observations?.length ?? 0} known correspondences; no image tracking.`
					: s.latest?.vo
						? `${s.latest.vo.status} · ${s.latest.vo.inliers} inliers · ${s.latest.vo.rmse?.toFixed(2) ?? '—'} px residual`
						: 'Visual odometry initializes from rendered pixels.'}
			</p>
		</section>
	)
}
export function SensorControls({
	acquisition,
	locked,
}: {
	acquisition: Acquisition
	locked: boolean
}) {
	const s = useAcquisition(acquisition),
		[fileError, setFileError] = useState('')
	const change = (next: Partial<SensorOptions>) => {
		setFileError('')
		acquisition.configure(next)
	}
	return (
		<section className="inspector-section sensor-controls" aria-label="Stereo acquisition settings">
			<div className="section-heading">
				<h2>Stereo acquisition</h2>
				<span className="section-number">02</span>
			</div>
			<label>
				Input mode
				<select
					aria-label="Sensor input mode"
					disabled={locked || s.replaying}
					value={s.options.mode}
					onChange={(e) => change({ mode: e.target.value as SensorOptions['mode'] })}
				>
					<option value="rendered">Rendered stereo pixels</option>
					<option value="synthetic">Synthetic observations (oracle)</option>
				</select>
			</label>
			<label>
				Timing
				<select
					aria-label="Sensor timing"
					disabled={locked || s.replaying}
					value={s.options.timing}
					onChange={(e) => change({ timing: e.target.value as SensorOptions['timing'] })}
				>
					<option value="realtime">Real time · drop backlog</option>
					<option value="lockstep">Lockstep · wait for worker</option>
				</select>
			</label>
			<label>
				Pixel noise ±{s.options.noise} levels
				<input
					aria-label="Pixel noise amplitude"
					type="range"
					min={0}
					max={64}
					step={8}
					value={s.options.noise}
					disabled={locked || s.replaying}
					onChange={(e) => change({ noise: Number(e.target.value) })}
				/>
			</label>
			<label>
				Dropout {Math.round(s.options.dropout * 100)}%
				<input
					aria-label="Sensor dropout"
					type="range"
					min={0}
					max={0.75}
					step={0.25}
					value={s.options.dropout}
					disabled={locked || s.replaying}
					onChange={(e) => change({ dropout: Number(e.target.value) })}
				/>
			</label>
			<p>
				Seeded noise changes the input pixels. Synthetic mode also perturbs projected observations
				and exposes known IDs.
			</p>
			<dl className="sensor-stats">
				<div>
					<dt>Delivered / real second</dt>
					<dd>{s.wallRate.toFixed(1)} Hz</dd>
				</div>
				<div>
					<dt>Delivered / sim second</dt>
					<dd>{s.rate.toFixed(1)} Hz</dd>
				</div>
				<div>
					<dt>Capture + noise</dt>
					<dd>{s.captureMs.toFixed(1)} ms</dd>
				</div>
				<div>
					<dt>Worker vision processing</dt>
					<dd>{(s.latest?.processingMs ?? 0).toFixed(1)} ms</dd>
				</div>
				<div>
					<dt>Active + pending</dt>
					<dd data-testid="sensor-queue">{s.queueDepth} / 2</dd>
				</div>
				<div>
					<dt>Sensor / backlog drops</dt>
					<dd data-testid="sensor-drops">
						{s.sensorDrops} / {s.backlogDrops}
					</dd>
				</div>
			</dl>
			<div className="sensor-actions">
				<button
					type="button"
					disabled={!s.recorded}
					onClick={() => {
						const url = URL.createObjectURL(
							new Blob([acquisition.download()], { type: 'application/octet-stream' }),
						)
						const a = document.createElement('a')
						a.href = url
						a.download = 'slam-stereo.slamframes'
						a.click()
						setTimeout(() => URL.revokeObjectURL(url), 1000)
					}}
				>
					Save last {s.recorded} pairs
				</button>
				<label className="upload-fixture">
					Replay pixels
					<input
						aria-label="Replay stereo recording"
						type="file"
						accept=".slamframes"
						onChange={async (e) => {
							const file = e.target.files?.[0]
							e.target.value = ''
							if (!file) return
							try {
								if (file.size > 52 * 1024 * 1024) throw Error('Fixture exceeds 52 MB')
								acquisition.replay(await file.arrayBuffer())
								setFileError('')
							} catch (error) {
								setFileError(String(error))
							}
						}}
					/>
				</label>
			</div>
			{s.replaying && (
				<button type="button" onClick={() => acquisition.live()}>
					Return to live sensor
				</button>
			)}
			<p data-testid="sensor-status">
				{s.status}
				{s.replaying ? ' · lockstep, no rendering' : ''}
			</p>
			{(s.error || fileError) && <p role="alert">{s.error || fileError}</p>}
			{s.error && (
				<button type="button" onClick={() => acquisition.retry()}>
					Retry sensor
				</button>
			)}
			<p>
				Stores at most six processed stereo pairs. Replay preserves their timestamps and pixels; it
				does not restore a robot run.
			</p>
		</section>
	)
}

export function VisualInspector({ acquisition }: { acquisition: Acquisition }) {
	const s = useAcquisition(acquisition),
		vo = s.latest?.vo,
		oracle = s.options.mode === 'synthetic' || Boolean(s.latest?.observations)
	return (
		<section className="inspector-section estimator-section" aria-label="Visual odometry">
			<div className="section-heading">
				<h2>Visual odometry</h2>
				<span className="tiny-badge">LOCAL MAP · NO LOOP CLOSURE</span>
			</div>
			<div className={`estimator-status vo-${vo?.status ?? 'initializing'}`}>
				<span className="hollow-dot" />
				<strong data-testid="vo-status">
					{vo?.status ?? (oracle ? 'Oracle input — VO disabled' : 'initializing')}
				</strong>
			</div>
			<p className="section-description" data-testid="vo-reason">
				{vo?.reason ?? 'Waiting for calibrated stereo pixels. Synthetic IDs are not visual tracks.'}
			</p>
			<dl className="sensor-stats">
				<div>
					<dt>Corners / stereo points</dt>
					<dd>
						{vo?.detected ?? 0} / {vo?.stereo ?? 0}
					</dd>
				</div>
				<div>
					<dt>Tracks / PnP inliers</dt>
					<dd>
						{vo?.matches ?? 0} / {vo?.inliers ?? 0}
					</dd>
				</div>
				<div>
					<dt>Reprojection RMS</dt>
					<dd>{vo?.rmse?.toFixed(2) ?? '—'} px</dd>
				</div>
				<div>
					<dt>Local optical X / Y / Z</dt>
					<dd>{vo?.pose?.position.map((v) => v.toFixed(2)).join(' / ') ?? '—'} m</dd>
				</div>
				<div>
					<dt>Last accepted frame</dt>
					<dd>{vo?.acceptedFrameId ?? '—'}</dd>
				</div>
				<div>
					<dt>Aligned position error</dt>
					<dd data-testid="vo-error">{s.visual.error?.toFixed(3) ?? '—'} m</dd>
				</div>
				<div>
					<dt>Aligned trajectory RMS</dt>
					<dd>{s.visual.rms?.toFixed(3) ?? '—'} m</dd>
				</div>
			</dl>
			<p className="section-description">
				Mint: image-derived VO. Amber: wheel odometry. Error uses one initial alignment and
				synchronized truth only for evaluation. A lost pose is the last accepted pose; reset to
				start a new origin.
			</p>
			<p className="section-description">
				Image overlay: circles = accepted; crosses = rejected; lines = tracks; yellow = reprojection
				residual. Persistent stereo landmarks appear in the Sparse map inspector.
			</p>
		</section>
	)
}
