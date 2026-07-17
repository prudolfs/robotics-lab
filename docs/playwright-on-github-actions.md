---
name: playwright-fast-ci
description: Speed up Playwright on GitHub Actions without adding sharding by default. Caches browser binaries, runs tests in parallel, and reports failures inline. Use when the E2E workflow feels slow or when setting up Playwright on GitHub Actions.
---

# Playwright Fast CI

> Goal: make the per-PR Playwright gate fast as the suite grows, without
> reaching for sharding before it pays for itself.

Adapted from
[Playwright on GitHub Actions: The setup that actually runs fast](https://endform.dev/blog/playwright-github-actions).

A slow Playwright pipeline is almost never a "too many tests" problem. It is a
configuration problem in two places: **browser install** and **parallelism**.
Both are fixable in an afternoon, no sharding required.

## Where things live

- Workflow:    `.github/workflows/e2e.yml`
- Config:      `apps/simulator/playwright.config.ts`
- Suite docs:  `docs/e2e.md`

---

## When to use

- The E2E run in GitHub Actions feels slow.
- Setting up Playwright on GitHub Actions for the first time.
- Adding a browser, or moving a browser stack from "every PR" to `main`/nightly.

## The two real bottlenecks

Read the Actions step durations for an E2E run. The slow steps are:

1. **Install Playwright browser** — re-downloading Chromium on every run. Fix:
   cache the browser binaries.
2. **Run E2E tests** — running serially because the config pins `workers: 1`.
   Fix: parallelism (`fullyParallel` + a worker count scaled to the runner).

Everything else (checkout, Node setup, `pnpm install`) is cheap. Do not
optimise the cheap steps; attack the two above.

---

## Apply

Apply the steps in order and measure after each. The first two deliver almost
all of the saving.

### 1. Cache the browser binaries

Playwright installs browsers to `~/.cache/ms-playwright` on the Linux runner.
That directory is what to cache. Key the cache to a hash of the lockfile so it
turns over when Playwright is bumped.

The detail most guides miss: a cache hit restores the binaries, but the
**system libraries** (`--with-deps`) are not in that cache and still need
installing, so browsers fail to launch with
`Host system is missing dependencies to run browsers`. Two conditional install
steps handle this:

- cache **miss** → `playwright install --with-deps` (binaries + system libs)
- cache **hit**  → `playwright install-deps`        (system libs only)

```yaml
- name: Cache Playwright browsers
  id: playwright-cache
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    # hashFiles resolves from GITHUB_WORKSPACE regardless of working-directory
    key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}

# Cache miss: download browsers and system libraries together
- name: Install browsers and system dependencies
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  working-directory: apps/simulator
  run: pnpm exec playwright install --with-deps chromium

# Cache hit: binaries restored, but system libraries still need installing
- name: Install OS dependencies for browsers
  if: steps.playwright-cache.outputs.cache-hit == 'true'
  working-directory: apps/simulator
  run: pnpm exec playwright install-deps chromium
```

After the first run populates the cache, every following run skips the
download until Playwright's version moves in the lockfile.

### 2. Run tests in parallel

Two changes at the **top level** of `defineConfig` (alongside `use` and
`projects`, not nested inside a project):

```ts
export default defineConfig({
  // ...existing keys...
  fullyParallel: true, // parallelise tests within a file, not just across files
  workers: process.env.CI ? '50%' : undefined, // scale to the runner; measure and raise
  // ...
})
```

- `fullyParallel: true` — by default Playwright parallelises across files but
  pins a single file's tests to one worker. This lets tests inside a file run
  in parallel too.
- `workers: '50%'` — half the runner's cores. Start here and measure.

`50%` maps differently per runner (GitHub's free `ubuntu-latest` is 4-core for
public repos, 2-core for private):

| Runner                            | Cores | `50%` gives | Worth trying          |
| --------------------------------- | ----- | ----------- | --------------------- |
| Private repo, `ubuntu-latest`     | 2     | 1 worker    | Set `2` explicitly    |
| Public repo, `ubuntu-latest`      | 4     | 2 workers   | `'75%'`, then measure |
| Larger runner                     | 8     | 4 workers   | `'75%'` and up        |

### Do not push workers past the core count

`workers: 8` on a 4-core runner does **not** buy speed. Oversubscribed workers
fight for CPU and memory, tests slow down, and flake appears that did not
exist when the suite ran serially. Tune by measurement, not guesswork.

### Stress-test interaction

This suite includes stress/leak phases (`docs/e2e.md` — Phases 8–11) that take
heap samples and drive long sessions. Before flipping `fullyParallel` on
globally, keep those measurements clean:

- isolate the stress specs into their own `projects` entry that stays
  `workers: 1`, or
- gate parallelism to the non-stress project only.

If unsure, start with `fullyParallel` across files only for the non-stress
project and measure.

### 3. Report failures inline

Keep uploading the HTML report as an artifact with
`if: ${{ !cancelled() }}` so a failed run's report is never lost. Add the
`github` reporter alongside `html` so failures surface as **inline
annotations** on the run summary — the common case then never needs downloading
a zip:

```ts
reporter: [
  ['list'],
  ['html', { open: 'never', outputFolder: 'e2e/.report' }],
  ['github'],
],
```

The HTML report loads its data over HTTP, so viewing a downloaded artifact
needs
`pnpm exec playwright show-report path/to/e2e/.report`. The `github` reporter
removes that friction for everyday failures.

### 4. Run only the browsers you need

Chromium only is the right call for a per-PR gate. Add browser stacks to
`main` or nightly, not every PR. Two ways to scope:

Event-conditional single job:

```yaml
- name: Run E2E tests
  working-directory: apps/simulator
  run: |
    if [ "${{ github.event_name }}" = "pull_request" ]; then
      pnpm test:e2e --project=chromium
    else
      pnpm test:e2e
    fi
```

Conditional matrix on `main` only:

```yaml
strategy:
  fail-fast: false
  matrix:
    project: ${{ github.event_name == 'push'
      && fromJSON('["chromium", "firefox", "webkit"]')
      || fromJSON('["chromium"]') }}
steps:
  - run: pnpm test:e2e --project=${{ matrix.project }}
```

A matrix trades minutes for parallelism; only worth it once the full sweep is
slow enough that one job on `main` blocks merge.

### 5. Optional config additions

```ts
export default defineConfig({
  // ...existing keys...
  forbidOnly: !!process.env.CI, // fail the build if a stray test.only is committed
  retries: process.env.CI ? 2 : 0, // retry flaky tests in CI only
  workers: process.env.CI ? '50%' : undefined,
  fullyParallel: true, // see "Stress-test interaction" first
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e/.report' }],
    ['github'],
  ],
  use: {
    // ...existing use keys...
    trace: 'on-first-retry', // capture a trace when a test retries
  },
})
```

Caveat: `retries` and `trace: 'on-first-retry'` interact with the stress
tests. A retry runs a second session and could change the heap baseline. Keep
the stress project at `retries: 0` (override at the project level) before
enabling global retries.

---

## Common mistakes

- **Installing browsers without `--with-deps`.** `playwright install` alone
  fetches binaries but not the system libraries; browsers then fail to launch.
  Use `--with-deps` on a cache miss and `install-deps` on a cache hit.
- **Caching `node_modules` instead of the pnpm store.** A restored
  `node_modules` can carry platform-specific or partially-installed packages.
  Cache pnpm via `setup-node`'s `cache: pnpm` and let
  `pnpm install --frozen-lockfile` rebuild cleanly.
- **Setting `workers` too high for the runner.** More workers stop helping past
  core count and start introducing flake. Measure and stop where measurements
  stay stable.
- **Forgetting the `github` reporter.** Without it a failed run tells you
  "tests failed" but you must download the report to find out *which*. The
  `github` reporter puts the failure inline on the run summary.

---

## Optional — sharding

Sharding splits the suite across several CI jobs that run in parallel, each
owning a slice. It buys wall-clock time by spending runner minutes. Reach for
it **deliberately**, not by default — a tuned single runner holds for a long
time, and a larger runner or moving the full sweep to `main`/nightly often
costs less than owning shard counts, matrix jobs, and report merging.

Decision rule, **by run time not just test count**:

| Suite size                  | Single-runner time   | What to do                            |
| --------------------------- | -------------------- | ------------------------------------- |
| Under 50 tests              | Well under 5 min     | Workers + `fullyParallel` are plenty  |
| 50–200 tests                | ~3 to 5 min          | Move to a bigger runner before sharding |
| Over 200 tests, or 10+ min  | Past your PR window  | Shard, or move the run off your CI    |

A suite of heavy end-to-end flows hits the ceiling sooner than the same count
of light page checks — run time is what actually matters. The Playwright
sharding docs cover the mechanics (`--shard` / `--shard-index`) for when you
get there.

---

## Checklist

- [ ] Add the **browser cache** + the two conditional install steps to the
      workflow (step 1).
- [ ] Set `workers` to `'50%'` (or `2`) in CI and add `fullyParallel`, keeping
      the stress project serial (step 2).
- [ ] Add the **`github` reporter** (step 3).
- [ ] Confirm `retries`/`trace` keep the stress tests at `retries: 0` (step 5).
- [ ] Re-time the run.
- [ ] Only then, if still past the PR window, evaluate sharding (optional).
