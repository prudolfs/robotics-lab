import { Cloud, Download, Moon, Sun, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlannerStore } from '@/store'

export function TopBar() {
	const missionName = usePlannerStore((state) => state.missionName)
	const setMissionName = usePlannerStore((state) => state.setMissionName)
	const theme = usePlannerStore((state) => state.theme)
	const toggleTheme = usePlannerStore((state) => state.toggleTheme)

	return (
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
				<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground max-[860px]:hidden">
					<i className="size-[5px] rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.14)]" />
					All changes saved
				</span>
			</div>
			<nav className="flex items-center gap-1.5" aria-label="Mission actions">
				<Button className="max-[860px]:hidden" variant="ghost">
					<Upload aria-hidden="true" />
					Load
				</Button>
				<Button className="max-[860px]:hidden" variant="secondary">
					<Download aria-hidden="true" />
					Save
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
	)
}
