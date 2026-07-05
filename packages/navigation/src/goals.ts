// Goal queue management.
//
// A goal queue is a plain FIFO of `Goal` points the robot is sent to one at a
// time. Working on an array (rather than mutating an object) keeps everything
// immutable and trivially testable: enqueue returns a new array, advancing
// returns the array with the head dropped, etc. The controller in
// `controller.ts` reads the head (`currentGoal`) and the loop pops it the step
// it reports `arrived`.

import type { Goal } from './index'

/** Enqueue a goal at the back of the queue. Returns a new array. */
export function enqueueGoal(queue: Goal[], goal: Goal): Goal[] {
	return [...queue, goal]
}

/** Append several goals at once (e.g. a queued multi-point mission). */
export function enqueueGoals(queue: Goal[], goals: Goal[]): Goal[] {
	return [...queue, ...goals]
}

/** Current goal the robot is heading towards, or `null` when the queue is empty. */
export function currentGoal(queue: Goal[]): Goal | null {
	return queue.length > 0 ? queue[0] : null
}

/** Drop the head of the queue after arriving. Returns a new array. */
export function popGoal(queue: Goal[]): Goal[] {
	return queue.length > 0 ? queue.slice(1) : queue
}

/** Replace the queue with a single goal (clears anything queued). */
export function setSingleGoal(_queue: Goal[], goal: Goal): Goal[] {
	return [goal]
}

/** Replace the queue with a list of goals. */
export function setGoals(_queue: Goal[], goals: Goal[]): Goal[] {
	return goals
}

/** Empty the queue. */
export function clearGoals(_queue: Goal[]): Goal[] {
	return []
}
