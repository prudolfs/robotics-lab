import type { WarehouseController } from '../sim/controller'
import type { RunSummary } from '../sim/recording'

const name = (mode: RunSummary['mode']) => (mode === 'laya' ? 'Full Laya' : 'Predictable')
const duration = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`

export function RunReview({ controller }: { controller: WarehouseController }) {
	const summary = controller.getSummary()
	const playback = controller.getPlayback()
	const recording = controller.getRecording()
	const comparisons = controller
		.getHistory()
		.filter((item) => item.seed === summary.seed && item.mode !== summary.mode)
	return (
		<section className="inspector-section run-review" aria-label="Run summary">
			<div className="section-title">
				<span>{playback ? 'Recorded run summary' : 'Run summary'}</span>
				<strong data-testid="summary-outcome">{summary.outcome}</strong>
			</div>
			<dl className="summary-grid">
				<div>
					<dt>Delivered</dt>
					<dd>
						{summary.delivered} / {summary.incoming}
					</dd>
				</div>
				<div>
					<dt>Simulated time</dt>
					<dd>{duration(summary.elapsed)}</dd>
				</div>
				<div>
					<dt>Contacts / invalid</dt>
					<dd>
						{summary.contacts} / {summary.invalid}
					</dd>
				</div>
				<div>
					<dt>Pauses</dt>
					<dd data-testid="pause-count">{summary.pauses}</dd>
				</div>
			</dl>
			{summary.reason && <p className="controller-error">{summary.reason}</p>}
			<button type="button" onClick={() => controller.compare()}>
				Compare with {name(summary.mode === 'laya' ? 'predictable' : 'laya')}
			</button>
			<p className="section-help">
				Same seed {summary.seed}; starts a fresh run. The previous result stays below.
			</p>
			{comparisons.map((previous) => (
				<div className="comparison-result" key={previous.mode} data-testid="comparison-result">
					<strong>
						{name(previous.mode)} · {previous.outcome}
					</strong>
					<p>
						{previous.delivered}/{previous.incoming} delivered · {duration(previous.elapsed)} ·{' '}
						{previous.contacts} contacts · {previous.invalid} invalid · {previous.pauses} pauses
					</p>
				</div>
			))}
			{recording && recording.frames.length > 1 && (
				<div className="recording-controls">
					<button
						type="button"
						disabled={Boolean(playback && !playback.finished)}
						onClick={() => controller.replay()}
					>
						Replay recorded Laya run
					</button>
					<p className="section-help">
						Seed {recording.seed} · {duration(recording.summary.elapsed)} ·{' '}
						{recording.decisions.length} decisions. Recording stays in this tab until replaced or
						reloaded.
					</p>
				</div>
			)}
			{playback && (
				<p className="playback-notice" role="status">
					Recorded playback · no model requests.{' '}
					{playback.finished
						? 'Recording finished.'
						: 'Use Start, Pause and playback speed to review.'}
				</p>
			)}
		</section>
	)
}
