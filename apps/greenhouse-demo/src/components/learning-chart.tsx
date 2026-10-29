import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { TrainingJob } from '../api/training'
import { useWorkspace } from '../state/workspace'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart'

const config = { loss: { label: 'Fitting loss', color: 'var(--primary)' } }
export function LearningChart({ job }: { job: TrainingJob }) {
	const panel = useWorkspace((state) => state.panel)
	if (panel !== 'train') return null
	const data = (job.history ?? []).map((point) => ({
		step: point.round * (job.request.epochs ?? 120) + point.epoch,
		[`round${point.round}`]: point.loss,
	}))
	return (
		<figure className="min-w-0">
			<ChartContainer
				config={config}
				className="h-44 w-full"
				aria-label="Supervised fitting loss by epoch"
			>
				<LineChart
					accessibilityLayer
					data={data}
					margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="step"
						type="number"
						domain={['dataMin', 'dataMax']}
						tickLine={false}
						axisLine={false}
						minTickGap={30}
					/>
					<YAxis tickLine={false} axisLine={false} width={38} />
					<ChartTooltip content={<ChartTooltipContent />} />
					{[0, 1, 2, 3].map((round) => (
						<Line
							key={round}
							dataKey={`round${round}`}
							type="monotone"
							stroke="var(--primary)"
							dot={false}
							isAnimationActive={false}
							name={`Round ${round} loss`}
						/>
					))}
				</LineChart>
			</ChartContainer>
			<figcaption className="text-muted-foreground text-xs">
				Fitting loss by epoch. Each correction round changes the dataset; compare full task outcomes
				too.
			</figcaption>
		</figure>
	)
}
