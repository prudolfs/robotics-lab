import { useSyncExternalStore } from 'react'
import type { Acquisition } from './runtime'
export function LoopInspector({ acquisition }: { acquisition: Acquisition }) {
	const s = useSyncExternalStore(acquisition.subscribe, acquisition.getSnapshot),
		loop = s.latest?.vo?.map?.loop
	const before = s.visual.beforeClosureTrail,
		after = s.visual.displayTrail,
		all = [...before, ...after]
	const xs = all.map((p) => p.x),
		ys = all.map((p) => p.y),
		minX = Math.min(0, ...xs),
		maxX = Math.max(1, ...xs),
		minY = Math.min(0, ...ys),
		maxY = Math.max(1, ...ys),
		scale = Math.min(236 / (maxX - minX), 126 / (maxY - minY))
	const path = (points: typeof after) =>
		points.map((p) => `${12 + (p.x - minX) * scale},${138 - (p.y - minY) * scale}`).join(' ')
	return (
		<section className="inspector-section" aria-label="Loop closure results">
			<div className="section-heading">
				<h2>Loop closure</h2>
				<span className="tiny-badge">GEOMETRIC VERIFICATION</span>
			</div>
			<p className="section-description" data-testid="loop-status">
				{!loop
					? 'Waiting for image-derived map'
					: !loop.enabled
						? 'Disabled · odometry and local mapping only'
						: loop.pending
							? 'Verified constraint · optimizing graph'
							: loop.corrections
								? 'Corrected map committed'
								: 'Searching older visual keyframes'}
			</p>
			<dl className="sensor-stats">
				<div>
					<dt>Appearance archive / 160</dt>
					<dd data-testid="loop-database">{loop?.database ?? 0}</dd>
				</div>
				<div>
					<dt>Applied corrections</dt>
					<dd data-testid="loop-corrections">{loop?.corrections ?? 0}</dd>
				</div>
				<div>
					<dt>Graph constraints</dt>
					<dd>{loop?.edges ?? 0}</dd>
				</div>
				<div>
					<dt>Weighted graph cost</dt>
					<dd>
						{loop?.optimization
							? `${loop.optimization.before.toFixed(2)} → ${loop.optimization.after.toFixed(2)}`
							: '—'}
					</dd>
				</div>
				<div>
					<dt>Graph solve</dt>
					<dd>
						{loop?.optimization
							? `${loop.optimization.iterations} steps · ${loop.optimization.milliseconds.toFixed(1)} ms`
							: '—'}
					</dd>
				</div>
			</dl>
			<svg
				viewBox="0 0 260 150"
				className="loop-chart"
				role="img"
				aria-label="Trajectory before and after the latest loop correction"
			>
				<title>Once-aligned trajectory comparison</title>
				{before.length > 1 && (
					<polyline
						points={path(before)}
						fill="none"
						stroke="#ad96e5"
						strokeWidth="1.5"
						strokeDasharray="4 3"
					/>
				)}
				{after.length > 1 && (
					<polyline points={path(after)} fill="none" stroke="#83dece" strokeWidth="1.8" />
				)}
			</svg>
			<p className="section-description">
				Purple dashed: before the latest closure. Mint: committed trajectory. The reconstruction
				eases into corrections visually; measurements always use committed poses.
			</p>
			<ol className="loop-events" aria-label="Loop closure events">
				{loop?.events
					.slice(-12)
					.reverse()
					.map((e) => (
						<li key={e.id} data-kind={e.kind}>
							<span className={`loop-kind ${e.kind}`}>{e.kind}</span>
							<span>
								Frame {e.frameId} → K{e.candidate}
							</span>
							<p>{e.reason}</p>
							<small>
								Appearance {e.score.toFixed(2)} · {e.inliers}/{e.matches} inliers
								{e.residual !== null ? ` · ${e.residual.toFixed(2)} px` : ''}
							</small>
						</li>
					))}
			</ol>
			{!loop?.events.length && (
				<p className="section-description">
					Candidates require at least 20 seconds of temporal separation. A similar image alone never
					adds a loop.
				</p>
			)}
			<p className="section-description">
				Retrieval uses appearance; verification uses mutual descriptors, stereo depth and
				forward/reverse PnP. Pose distance and simulator truth do not trigger closure. Reset before
				changing the comparison setting.
			</p>
		</section>
	)
}
