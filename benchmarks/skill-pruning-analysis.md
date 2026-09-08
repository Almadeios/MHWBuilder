# Skill-capacity pruning experiment

The new skill check is implemented but **disabled by default**. Enable it for an
engine call with `disableSkillPruning: false`. Existing bonus pruning stays on.
The switch is for engine experiments, not a UI preference.

## Method

Three alternating control/treatment pairs ran sequentially in fresh Vitest
processes on the same machine. Each process ran Moderate, Heavy, and Bonus-heavy
in that order. Both variants used the current bonus pruning and value ordering,
3-3-3 weapon slots, and a 100-result limit. These measure the local engine, not
browser rendering. Each returned build was checked against requested skills and
set/group bonuses. A result cap is not proof of exhaustive or optimal results.

Raw samples are in the ignored `benchmark-results/skill-pruning-comparison.json`.

| Scenario | Control median | Skill pruning median | Generated states, before → after | Results |
|---|---:|---:|---:|---:|
| Moderate | 0.184 s | 0.173 s | 6,189 → 6,189 | 94 |
| Heavy | 0.369 s | 0.372 s | 7,322 → 7,140 | 100 |
| Bonus-heavy | 3.520 s | 3.627 s | 106,392 → 104,238 | 100 |

The Heavy case removed 182 extensions (2.5%); Bonus-heavy removed 2,154 (2.0%).
Decoration solver calls remained 81, 163, and 760 respectively. Moderate pruned
nothing, so its apparent timing improvement should not be attributed to pruning.
Bonus-heavy was about 3% slower in median despite generating fewer states.
With three samples these are exploratory measurements, not statistical claims.

## Interpretation

The check eliminates some states that later checks would reject anyway. It does
not reduce expensive decoration solving in these cases, and adds capacity-vector
work during half generation. The small reduction does not justify enabling it
for normal searches yet. The previous 5.18-second measurement is not the control
for this experiment: comparing it directly would exaggerate the benefit.

## Safety and cache behavior

Bounds include the opposite half, base weapon sockets, charm weapon sockets,
custom decorations, and combined jewels. Armor and weapon sockets stay separate.
Per-skill bounds and a combined requested-skill bound assume unlimited jewels;
finite inventory can only make a build harder. An impossible upper bound safely
rejects a branch, while a passing bound does not prove feasibility.

Pruned half caches include capacity context and exact skill targets. They cannot
be projected from harder targets to easier targets: previously rejected states
could become valid. The existing projection path remains tested with skill
pruning disabled. Small exhaustive tests compare enabled/disabled solutions,
using an independent jewel assignment check with limited quantities.

## Reproduce

Run `src/benchmarks/requestedSearches.benchmark.test.js` with Vitest and
`RUN_OPTIMIZER_BENCHMARKS=true`. Set `DISABLE_SKILL_PRUNING=true` for the control
and `false` for treatment. Use `--maxWorkers=1`, separate processes, no concurrent
tests, and alternate run order. Output files distinguish control and treatment.

## Next investigation

Profile half-state construction and the left/right matching loop separately.
Target repeated compatibility comparisons or index compatible opposite-half
states before adding more per-extension checks. Also benchmark genuinely
inventory-constrained inputs; the current optimistic bounds intentionally ignore
inventory scarcity.
