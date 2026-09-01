import type { MissionSnapshot } from '@/mission-persistence'

export type ExampleMission = MissionSnapshot & {
	id: 'simple-waypoint-tour' | 'survey-grid' | 'inspection-loop'
	description: string
}

export const EXAMPLE_MISSIONS: ExampleMission[] = [
	{
		id: 'simple-waypoint-tour',
		name: 'Simple waypoint tour',
		description: 'A short two-point flight with automatic return and landing.',
		map: 'obstacles',
		settings: { cruiseAltitude: 1.5, cruiseSpeed: 4, returnToHome: true },
		items: [
			{ id: 'tour-takeoff', type: 'takeoff', altitude: 1.5 },
			{ id: 'tour-west', type: 'waypoint', position: { x: -2.5, y: -1.8 }, altitude: null },
			{ id: 'tour-east', type: 'waypoint', position: { x: 2.8, y: -2.4 }, altitude: 2 },
			{ id: 'tour-rtl', type: 'rtl' },
			{ id: 'tour-land', type: 'land' },
		],
	},
	{
		id: 'survey-grid',
		name: 'Survey grid',
		description: 'Parallel survey legs with a camera trigger at each turn.',
		map: 'empty',
		settings: { cruiseAltitude: 2, cruiseSpeed: 3, returnToHome: true },
		items: [
			{ id: 'survey-takeoff', type: 'takeoff', altitude: 2 },
			{ id: 'survey-speed', type: 'speed', speed: 3 },
			{ id: 'survey-a', type: 'waypoint', position: { x: -3, y: -2.5 }, altitude: null },
			{ id: 'survey-photo-a', type: 'camera', action: 'photo' },
			{ id: 'survey-b', type: 'waypoint', position: { x: 3, y: -2.5 }, altitude: null },
			{ id: 'survey-c', type: 'waypoint', position: { x: 3, y: 0 }, altitude: null },
			{ id: 'survey-photo-c', type: 'camera', action: 'photo' },
			{ id: 'survey-d', type: 'waypoint', position: { x: -3, y: 0 }, altitude: null },
			{ id: 'survey-e', type: 'waypoint', position: { x: -3, y: 2.5 }, altitude: null },
			{ id: 'survey-photo-e', type: 'camera', action: 'photo' },
			{ id: 'survey-f', type: 'waypoint', position: { x: 3, y: 2.5 }, altitude: null },
			{ id: 'survey-rtl', type: 'rtl' },
			{ id: 'survey-land', type: 'land' },
		],
	},
	{
		id: 'inspection-loop',
		name: 'Inspection loop',
		description: 'A raised loop around the training-room obstacles with a hold.',
		map: 'obstacles',
		settings: { cruiseAltitude: 1.75, cruiseSpeed: 2.5, returnToHome: true },
		items: [
			{ id: 'inspection-takeoff', type: 'takeoff', altitude: 1.75 },
			{ id: 'inspection-nw', type: 'waypoint', position: { x: -3.5, y: -2 }, altitude: null },
			{ id: 'inspection-ne', type: 'waypoint', position: { x: 3.5, y: -2 }, altitude: null },
			{ id: 'inspection-hold', type: 'hold', duration: 3 },
			{ id: 'inspection-se', type: 'waypoint', position: { x: 3.5, y: 2 }, altitude: null },
			{ id: 'inspection-sw', type: 'waypoint', position: { x: -3.5, y: 2 }, altitude: null },
			{ id: 'inspection-rtl', type: 'rtl' },
			{ id: 'inspection-land', type: 'land' },
		],
	},
]
