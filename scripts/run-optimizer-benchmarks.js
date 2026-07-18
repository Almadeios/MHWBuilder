/* eslint-env node */
/* eslint-disable no-process-env */
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const vitest = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');
const benchmarkFile = path.join(projectRoot, 'src', 'benchmarks', 'optimizer.benchmark.test.js');
const outputFile = path.join(projectRoot, 'benchmark-results', 'latest.json');
const result = spawnSync(process.execPath, [
    vitest,
    'run',
    benchmarkFile,
    '--maxWorkers=1'
], {
    cwd: projectRoot,
    env: {
        ...process.env,
        BENCHMARK_OUTPUT: outputFile,
        CI: 'true',
        RUN_OPTIMIZER_BENCHMARKS: 'true'
    },
    stdio: 'inherit'
});

if (result.error) {
    throw result.error;
}

process.exitCode = result.status ?? 1;
