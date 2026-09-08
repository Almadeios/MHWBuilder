# Half-matching optimization

## Outcome

Enabled by default: bounded reuse of skill/socket feasibility answers within one
matching run, plus reuse of identical socket-capacity calculations within each
skill-subset check. Existing bonus pruning remains enabled; experimental early
skill pruning remains disabled.

| Search | Control median | Optimized median | Results |
|---|---:|---:|---:|
| Moderate | 0.196 s | 0.187 s | 94 |
| Heavy | 0.382 s | 0.364 s | 100 |
| Bonus-heavy | 4.310 s | 3.009 s | 100 |

Three alternating A/B pairs ran sequentially in fresh processes on the same
machine. Both variants included the same profiling instrumentation and used
3-3-3 weapon sockets and the 100-result limit. Bonus-heavy improved about 30% in
median; smaller-search differences are modest and should not be overinterpreted.
These are local engine measurements, not browser timings or comparisons against
the historical uninstrumented 3.52-second run.

All ordered result-ID lists matched across all six runs for every scenario;
requested skill and set/group levels were checked on every returned build.
This verifies these capped scenarios, not global optimality or exhaustiveness.

## Where time went

Bonus-heavy visited 55,077 pairs and made only 12 bonus-bucket checks. Of the pairs,
52,249 failed the skill/socket bound. Exact decoration solving occurred 760 times.
The dominant repeated work was the feasibility bound, not selecting bonus buckets.

The pair cache avoided 17,743 bound evaluations (32%), reducing actual evaluations
to 37,334. Pair visits and decoration-solver calls did not change. In the first
control/treatment pair, bound time fell from 2,613 ms to 974 ms, while half
generation remained around 1.15–1.18 seconds. These component times are individual
run observations; the headline times above are medians.

## Safety and scope

The pair-cache key contains capped requested skill coverage and separately sorted
armor and weapon sockets. Requirements and eligible decorations are constant for
its lifetime. The cache is local to one matching run and clears at 10,000 entries,
so inventories, custom jewels, or later searches cannot reuse stale answers.
False and true answers are both cached. No candidate order or pruning rule changes.

Within a bound check, capacity reuse is scoped to one skill subset and its current
deficit. Armor/weapon types and socket sizes have separate keys. Combination
jewels and all original bound calculations are preserved. Tests compare cached
and uncached decisions across 225 combinations of slot pools and skill targets.

## Reproduce

Run Vitest on `src/benchmarks/requestedSearches.benchmark.test.js` with
`--maxWorkers=1`, `RUN_OPTIMIZER_BENCHMARKS=true`, and
`DISABLE_SKILL_PRUNING=true`. Set `DISABLE_MATCHING_CACHE=true` for control and
`false` for treatment. `REQUESTED_SEARCH_OUTPUT` optionally chooses the JSON
output path. Use fresh processes, alternate order, and avoid concurrent tests.

The six recorded runs, full profiles, and result IDs are saved in the ignored
`benchmark-results/matching-comparison.json`.

Engine callers can disable the optimization with `disableMatchingCache: true`.
This diagnostic mode is included in result-cache keys to avoid benchmark cache
contamination. The bound cache is not shared between runs or persisted.

## Next target

Half-state generation is now a larger fraction of runtime. Profile allocation,
state compaction, and repeated matching-bound scans before adding a more complex
cross-half index. A new index must earn its construction and memory costs and
preserve the order of compatible states if capped-result equivalence is desired.
