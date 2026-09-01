import { BookOpen, Cloud, Download, FileJson, History, Moon, Sun, Upload, X } from 'lucide-react'
import { type ChangeEvent, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EXAMPLE_MISSIONS } from '@/mission-examples'
import {
	createMissionFile,
	deserializeMission,
	loadRecentMissions,
	type MissionFile,
	type MissionSnapshot,
	missionFilename,
	missionSignature,
	missionSnapshot,
	saveRecentMission,
	serializeMission,
} from '@/mission-persistence'
import { usePlannerStore } from '@/store'

export function TopBar() {
	const missionName = usePlannerStore((state) => state.missionName)
	const selectedMap = usePlannerStore((state) => state.selectedMap)
	const cruiseAltitude = usePlannerStore((state) => state.cruiseAltitude)
	const cruiseSpeed = usePlannerStore((state) => state.cruiseSpeed)
	const returnToHome = usePlannerStore((state) => state.returnToHome)
	const missionItems = usePlannerStore((state) => state.missionItems)
	const setMissionName = usePlannerStore((state) => state.setMissionName)
	const loadMission = usePlannerStore((state) => state.loadMission)
	const theme = usePlannerStore((state) => state.theme)
	const toggleTheme = usePlannerStore((state) => state.toggleTheme)
	const snapshot = useMemo<MissionSnapshot>(
		() => ({
			name: missionName,
			map: selectedMap,
			settings: { cruiseAltitude, cruiseSpeed, returnToHome },
			items: missionItems,
		}),
		[cruiseAltitude, cruiseSpeed, missionItems, missionName, returnToHome, selectedMap],
	)
	const signature = missionSignature(snapshot)
	const [savedSignature, setSavedSignature] = useState(signature)
	const [status, setStatus] = useState('All changes saved')
	const [dialogOpen, setDialogOpen] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [recentMissions, setRecentMissions] = useState(() => loadRecentMissions())
	const fileInput = useRef<HTMLInputElement>(null)
	const dirty = signature !== savedSignature

	const saveMission = () => {
		const savedAt = new Date().toISOString()
		const file = createMissionFile(snapshot, savedAt)
		const blob = new Blob([serializeMission(snapshot, savedAt)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = missionFilename(snapshot.name)
		document.body.appendChild(anchor)
		anchor.click()
		anchor.remove()
		URL.revokeObjectURL(url)
		setRecentMissions(saveRecentMission(file))
		setSavedSignature(signature)
		setStatus('Saved to file and recents')
	}

	const replaceMission = (next: MissionSnapshot, recentFile?: MissionFile) => {
		if (dirty && !window.confirm('Replace the current unsaved mission?')) return false
		loadMission(next)
		const file = recentFile ?? createMissionFile(next)
		setRecentMissions(saveRecentMission(file))
		setSavedSignature(missionSignature(next))
		setStatus(`Loaded ${next.name}`)
		setLoadError(null)
		setDialogOpen(false)
		return true
	}

	const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		try {
			const mission = deserializeMission(await file.text())
			replaceMission(missionSnapshot(mission), mission)
		} catch (error) {
			setLoadError((error as Error).message)
		} finally {
			event.target.value = ''
		}
	}

	return (
		<>
			<header className="relative z-10 grid h-[68px] grid-cols-[300px_1fr_auto] items-center gap-5 border-border border-b bg-background px-[18px] max-[620px]:h-[58px] max-[860px]:grid-cols-[auto_1fr_auto] max-[620px]:px-3">
				<div className="flex items-center gap-[11px]">
					<span className="grid size-9 place-items-center rounded-[10px] border border-primary/40 bg-primary/10 text-primary">
						<Cloud className="size-5" aria-hidden="true" />
					</span>
					<span className="grid leading-[1.05] max-[860px]:hidden">
						<strong className="text-[15px] tracking-[-0.02em]">Flightdeck</strong>
						<small className="mt-1 text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
							Mission planner
						</small>
					</span>
				</div>
				<div className="grid grid-cols-[auto_minmax(120px,260px)_auto] items-center justify-center gap-2.5 max-[620px]:grid-cols-1 max-[620px]:justify-stretch">
					<span className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] max-[620px]:hidden">
						Mission
					</span>
					<input
						className="min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 font-semibold text-sm outline-none hover:border-border hover:bg-muted focus:border-border focus:bg-muted"
						aria-label="Mission name"
						value={missionName}
						onChange={(event) => setMissionName(event.target.value)}
					/>
					<span
						className={`flex items-center gap-1.5 text-[11px] max-[860px]:hidden ${dirty ? 'text-amber-500' : 'text-muted-foreground'}`}
						aria-live="polite"
					>
						<i
							className={`size-[5px] rounded-full shadow-[0_0_0_3px_currentColor] ${dirty ? 'bg-amber-400' : 'bg-emerald-400'}`}
						/>
						{dirty ? 'Unsaved changes' : status}
					</span>
				</div>
				<nav className="flex items-center gap-1.5" aria-label="Mission actions">
					<Button
						aria-label="Load mission"
						className="max-[860px]:px-2"
						variant="ghost"
						onClick={() => {
							setRecentMissions(loadRecentMissions())
							setLoadError(null)
							setDialogOpen(true)
						}}
					>
						<Upload aria-hidden="true" />
						<span className="max-[860px]:hidden">Load</span>
					</Button>
					<Button
						aria-label="Save mission"
						className="max-[860px]:px-2"
						variant="secondary"
						onClick={saveMission}
					>
						<Download aria-hidden="true" />
						<span className="max-[860px]:hidden">Save</span>
					</Button>
					<Button
						aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
						variant="ghost"
						size="icon"
						onClick={toggleTheme}
					>
						{theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
					</Button>
				</nav>
			</header>

			{dialogOpen ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
					<section
						className="max-h-[min(720px,calc(100vh-32px))] w-full max-w-[620px] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl"
						aria-label="Load mission"
						aria-modal="true"
						role="dialog"
					>
						<div className="flex items-start justify-between gap-4">
							<div>
								<small className="text-[9px] text-primary uppercase tracking-[0.12em]">
									Mission library
								</small>
								<h2 className="mt-1 font-semibold text-lg">Load a mission</h2>
								<p className="mt-1 text-muted-foreground text-xs">
									Import JSON, reopen a recent mission, or start from an example.
								</p>
							</div>
							<Button
								aria-label="Close mission library"
								size="icon-sm"
								variant="ghost"
								onClick={() => setDialogOpen(false)}
							>
								<X />
							</Button>
						</div>

						<div className="mt-5 rounded-lg border border-border bg-muted/35 p-3">
							<div className="flex items-center justify-between gap-3">
								<span className="flex items-center gap-2 text-xs">
									<FileJson className="size-4 text-primary" /> Mission JSON file
								</span>
								<Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
									<Upload /> Choose file
								</Button>
							</div>
							<input
								ref={fileInput}
								className="hidden"
								type="file"
								accept="application/json,.json"
								aria-label="Mission JSON file"
								onChange={loadFile}
							/>
						</div>

						{loadError ? (
							<p
								className="mt-3 rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-destructive text-xs"
								role="alert"
							>
								{loadError}
							</p>
						) : null}

						<MissionList
							title="Recent missions"
							icon={History}
							empty="Save or import a mission to add it here."
							missions={recentMissions.map((mission) => ({
								key: `${mission.name}-${mission.savedAt}`,
								name: mission.name,
								description: `${mission.map} · ${mission.items.length} items · ${formatSavedAt(mission.savedAt)}`,
								onLoad: () => replaceMission(missionSnapshot(mission), mission),
							}))}
						/>
						<MissionList
							title="Example missions"
							icon={BookOpen}
							missions={EXAMPLE_MISSIONS.map((mission) => ({
								key: mission.id,
								name: mission.name,
								description: mission.description,
								onLoad: () => replaceMission(mission),
							}))}
						/>
					</section>
				</div>
			) : null}
		</>
	)
}

function MissionList({
	title,
	icon: Icon,
	missions,
	empty,
}: {
	title: string
	icon: typeof History
	missions: Array<{ key: string; name: string; description: string; onLoad: () => void }>
	empty?: string
}) {
	return (
		<section className="mt-5">
			<h3 className="mb-2 flex items-center gap-2 font-semibold text-xs">
				<Icon className="size-3.5 text-primary" aria-hidden="true" /> {title}
			</h3>
			{missions.length === 0 ? (
				<p className="rounded-lg border border-border border-dashed p-3 text-muted-foreground text-xs">
					{empty}
				</p>
			) : (
				<ul className="grid gap-2 sm:grid-cols-3">
					{missions.map((mission) => (
						<li key={mission.key}>
							<button
								className="h-full w-full rounded-lg border border-border bg-muted/35 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/6"
								type="button"
								onClick={mission.onLoad}
							>
								<strong className="block text-xs">{mission.name}</strong>
								<small className="mt-1 block text-[9px] text-muted-foreground leading-4">
									{mission.description}
								</small>
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}

function formatSavedAt(savedAt: string) {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(savedAt),
	)
}
