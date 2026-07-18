# Optimizer benchmarks

Run the dedicated benchmark suite with:

```sh
npm run benchmark
```

The command measures six paths: impossible input and its cached repeat, a small
search, a medium search, the same medium search served from cache, and a heavy search requesting
a five-second optimizer budget. It also measures budget overrun, serialized
response size, and JSON serialize/parse time. Budget overrun remains visible so
the cooperative deadline checks can be monitored as optimizer loops evolve.

Results are printed as a table and saved to `benchmark-results/latest.json`.
That directory is intentionally ignored by Git. Keep or rename a result before
an optimization when you want to compare it with the next run.

Wall-clock values should only be compared on the same computer under similar
load. Node counts, pruned states, cache hits, result counts, and payload size are
more stable across computers. The benchmark asserts correctness and cache
behavior, but it does not fail on absolute timing because that would make it
unreliable across different CPUs and CI runners.
