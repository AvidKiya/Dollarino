/**
 * Shared Vitest options for every Dollarino workspace.
 *
 * Why this file exists (V11.9.3 CI regression):
 *   `vitest run --maxWorkers=2` alone is unstable by construction. When `minWorkers` is
 *   not configured, Vitest derives the worker-pool floor from the machine:
 *
 *     const threadsCount = Math.max(availableParallelism() - 1, 1);
 *     const maxThreads   = ctx.config.maxWorkers ?? threadsCount;
 *     const minThreads   = ctx.config.minWorkers ?? threadsCount;   // <-- CPU count
 *
 *   The maintainer sandbox has 2 CPUs -> threadsCount = 1 -> min(1) <= max(2), so every
 *   test passed locally. The GitHub runner has 4 CPUs -> threadsCount = 3 -> Tinypool
 *   aborted the run with
 *     RangeError: options.minThreads and options.maxThreads must not conflict
 *   before a single test executed. CI therefore reported "0/0 passed, exit=1" after ~1s
 *   while the job log (a short-lived signed blob URL) showed nothing actionable.
 *
 *   Pinning both bounds here makes the pool size deterministic on any CPU count and on
 *   any machine, instead of relying on per-script CLI flags that can drift.
 */
export const sharedTestOptions = {
  // Never let the implicit floor exceed the ceiling. Two workers keeps the
  // Miniflare + D1 replay suites inside the CI runner's memory budget.
  minWorkers: 1,
  maxWorkers: 2,
  // Booting Miniflare and replaying every D1 migration needs more than the 5s default.
  testTimeout: 15000,
  hookTimeout: 30000,
};

export default sharedTestOptions;
