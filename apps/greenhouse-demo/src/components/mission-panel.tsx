import { useState } from 'react'
import type { SessionView } from '../api/client'
import type { MissionState } from '../api/use-missions'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { NativeSelect, NativeSelectOption } from './ui/native-select'

export function MissionPanel({
	missions,
	session,
	connected,
	checkpointId,
	canStart,
}: {
	missions: MissionState
	session: SessionView | null
	connected: boolean
	checkpointId: string
	canStart: boolean
}) {
	const [count, setCount] = useState(3)
	const [controller, setController] = useState<'learned_policy' | 'scripted_reference'>(
		'learned_policy',
	)
	const [instruction, setInstruction] = useState('Collect three capsules and return to the dock.')
	const current = missions.selected
	const bound =
		!!current &&
		current.request.session_id === session?.session_id &&
		current.request.generation === session?.generation
	const active = current?.state === 'running' || current?.state === 'paused'
	const disabled = !connected || missions.busy
	return (
		<section
			aria-label="Greenhouse missions"
			className="flex flex-col gap-5 border-border border-t px-6 py-7"
		>
			<div>
				<h2 className="font-medium text-xl">Give Pip a greenhouse routine</h2>
				<p className="mt-1 max-w-3xl text-muted-foreground text-sm">
					Collect up to three capsules, verify each delivery, then return to the dock. LangGraph
					chooses skills; the selected actor drives collection. Alignment and docking are scripted.
				</p>
			</div>
			<FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Field>
					<FieldLabel htmlFor="mission-count">Mission plan</FieldLabel>
					<NativeSelect
						id="mission-count"
						value={count}
						onChange={(event) => setCount(Number(event.target.value))}
					>
						{[0, 1, 2, 3].map((value) => (
							<NativeSelectOption key={value} value={value}>
								{value === 0
									? 'Return to dock only'
									: `Collect ${value} capsule${value > 1 ? 's' : ''}, then dock`}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</Field>
				<Field>
					<FieldLabel htmlFor="mission-controller">Collection skill</FieldLabel>
					<NativeSelect
						id="mission-controller"
						value={controller}
						onChange={(event) => setController(event.target.value as typeof controller)}
					>
						<NativeSelectOption value="learned_policy">
							Learned · selected checkpoint
						</NativeSelectOption>
						<NativeSelectOption value="scripted_reference">
							Scripted reference · explicit comparison
						</NativeSelectOption>
					</NativeSelect>
				</Field>
				<Field>
					<FieldLabel htmlFor="mission-history">Mission history</FieldLabel>
					<NativeSelect
						id="mission-history"
						value={current?.mission_id ?? ''}
						onChange={(event) => missions.choose(event.target.value)}
					>
						<NativeSelectOption value="">No saved missions yet</NativeSelectOption>
						{missions.data?.missions.map((item) => (
							<NativeSelectOption key={item.mission_id} value={item.mission_id}>
								{item.mission_id.slice(0, 8)} · {item.state} · {item.delivered}/{item.total}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</Field>
			</FieldGroup>
			<p className="break-all text-muted-foreground text-xs">
				Collection checkpoint:{' '}
				{checkpointId || 'Select a saved checkpoint in the training panel below.'} Reset to a fresh
				world to start a routine. Pending and delivered capsules are staged inventory; one active
				capsule uses the evaluated physics at a time.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={
						disabled || !canStart || (controller === 'learned_policy' && count > 0 && !checkpointId)
					}
					onClick={() =>
						void missions.start(
							{
								task: count ? 'collect_and_dock' : 'return_to_dock',
								capsule_count: count,
								reason: '',
							},
							controller,
							checkpointId,
						)
					}
				>
					Start mission
				</Button>
				<Button
					variant="secondary"
					disabled={disabled || !bound || !active}
					onClick={() => void missions.control(current?.state === 'paused' ? 'resume' : 'pause')}
				>
					{current?.state === 'paused' ? 'Resume mission' : 'Pause mission'}
				</Button>
				<Button
					variant="outline"
					disabled={disabled || !bound || !active}
					onClick={() => void missions.control('cancel')}
				>
					Cancel mission
				</Button>
				<Button
					variant="outline"
					disabled={disabled || !current}
					onClick={() => void missions.inspect()}
				>
					Inspect graph checkpoint
				</Button>
			</div>
			<p role="status" data-testid="mission-message" className="text-sm">
				{missions.message}
			</p>
			{current && (
				<div className="flex flex-col gap-3">
					<p data-testid="mission-status" className="font-medium">
						Mission {current.state} · {current.delivered}/{current.total} delivered ·{' '}
						{current.docked ? 'Dock verified' : 'Dock pending'}
					</p>
					<p className="text-muted-foreground text-sm">
						{current.current_skill?.replaceAll('_', ' ') ?? 'Observing'} ·{' '}
						{current.implementation ?? 'No motor skill selected'} ·{' '}
						{((current.total_ticks ?? 0) * 0.05).toFixed(1)} simulated seconds ·{' '}
						{current.recoveries}/1 recoveries · {current.collisions} collisions ·{' '}
						{current.invalid_actions} invalid actions.
					</p>
					<p className="text-sm">{current.message}</p>
					{!bound && (
						<p className="text-muted-foreground text-sm">
							This checkpoint belongs to an earlier session or generation. It is read-only; start a
							new mission in a fresh world.
						</p>
					)}
					<ol
						aria-label="Mission trace"
						className="grid max-h-72 gap-2 overflow-y-auto text-sm sm:grid-cols-2"
					>
						{(current.trace ?? []).map((item) => (
							<li key={item.sequence} className="border-border border-l-2 pl-3">
								<span className="font-medium">
									{item.node} · {(item.tick * 0.05).toFixed(1)} s
								</span>
								<p className="text-muted-foreground text-xs">{item.message}</p>
							</li>
						))}
					</ol>
				</div>
			)}
			{missions.checkpoint && (
				<p data-testid="graph-checkpoint" className="break-all text-muted-foreground text-xs">
					SQLite graph checkpoint {missions.checkpoint.checkpoint_id ?? 'pending'} · next nodes:{' '}
					{missions.checkpoint.next_nodes.join(', ') || 'finished'} · {missions.checkpoint.message}
				</p>
			)}
			<FieldGroup className="grid gap-4 sm:grid-cols-[1fr_auto]">
				<Field>
					<FieldLabel htmlFor="mission-instruction">
						Optional natural-language instruction
					</FieldLabel>
					<Input
						id="mission-instruction"
						maxLength={500}
						value={instruction}
						onChange={(event) => setInstruction(event.target.value)}
						disabled={!missions.data?.language.available || disabled}
					/>
				</Field>
				<Button
					className="self-end"
					variant="outline"
					disabled={disabled || !missions.data?.language.available || !instruction.trim()}
					onClick={() => void missions.plan(instruction)}
				>
					Draft supported plan
				</Button>
			</FieldGroup>
			<p className="text-muted-foreground text-xs">
				{missions.data?.language.message ?? 'Checking optional language planning…'}
			</p>
			{missions.draft && (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-sm">
						Draft: {missions.draft.intent.task?.replaceAll('_', ' ')} ·{' '}
						{missions.draft.intent.capsule_count} capsules. Review before starting.
					</p>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => setCount(missions.draft?.intent.capsule_count ?? 0)}
					>
						Use draft in mission form
					</Button>
				</div>
			)}
		</section>
	)
}
