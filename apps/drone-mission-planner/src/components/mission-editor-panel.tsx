import type { LucideIcon } from 'lucide-react'
import {
	Camera,
	Clock3,
	Gauge,
	GripVertical,
	MapPin,
	MapPinPlus,
	PlaneLanding,
	PlaneTakeoff,
	Plus,
	Redo2,
	RotateCcw,
	Trash2,
	Undo2,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { type MissionItem, type MissionItemTemplate, missionWaypoints } from '@/mission-plan'
import { usePlannerStore } from '@/store'

const templates: Array<{ value: MissionItemTemplate; label: string }> = [
	{ value: 'takeoff', label: 'Takeoff' },
	{ value: 'land', label: 'Land' },
	{ value: 'waypoint', label: 'Waypoint' },
	{ value: 'waypoint-altitude', label: 'Waypoint + altitude' },
	{ value: 'rtl', label: 'Return to launch' },
	{ value: 'hold', label: 'Hold / loiter' },
	{ value: 'speed', label: 'Speed change' },
	{ value: 'camera', label: 'Camera trigger' },
]

export function MissionEditorPanel() {
	const missionItems = usePlannerStore((state) => state.missionItems)
	const selectedId = usePlannerStore((state) => state.selectedMissionItemId)
	const editMode = usePlannerStore((state) => state.missionEditMode)
	const altitudeSnap = usePlannerStore((state) => state.altitudeSnap)
	const canUndo = usePlannerStore((state) => state.missionPast.length > 0)
	const canRedo = usePlannerStore((state) => state.missionFuture.length > 0)
	const addMissionItem = usePlannerStore((state) => state.addMissionItem)
	const deleteMissionItem = usePlannerStore((state) => state.deleteMissionItem)
	const reorderMissionItem = usePlannerStore((state) => state.reorderMissionItem)
	const setAltitudeSnap = usePlannerStore((state) => state.setAltitudeSnap)
	const setEditMode = usePlannerStore((state) => state.setMissionEditMode)
	const setSelected = usePlannerStore((state) => state.setSelectedMissionItem)
	const updateMissionItem = usePlannerStore((state) => state.updateMissionItem)
	const undo = usePlannerStore((state) => state.undoMissionEdit)
	const redo = usePlannerStore((state) => state.redoMissionEdit)
	const [template, setTemplate] = useState<MissionItemTemplate>('waypoint-altitude')
	const [draggedId, setDraggedId] = useState<string | null>(null)

	return (
		<section className="border-border border-b p-[18px]" aria-label="Mission editor">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<span className="text-[10px] text-primary uppercase tracking-[0.1em]">
						Mission editor
					</span>
					<p className="mt-1 text-[10px] text-muted-foreground">
						{missionItems.length} items · {missionWaypoints(missionItems).length} waypoints
					</p>
				</div>
				<div className="flex gap-1">
					<Button
						aria-label="Undo mission edit"
						disabled={!canUndo}
						size="icon-xs"
						variant="outline"
						onClick={undo}
					>
						<Undo2 />
					</Button>
					<Button
						aria-label="Redo mission edit"
						disabled={!canRedo}
						size="icon-xs"
						variant="outline"
						onClick={redo}
					>
						<Redo2 />
					</Button>
				</div>
			</div>

			<div className="flex gap-1.5">
				<Button
					aria-pressed={editMode === 'add-waypoint'}
					className="flex-1"
					size="sm"
					variant={editMode === 'add-waypoint' ? 'default' : 'outline'}
					onClick={() => setEditMode(editMode === 'add-waypoint' ? 'select' : 'add-waypoint')}
				>
					<MapPinPlus /> Map waypoint
				</Button>
				<Button
					aria-label="Snap altitude to half a metre"
					aria-pressed={altitudeSnap === 0.5}
					size="sm"
					variant={altitudeSnap === 0.5 ? 'secondary' : 'outline'}
					onClick={() => setAltitudeSnap(altitudeSnap === 0.5 ? null : 0.5)}
				>
					Snap 0.5m
				</Button>
			</div>
			{editMode === 'add-waypoint' && (
				<p className="mt-2 rounded-md border border-primary/25 bg-primary/10 px-2 py-1.5 text-[9px] text-primary">
					Click the map to append a waypoint. Drag any waypoint marker to move it.
				</p>
			)}

			<div className="mt-3 flex gap-1.5">
				<select
					aria-label="New mission item type"
					className="h-7 min-w-0 flex-1 rounded-md border border-input bg-muted px-2 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					value={template}
					onChange={(event) => setTemplate(event.target.value as MissionItemTemplate)}
				>
					{templates.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<Button size="sm" onClick={() => addMissionItem(template, selectedId, 'below')}>
					<Plus /> Add
				</Button>
			</div>

			<ol className="mt-3 grid gap-1.5" aria-label="Mission items">
				{missionItems.map((item, index) => (
					<MissionItemRow
						index={index}
						item={item}
						key={item.id}
						selected={selectedId === item.id}
						onDelete={() => deleteMissionItem(item.id)}
						onDragStart={() => setDraggedId(item.id)}
						onDrop={() => {
							if (draggedId) reorderMissionItem(draggedId, item.id)
							setDraggedId(null)
						}}
						onInsert={(placement) => addMissionItem(template, item.id, placement)}
						onSelect={() => setSelected(item.id)}
						onUpdate={(changes) => updateMissionItem(item.id, changes)}
					/>
				))}
			</ol>
		</section>
	)
}

function MissionItemRow({
	item,
	index,
	selected,
	onDelete,
	onDragStart,
	onDrop,
	onInsert,
	onSelect,
	onUpdate,
}: {
	item: MissionItem
	index: number
	selected: boolean
	onDelete: () => void
	onDragStart: () => void
	onDrop: () => void
	onInsert: (placement: 'above' | 'below') => void
	onSelect: () => void
	onUpdate: (changes: {
		position?: { x: number; y: number }
		altitude?: number | null
		speed?: number
		duration?: number
	}) => void
}) {
	const { icon: Icon, label, detail } = describeMissionItem(item)
	return (
		<li
			className={`rounded-lg border ${selected ? 'border-primary/45 bg-primary/8' : 'border-border bg-muted/35'}`}
			draggable
			onDragOver={(event) => event.preventDefault()}
			onDragStart={(event) => {
				event.dataTransfer.effectAllowed = 'move'
				onDragStart()
			}}
			onDrop={(event) => {
				event.preventDefault()
				onDrop()
			}}
		>
			<button
				className="flex w-full items-center gap-2 p-2 text-left"
				type="button"
				onClick={onSelect}
			>
				<GripVertical className="size-3 cursor-grab text-muted-foreground" />
				<span className="grid size-6 place-items-center rounded-md bg-background text-primary">
					<Icon className="size-3" />
				</span>
				<span className="min-w-0 flex-1">
					<strong className="block truncate font-medium text-[11px]">
						{index + 1}. {label}
					</strong>
					<small className="block truncate text-[9px] text-muted-foreground">{detail}</small>
				</span>
			</button>
			{selected && (
				<div className="grid gap-2 border-border border-t p-2">
					<MissionItemFields item={item} onUpdate={onUpdate} />
					<div className="flex gap-1">
						<Button
							className="flex-1"
							size="xs"
							variant="outline"
							onClick={() => onInsert('above')}
						>
							Insert above
						</Button>
						<Button
							className="flex-1"
							size="xs"
							variant="outline"
							onClick={() => onInsert('below')}
						>
							Insert below
						</Button>
						<Button
							aria-label={`Delete ${label}`}
							size="icon-xs"
							variant="destructive"
							onClick={onDelete}
						>
							<Trash2 />
						</Button>
					</div>
				</div>
			)}
		</li>
	)
}

function MissionItemFields({
	item,
	onUpdate,
}: {
	item: MissionItem
	onUpdate: (changes: {
		position?: { x: number; y: number }
		altitude?: number | null
		speed?: number
		duration?: number
	}) => void
}) {
	if (item.type === 'waypoint') {
		return (
			<div className="grid grid-cols-3 gap-1.5">
				<NumberField
					label="X"
					value={item.position.x}
					onChange={(x) => onUpdate({ position: { ...item.position, x } })}
				/>
				<NumberField
					label="Z"
					value={item.position.y}
					onChange={(y) => onUpdate({ position: { ...item.position, y } })}
				/>
				{item.altitude === null ? (
					<Button size="xs" variant="outline" onClick={() => onUpdate({ altitude: 2.5 })}>
						+ Altitude
					</Button>
				) : (
					<NumberField
						label="Alt"
						value={item.altitude}
						onChange={(altitude) => onUpdate({ altitude })}
					/>
				)}
			</div>
		)
	}
	if (item.type === 'takeoff')
		return (
			<NumberField
				label="Altitude"
				value={item.altitude}
				onChange={(altitude) => onUpdate({ altitude })}
			/>
		)
	if (item.type === 'speed')
		return (
			<NumberField label="Speed m/s" value={item.speed} onChange={(speed) => onUpdate({ speed })} />
		)
	if (item.type === 'hold')
		return (
			<NumberField
				label="Duration s"
				value={item.duration}
				onChange={(duration) => onUpdate({ duration })}
			/>
		)
	if (item.type === 'camera')
		return <p className="text-[9px] text-muted-foreground">Future action: capture still photo</p>
	return <p className="text-[9px] text-muted-foreground">No additional parameters</p>
}

function NumberField({
	label,
	value,
	onChange,
}: {
	label: string
	value: number
	onChange: (value: number) => void
}) {
	return (
		<label className="grid gap-1 text-[8px] text-muted-foreground uppercase">
			{label}
			<input
				className="h-7 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-[10px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
				type="number"
				value={value}
				onChange={(event) => {
					if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber)
				}}
			/>
		</label>
	)
}

function describeMissionItem(item: MissionItem): {
	icon: LucideIcon
	label: string
	detail: string
} {
	switch (item.type) {
		case 'takeoff':
			return { icon: PlaneTakeoff, label: 'Takeoff', detail: `${item.altitude} m AGL` }
		case 'land':
			return { icon: PlaneLanding, label: 'Land', detail: 'Disarm after touchdown' }
		case 'waypoint':
			return {
				icon: MapPin,
				label: item.altitude === null ? 'Waypoint' : 'Waypoint + altitude',
				detail: `${item.position.x.toFixed(1)}, ${item.position.y.toFixed(1)}${item.altitude === null ? '' : ` · ${item.altitude} m`}`,
			}
		case 'rtl':
			return { icon: RotateCcw, label: 'Return to launch', detail: 'Navigate to home' }
		case 'hold':
			return { icon: Clock3, label: 'Hold / loiter', detail: `${item.duration} seconds` }
		case 'speed':
			return { icon: Gauge, label: 'Speed change', detail: `${item.speed} m/s` }
		case 'camera':
			return { icon: Camera, label: 'Camera trigger', detail: 'Photo · future action' }
	}
}
