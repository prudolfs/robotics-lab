# Phase 4 review — Full Laya control

Full Laya uses the running local model to choose accessible cargo, an empty bay and discrete forklift commands. The app exposes **Predictable / Full Laya** in Autonomous control. Switching modes resets the same seed. Full Laya runs at 1× so HTTP latency and the command lease have consistent meaning; accelerated playback remains available in Predictable mode.

## Control boundary

`laya-observation.ts` calculates legal task candidates, lane-path milestones, target distance, heading alignment and fork height. Its geometric lane path includes pickup, truck exit, rack approach and return poses, including an initial lane change if Laya chooses cargo in the other lane. This is a supplied warehouse path, not model-generated path planning.

Laya answers questions about the qualitative state. The answers map to fixed motor values: forward/reverse cruise or creep, full/gentle left/right or straight steering, raise/lower/hold forks, pickup/place/no load action. Code does not supply the winning answer, substitute a steering controller, or repair model choices. The Full Laya branch never calls the predictable task selector or `predictableStep`. Both modes use the same collision, pickup, storage and stopped-vehicle rules.

Questions use perceptual labels: `at / near / far` and `below / above / level`. Option labels matter as well as their descriptions. See the prompt experiments below. The 56-state fixture gives empirical motor-score floors of 0.65 for travel, 0.60 for gear, 0.28 for steering, 0.60 for forks and 0.40 for load action. Scores below a floor hold all motors, show the uncertain field and request another answer; persistent uncertainty reaches the no-progress pause. Task options are all physically available, so their ranking does not use a confidence floor; `unsure` pauses explicitly. These thresholds sit below the smallest correct fixture scores and require broader evaluation before being treated as calibrated. Returned probabilities are visible in the inspector; they are model scores, not a measured probability of successfully completing the shipment.

## Requests and failure behavior

- One request in flight per controller; decision cadence is 250 ms of simulation time.
- Motor commands expire 500 ms after their observation, on both simulation and wall clocks. A late response cannot renew an expired command. The vehicle brakes and holds its forks while waiting.
- Each HTTP request has a 2-second timeout. Three consecutive failures pause with the cause.
- Pause, restart, randomize, mode switch and component teardown abort pending requests. Generation/epoch checks also reject a transport that returns after cancellation.
- Pickup/release is attempted once per response; travel, steering and forks are held until replaced or expired.
- Ten physical rejections within 30 simulated seconds pause the run. No approach/task progress for 15 simulated seconds also pauses. A full run is bounded at 900 simulated seconds; the longer ceiling allows the deliberately slow discrete turns. The 15-second stall guard remains active throughout.
- The inspector shows connection state, selected motor commands, response age, latency, all choice probabilities and recent physical rejection reasons.

## Local service and launch

Start the already installed Laya service on `http://127.0.0.1:8000/v1/systemone`, then run:

```sh
pnpm -C apps/warehouse-demo dev
```

Vite forwards `/api/laya/v1/systemone` to the local service, avoiding browser CORS dependence. `LAYA_ORIGIN` changes the proxy origin for dev and local preview. `VITE_LAYA_ENDPOINT` overrides the browser URL when an explicitly configured service is available. A static deployment needs that endpoint or a deployed same-origin proxy; the production bundle does not silently call the visitor's loopback interface. Predictable mode sends no Laya requests.

The existing server owns model loading and inference. The adapter sends English state with `lang: "en"`, validates request shape, checks response choices against the submitted options, and rejects missing/non-finite/out-of-range probability distributions. It does not install or reload model weights.

## Reproduce the measurements

```sh
node scripts/warehouse-phase4/probe.mjs
node scripts/warehouse-phase4/probe-forks.mjs
node scripts/warehouse-phase4/fixtures.mjs
node scripts/warehouse-phase4/compare.mjs
node scripts/warehouse-phase4/browser.mjs
```

Run the live scripts serially against the model. `SEEDS=42` narrows the comparison; `LAYA_ENDPOINT` changes its endpoint. Comparison uses the production simulator/controller with fixed timesteps, awaiting each HTTP request between ticks. Its response latencies are real; its simulation clock excludes that wait. The separate browser run exercises the real asynchronous request/animation loop at 1×.

The comparison retains compressed decision traces for inspection, not an exact playback feature. Playback remains Phase 5 work.

## Prompt experiments

The first combined travel question kept choosing reverse after reaching a stopping point and eventually paused at a boundary ([iteration 1](iteration-1.json)). Separating direction and distance improved navigation; a return arc then left the forks just outside the lateral pickup tolerance ([iteration 2](iteration-2.json)). The arc observation was corrected to describe its full bend. The next run reached a valid pickup but held the forks below travel height ([iteration 3](iteration-3.json)).

The [travel wording probe](prompt-probe.json) compares three phrasings across forward/reverse and three distances. The [initial motor fixtures](fixtures-before.json) expose interference between observation fields. The fork probes retain [action-labelled contextual answers](fork-probe.json), [action-labelled isolated answers](fork-focused-probe.json), and [perceptual labels](fork-perception-probe.json). Perceptual fork labels answered all 27 contextual cases correctly. This follows the supplied [Laya integration skill](../../../.agents/skills/laya-integration/SKILL.md) and the [Laya game examples](https://brainfunctioncollapse.com/laya): describe state in words and map perceptual answers to actions.

## Final results

The final [56-state fixture](fixtures.json) produced **280/280 correct answers** across travel, gear, steering, fork height and load operation; none fell below the selected motor floor. These are labelled, templated warehouse observations used during prompt development, not a held-out estimate of general model accuracy.

The [reference comparison](comparison.json) completed **6/6 runs in each mode**. Full Laya delivered **20/20 pallets without human intervention**, contacts, invalid actions, uncertain holds or expired responses. Across **7,254 live model responses**, median latency was **120.5 ms** and p95 was **129.5 ms**. Each motor request batches five short questions. The local service identified itself as `laya-rl-agent`, with the English `convaiinnovations/laya` checkpoint; measurements used the same Apple M3 Pro / 18 GB reference machine as Phase 3.

| Seed | Pallets | Predictable simulated seconds | Full Laya simulated seconds | Laya median / p95 response ms |
| --- | ---: | ---: | ---: | ---: |
| 3 | 4 | 298.6 | 344.1 | 124.7 / 131.2 |
| 7 | 3 | 228.8 | 259.5 | 125.6 / 130.1 |
| 42 | 4 | 272.2 | 367.9 | 109.0 / 125.6 |
| 99 | 3 | 184.8 | 260.1 | 108.7 / 110.2 |
| 2026 | 3 | 221.8 | 301.8 | 125.5 / 130.0 |
| 4821 | 3 | 221.8 | 252.0 | 109.2 / 127.7 |

The modes start from identical layouts but can choose different cargo/bay orders. Full Laya uses conservative discrete steering and travel speeds. Its seed alone is not a reproducibility guarantee: model checkpoint, wording, timing and probabilities can change a run. The six-seed result establishes representative completion; it does not establish reliability over arbitrary seeds or model versions.

Decision traces: [3](trace-3.json.gz), [7](trace-7.json.gz), [42](trace-42.json.gz), [99](trace-99.json.gz), [2026](trace-2026.json.gz), [4821](trace-4821.json.gz).

The [production-browser run](browser-review.json) in **Chrome 153.0.8010.54**, without a WebGPU override flag, completed seed 42 at normal 1× speed: **4/4 pallets**, **375.7 simulated seconds / 376.1 wall seconds**, **1,513 HTTP responses**, **zero contacts, invalid actions or page errors**, and an active WebGPU backend. This independently exercises HTTP/animation concurrency; the small timing difference from the headless runner is expected.

Review the [live pickup and decision probabilities](live-control.png) and [completed delivery](live-result.png).

## Verification

**30 standalone simulation/client tests** and **5 standalone browser tests** pass, along with typecheck/production build and lint. Tests cover invalid API data, HTTP timeout, single-request concurrency, expired commands, late responses after reset/pause, service failure, confidence holds, repeated physical rejection, no progress, and model commands that deliberately drive away from the goal. Browser regressions cover a complete Predictable delivery, mode reset, pending-request cancellation, service failure, missing models and unavailable WebGPU. The earlier failed live experiments above remain visible as examples of wording and alignment failures; they are not included in the final completion rate.

**Stop after Phase 4 for user review. Phase 5 has not started.**
