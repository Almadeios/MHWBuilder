# Shared recommendation checks

The previous normal-skill explorer ran one complete armor search per skill and
then queued further searches for higher levels. The quick pass now solves
decoration placement on returned equipment, caches equivalent placement
problems, and checks legal generated charm substitutions that retain the
required charm contributions and socket layout. Each suggestion carries a
concrete compatible witness. Pinned, excluded and owned-only charm restrictions
still apply.

For the reported Attack Boost 5 / Critical Boost 5 build with Gore Magala,
Fulgur Anjanath and Lord's Soul requirements, a local run measured:

| Measurement | Time | Full armor searches |
| --- | ---: | ---: |
| Quick pass: 81 skill improvements, including Handicraft 1 | 2.21 s | 0 |
| Previous method: Artillery 1, Focus 1, Guard 1, Handicraft 1 only | 18.95 s combined | 4 |

The original armor search took 3.69 s and is excluded from both recommendation
measurements. This is one local comparison, not a median or a comparison of two
exhaustive recommendation lists. All four comparison skills were included in
the quick results. Raw output is in the ignored
`benchmark-results/shared-slots.json` file.

The quick pass samples up to 160 concrete equipment/charm variants and uses a
five-second local exploration budget. It does not prove globally maximal skill
levels or impossibility for omitted skills. The deeper button first checks
shared armor/weapon slot capacity, then searches remaining individual targets.
Capacity queries reserve actual slots before decoration placement and have
separate result-cache keys; they reuse ordinary candidate preparation.

Reproduce with PowerShell:

```powershell
$env:RUN_OPTIMIZER_BENCHMARKS='true'
npx vitest run src/benchmarks/sharedSlots.benchmark.test.js --maxWorkers=1
```

Regression checks cover finite decoration inventory, combined packing,
reserved armor slots, weapon/armor separation, set/group requirements, legal
charm variants, owned-only/pinned/excluded charms, cache isolation, worker
streaming/cancellation and optional deeper checks. The browser scenario verifies
that Handicraft appears without requesting deeper checks and that selecting it
returns a build.
