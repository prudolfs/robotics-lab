# Greenhouse Caretaker

> Proposed implementation plan for the next Robotics Lab project: an expressive robot that learns useful tasks in a simulated greenhouse.
>
> Status: planning only. All implementation tasks are unchecked. Stop for user review of this document before starting Phase 0.

## Goal and experience

Build a small, beautiful greenhouse where a wheeled caretaker learns to collect fallen seed capsules and place them in a collection tray. The robot takes inspiration from WALL-E's curiosity and Microduck's physical charm, with an original design, an expressive binocular head and a simple lifting gripper.

The simulator is a learning space for both the robot and the visitor. Demonstrate a task, record experience, train a policy, watch it attempt the task, inspect mistakes and compare checkpoints on unfamiliar scenarios. Progress must come from measured learned behavior, with scripted reference behavior and authored expressions identified separately.

This continues the monorepo course: the simulator established movement and navigation; the drone planner added missions; SLAM Studio introduced perception and estimation; Warehouse Demo added model-driven control and comparisons. Greenhouse Caretaker adds datasets, training, evaluation and reusable learned skills, along with a project-owned Python service.

## First-release scope

- One compact greenhouse, one wheeled robot, one reachable collection tray, a charging nook and a small set of seed capsules. Begin training with one capsule per episode.
- First learned task: approach a capsule, align the gripper, pick it up, carry it to the tray and release it inside the acceptance region.
- Wheels keep the focus on doing useful things. Walking, balancing and bipedal locomotion are outside this release.
- Structured observations first: robot-local target offsets, heading information, range readings, gripper state and task phase where explicitly supplied. Document any idealized sensing. RGB perception is a later extension.
- A scripted reference controller, user demonstrations, a behavior-cloned policy and a bounded reinforcement-learning experiment. Report unsuccessful experiments honestly.
- A local FastAPI server and separate Python training worker owned by this repository. Python owns the authoritative simulation; the browser presents its state.
- A LangGraph mission layer that composes evaluated skills into collection, delivery and return-to-dock routines. Mission orchestration follows the first learned skill.
- A live interactive experience requires the Python server. Recorded playback can provide an explicitly labeled offline showcase.
- Plant growth, watering/fluid simulation, delicate plant manipulation, real hardware and sim-to-real claims are deferred.

## Architecture and repository integration

```text
apps/
  greenhouse-demo/               React / TypeScript / Vite / Three.js
  greenhouse-server/
    package.json                 pnpm command wrapper
    pyproject.toml               Python dependencies and tooling
    uv.lock                      locked Python environment
    .python-version
    src/greenhouse/
      api/                       HTTP, streaming and session lifecycle
      simulation/                world, robot, observations and task rules
      datasets/                  demonstrations and versioned recordings
      training/                  imitation learning, RL and evaluation
      missions/                  LangGraph workflows and skill adapters
    tests/
packages/                        existing shared TypeScript packages
assets/greenhouse-demo/           editable Blender sources and runtime exports
docs/greenhouse-demo/phaseN/      evidence added as each phase is completed
```

pnpm remains the repository command entry point. uv manages the server's Python dependencies and local virtual environment; Python dependencies are not installed globally. The existing `apps/*` workspace pattern can include the server through its small `package.json`. Start with one Python project; introduce a uv workspace only when additional reusable Python projects justify it.

Proposed root commands are `pnpm setup:greenhouse`, `pnpm dev:greenhouse`, `pnpm test:greenhouse` and `pnpm build:greenhouse`. The development command starts Vite and FastAPI together and shuts down both cleanly. No Node simulation service or Python-to-Node training bridge is required.

| Area | Proposed direction |
| --- | --- |
| Frontend | Reuse React, TypeScript, Vite, Three.js and existing HUD/camera conventions. Verify the renderer/dependency combination in Phase 0; keep renderer-specific dependencies app-local. |
| Simulation | Python-only, fixed-timestep environment with seeded reset, step, observation, reward, termination and snapshot interfaces. No dependency on FastAPI, LangGraph or rendering. |
| Physics | Evaluate MuJoCo as the initial candidate in Phase 0. Commit to a backend only after headless stepping, platform installation and browser mesh alignment work. Clearly document simplified grasp constraints if used. |
| API | FastAPI owns interactive session commands, snapshot streaming, dataset metadata, job control and artifacts. Stream render snapshots at a bounded rate separately from physics stepping. |
| Training | PyTorch behavior cloning first; Gymnasium and Stable-Baselines3 PPO for the later practice experiment. Training interacts directly with the environment. |
| Jobs | A separate worker process performs training/evaluation. Persist job state, metrics and checkpoint references so CPU-heavy work does not block API requests. |
| Missions | LangGraph coordinates skill execution and bounded recovery. Use LangChain model/tool integrations where useful; model calls remain above the motor-control loop. |
| Contracts | Version HTTP schemas through FastAPI/Pydantic and generate the TypeScript HTTP client/types. Define and validate WebSocket envelopes separately; OpenAPI does not describe their message protocol. |
| Persistence | Local files for recordings, datasets and model artifacts; SQLite for job/session metadata and mission checkpoints where suitable. Define artifact locations and retention explicitly. |
| Browser policies | Server-side execution for the first release. ONNX/browser execution is a later option requiring a compatible browser simulation or continued backend state exchange. |

The browser sends commands and renders snapshots, with visual interpolation between them. It does not independently simulate object interactions. Headless training advances simulated time as fast as possible; the live viewer follows wall-clock pacing. Expressions can follow robot/task events without changing the learned actions.

Reuse existing TypeScript geometry, rendering helpers and presentation patterns where compatible. Existing navigation and sensor implementations can serve as algorithm references, but Python cannot directly import them. Avoid maintaining two authoritative simulators or translating every package merely to claim reuse. Extract shared packages when there is a concrete second consumer.

## Learning and evaluation contract

- Keep simulator truth separate from policy observations. Explicitly label oracle object positions or other idealized inputs used in the first curriculum; do not present them as camera-derived perception.
- Define units, coordinates, observation ordering/normalization, action scaling, control frequency and gripper semantics before dataset collection. Version them with every dataset and checkpoint.
- Use a goal-conditioned skill design so collection and tray delivery can be evaluated separately before evaluating their full sequence. Decide in Phase 0 whether to use separate policies or one policy with an explicit phase input.
- Behavior cloning learns observation/action pairs from a scripted expert and user demonstrations. Complete-episode success matters more than training loss alone.
- Reinforcement learning updates a policy from simulated experience. Reward progress toward valid pickup and placement while penalizing collisions and wasted time; separately measure actual task completion to detect reward exploitation.
- Split training, validation and held-out test seeds/scenarios before fitting models. Keep final test scenarios out of checkpoint selection, demonstration collection and repeated reward tuning.
- Compare scripted reference, initial learned checkpoint, final imitation checkpoint and RL candidate on the same held-out scenarios. Record success, collisions, invalid grasps, drops, completion time, interventions and failure reasons.
- Do not silently replace failed learned control with scripted control. Identify reference runs, live learned runs, assisted demonstrations, recorded playback and mission orchestration clearly.
- Record simulator version, seed, actions, task configuration, dataset identity, policy identity, normalization and relevant dependency versions. Establish reproducibility tolerances on the reference setup; do not assume cross-device or training determinism from a seed alone.

## Visual and interaction direction

A compact cutaway greenhouse with warm daylight, translucent glazing, green plants, potting benches, seed trays and clear travel paths. Retain the monorepo's restrained slate/mint interface while giving this environment a warmer palette and softer character.

The robot has an original silhouette, two driven wheels with a stable support, a movable binocular head and one simple gripper/lift. Its body and gripper must match the collision and reach model. Glances, head tilts, indicator lights and optional chirps express task events; authored expressions are separate from learned motor behavior.

Provide a Watch / Teach / Train / Compare flow with a spacious viewport. Show the active controller/checkpoint, current task and a short event timeline. Put detailed observations, reward components and failures in an optional inspector. Include overview, follow and robot-eye cameras; the robot-eye view is an inspection view until an image-based policy actually consumes it.

## Implementation phases

### Phase 0 — Task, simulation and learning feasibility

Goal: prove the smallest useful learning environment before building the full application.

- [ ] Specify the one-capsule task, greenhouse dimensions, robot geometry, gripper reach, tray acceptance region and reset conditions.
- [ ] Define observation/action schemas, control and physics frequencies, success conditions, timeouts and invalid-action behavior.
- [ ] Evaluate the Python simulator candidate on the user's reference machine, including headless stepping, contacts, reset repeatability and installation requirements.
- [ ] Choose and document grasp semantics: physical grasping or an explicit constrained attachment with alignment/reach checks. Record what the choice can and cannot teach.
- [ ] Build a throwaway headless task probe and a minimal expert trajectory; measure episode stepping throughput without rendering.
- [ ] Train a tiny behavior-cloning probe and evaluate complete episodes on a separate validation set to test whether the proposed observations/actions support learning.
- [ ] Define the curriculum, dataset splits, comparison metrics and initial acceptance thresholds before full training.
- [ ] Probe a Python snapshot in a minimal browser scene, validating coordinates, units, object identity, interpolation and reset handling.
- [ ] Verify a compatible renderer stack and record the backend/capability behavior and reference hardware.
- [ ] Record the visual brief, initial asset inventory, feasibility findings and unresolved tradeoffs in a Phase 0 review.

Exit: a documented simulator choice, measured headless loop, workable observation/action contract and evidence that a small policy can learn part of the task. Stop for user review before Phase 1.

### Phase 1 — Monorepo service and application foundation

- [ ] Scaffold `apps/greenhouse-demo` and `apps/greenhouse-server`, with app-local dependencies and a packaged Python import layout.
- [ ] Add uv dependency locking, a Python version pin and ignored virtual environment/cache/runtime output directories.
- [ ] Add root setup/development/test/build commands and pnpm wrappers for Python test, lint and type checks.
- [ ] Start Vite and FastAPI together with clear logs, documented ports and clean process shutdown; avoid relying on globally installed Python libraries or Laya.
- [ ] Implement health/capability endpoints and versioned HTTP contracts; generate the TypeScript HTTP client.
- [ ] Define validated streaming messages with session IDs, generation IDs, tick numbers and command acknowledgments.
- [ ] Build the frontend shell with connection, loading, unavailable-server and unsupported-renderer states.
- [ ] Add a fresh-checkout startup guide covering Python/uv prerequisites and model-provider configuration only where required.

Exit: a reproducible project-owned server and browser app launched from the monorepo. Stop for user review before Phase 2.

### Phase 2 — Authoritative greenhouse world and reference behavior

- [ ] Implement the fixed-step Python environment independently of HTTP, UI and training libraries.
- [ ] Implement seeded capsule placement, robot reset, tray state and feasible scenario generation.
- [ ] Implement wheel motion, collision handling, gripper/lift state and validated pickup/carry/release transitions.
- [ ] Separate policy observations from simulator truth and document idealized sensing used in this phase.
- [ ] Implement a scripted reference controller that completes the collection task and produces useful demonstration trajectories.
- [ ] Add start, pause, same-seed reset and new-seed commands through the API, with bounded snapshot streaming.
- [ ] Render placeholder greenhouse geometry and robot articulation from server state; add overview and follow views.
- [ ] Verify seeded resets, task preconditions, timeouts, collisions, complete reference episodes and stale-command rejection after reset.

Exit: a coherent browser-visible collection task and a reproducible headless reference benchmark. Stop for user review before Phase 3.

### Phase 3 — Authored greenhouse and caretaker character

- [ ] Model the greenhouse shell, plants/pots, benches, tray, capsules, charging nook and original caretaker in Blender.
- [ ] Preserve editable Blender sources and a repeatable export script; export runtime GLBs and a manifest for dimensions, pivots and collision alignment.
- [ ] Integrate driven wheels, head motion, gripper/lift and carried objects using authoritative simulation state.
- [ ] Add warm lighting, readable materials and restrained environmental detail consistent with the agreed visual brief.
- [ ] Add event-driven expressions with reduced-motion support and optional sound controls.
- [ ] Add robot-eye inspection and review overview/follow/detail screenshots in the browser.
- [ ] Measure scene performance and loading on the reference setup; correct mesh/physics alignment and resource disposal issues.

Exit: a visually convincing caretaker completing the reference task in its greenhouse. Stop for user review before Phase 4.

### Phase 4 — Teaching and demonstration datasets

- [ ] Add explicit manual teaching controls for motion, lift and grasp, with visible task and robot state.
- [ ] Record observations, executed actions, task events, timing, seed and configuration as versioned episodes.
- [ ] Collect scripted expert demonstrations and user demonstrations; keep source labels and intervention markers.
- [ ] Support reviewing, replaying, labeling and excluding failed or low-quality demonstrations without silently rewriting source episodes.
- [ ] Validate dataset schema compatibility, task completion labels and split membership before training.
- [ ] Add dataset summaries and export/import with explicit size limits and local artifact locations.
- [ ] Verify that replay corresponds to the recorded episode and identify stored-state playback separately from re-simulation.

Exit: inspectable demonstrations and a versioned dataset suitable for the first real training run. Stop for user review before Phase 5.

### Phase 5 — First learned skill through imitation

- [ ] Implement a small PyTorch behavior-cloning policy with documented inputs, outputs, normalization and loss.
- [ ] Implement training as a separate worker process with start/cancel/status operations and persisted job results.
- [ ] Save checkpoints with dataset/configuration identities, validation metrics and compatible simulator versions.
- [ ] Evaluate complete pickup/delivery episodes on validation scenarios and compare against the reference controller.
- [ ] Integrate server-side learned policy execution into the interactive simulator with explicit controller/checkpoint selection.
- [ ] Show training progress, held-out rollout examples and actionable failure categories; distinguish fitting loss from task success.
- [ ] Collect targeted corrections on training scenarios if errors compound, retrain and record the experiment without using final test scenarios for tuning.
- [ ] Verify API responsiveness during training, cancellation, failed jobs, incompatible checkpoints and absence of hidden scripted recovery.

Exit: a saved learned policy performs the collection task on unfamiliar validation scenarios, with measured successes and limitations. Stop for user review before Phase 6.

### Phase 6 — Reinforcement-learning practice and curriculum

- [ ] Wrap the same Python environment in Gymnasium and validate its observation/action spaces, reset and termination behavior.
- [ ] Add a reproducible PPO training configuration and decide explicitly how to compare with or initialize from the imitation policy; do not assume checkpoint compatibility.
- [ ] Implement reward components for valid task progress, successful delivery, collisions and time; log each component separately.
- [ ] Add a staged curriculum for target distance, placement variation and a small number of obstacles, keeping tasks feasible.
- [ ] Run a bounded training experiment within a documented compute budget, recording throughput and resource use.
- [ ] Evaluate candidates on validation scenarios, inspect reward exploitation and regressions, and preserve the best validated policy even if PPO does not improve it.
- [ ] Compare selected checkpoints on the untouched final test set using the Phase 0 metrics; report sample counts and variability across training seeds where practical.
- [ ] Add a browser comparison flow that replays the same scenario with chosen policies and explains failure outcomes.

Exit: measured evidence of what practice improves or fails to improve, with reproducible artifacts and an honest controller comparison. Stop for user review before Phase 7.

### Phase 7 — LangGraph greenhouse missions

- [ ] Define typed skill contracts for collect/deliver and return-to-dock, including preconditions, completion signals, cancellation and failures.
- [ ] Identify which skill implementations are learned and which remain scripted; expose this in mission traces.
- [ ] Build a LangGraph workflow for observe, select task, execute skill, verify outcome and bounded recovery.
- [ ] Persist mission checkpoints and task state; validate session/generation identity before resuming commands after a reset or reconnect.
- [ ] Add a small natural-language instruction path using LangChain model/tool integrations, mapping requests to supported mission schemas.
- [ ] Implement a structured mission selection path that works without an LLM provider; explain unavailable language features clearly.
- [ ] Support several capsules in one mission using evaluated single-object skills, then return to dock.
- [ ] Show the current plan, executing skill, progress and recovery reasons; verify completion from simulator state rather than model narration.
- [ ] Verify interruption, skill failure, repeated no-progress, provider errors and bounded replanning without calling an LLM for every motor action.

Exit: the caretaker completes a multi-step greenhouse routine with visible, persistent orchestration over documented skill implementations. Stop for user review before Phase 8.

### Phase 8 — Learning experience, reliability and release

- [ ] Finish the Watch / Teach / Train / Compare flow, responsive layout, keyboard access, focus states and reduced-motion behavior.
- [ ] Add an optional observation/reward inspector and failure replay while keeping the main experience uncluttered.
- [ ] Finalize session ownership, disconnect/reconnect behavior, stale responses, concurrent-job limits and clean worker shutdown.
- [ ] Verify bounded recording/snapshot memory, artifact retention and repeated start/reset/train/cancel cycles.
- [ ] Run targeted Python simulation/training/API checks, frontend typecheck/build, relevant shared-package checks and a small public-UI end-to-end suite.
- [ ] Evaluate the final checkpoints on the fixed test set and publish metrics, training cost, sensing assumptions and remaining limits.
- [ ] Document architecture, local setup, asset exports, dataset formats, training reproduction, mission configuration and backend deployment requirements.
- [ ] Add app READMEs and root README links/launch commands, then capture current screenshots and a short task/learning comparison video.
- [ ] Verify a fresh checkout can start both services, run a reference task, execute a saved learned policy and reproduce a documented small training run.
- [ ] If including an offline showcase, label recorded playback clearly and verify it works without the server.

Exit: a documented, reviewable greenhouse learning project integrated into Robotics Lab. Stop for user review before publishing or adding further scope.

## Completion criteria

- [ ] The browser and project-owned Python server launch through documented monorepo commands with locked dependencies.
- [ ] The robot visibly collects a capsule and places it in the tray using a saved learned policy.
- [ ] A visitor can record a demonstration, train a small model and inspect its evaluation results.
- [ ] Training uses the same authoritative environment as interactive execution and runs without a browser.
- [ ] Checkpoint comparisons use declared dataset splits, shared scenarios and actual task outcomes.
- [ ] Scripted behavior, learned skills, idealized sensing, authored expressions and recorded playback are clearly identified.
- [ ] LangGraph composes supported skills into a greenhouse routine with bounded recovery and inspectable state.
- [ ] The greenhouse and character meet the agreed visual direction without obscuring task progress or physical limitations.
- [ ] Existing monorepo applications retain their behavior.

## Later possibilities

- [ ] Camera-derived object detection and image-based policies, replacing explicitly idealized observations.
- [ ] Return fallen plant markers, deliver seed packets and sort different capsule types.
- [ ] Watering tasks with a deliberately scoped plant/moisture model and clear physical assumptions.
- [ ] Learned docking and additional learned manipulation skills.
- [ ] ONNX policy export and a separately evaluated browser execution path.
- [ ] Domain randomization, improved actuator/contact models and a physical caretaker prototype.

## Technical references

- [uv projects](https://docs.astral.sh/uv/guides/projects/) — local Python environments, dependency locking and commands.
- [pnpm script execution](https://github.com/pnpm/pnpm.io/blob/main/docs/cli/run.md) — workspace command orchestration.
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/) — interactive streaming transport.
- [MuJoCo overview](https://mujoco.readthedocs.io/en/stable/overview.html) — candidate Python simulation backend.
- [Stable-Baselines3 custom environments](https://stable-baselines3.readthedocs.io/en/master/guide/custom_env.html) — Gymnasium integration.
- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview) — stateful mission orchestration.
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) — possible later browser policy execution.
