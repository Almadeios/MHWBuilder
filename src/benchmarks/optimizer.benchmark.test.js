/* eslint-disable no-process-env */
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { searchAndSpeed } from '../util/logic';

const benchmarkEnabled = process.env.RUN_OPTIMIZER_BENCHMARKS === 'true';
const benchmarkDescribe = benchmarkEnabled ? describe : describe.skip;

const IMPOSSIBLE_SEARCH = {
  skills: { 'Attack Boost': 999 }, limit: 1, findOne: true
};

const SMALL_SEARCH = {
  skills: { Adaptability: 1 },
  weaponSlots: [1],
  useOnlyOwnedTalismans: true,
  customTalismans: [],
  limit: 1,
  findOne: true,
  maxSearchMs: 1200
};

const MEDIUM_SEARCH = {
  skills: { 'Critical Boost': 5 },
  weaponSlots: [3, 3, 3],
  blacklistedArmorTypes: ['head', 'chest', 'arms', 'waist', 'legs'],
  limit: 1,
  findOne: true,
  maxSearchMs: 2500
};

const HEAVY_SEARCH = {
  skills: {
    'Attack Boost': 5,
    Artillery: 3,
    'Offensive Guard': 3,
    'Load Shells': 2,
    Burst: 5
  },
  weaponSlots: [3, 3, 3],
  weaponBaseRaw: 100,
  weaponElementType: 'None',
  weaponElementValue: 100,
  weaponSharpness: 'White',
  groupSkillBonus: "Lord's Soul",
  limit: 100,
  maxSearchMs: 5000
};

const serializeResponse = (response, samples = 3) => {
  const startedAt = performance.now();
  let serialized = '';
  for (let index = 0; index < samples; index++) {
    serialized = JSON.stringify(response);
    JSON.parse(serialized);
  }
  return {
    serializedBytes: Buffer.byteLength(serialized, 'utf8'),
    serializationMs: (performance.now() - startedAt) / samples
  };
};

const runScenario = async(label, params) => {
  const startedAt = performance.now();
  const response = await searchAndSpeed(params);
  const elapsedMs = performance.now() - startedAt;
  const profile = response.profile || {};
  const slowestStage = Object.entries(profile.stages || {})
    .sort((left, right) => right[1] - left[1])[0] || ['none', 0];
  return {
    label,
    elapsedMs,
    engineMs: Number(profile.runtimeMs || 0),
    budgetMs: Number(params.maxSearchMs || 0),
    budgetOverrunMs: params.maxSearchMs ?
      Math.max(0, Number(profile.runtimeMs || elapsedMs) - params.maxSearchMs) : 0,
    results: response.results.length,
    nodes: Number(profile.nodes || 0),
    pruned: Number(profile.pruned || 0),
    halfStates: Number(profile.generatedHalfStates || 0),
    decoChecks: Number(profile.decorationSolverCalls || 0),
    cacheHit: Boolean(profile.cacheHit),
    candidateListReuseHits: Number(profile.candidateListReuseHits || 0),
    candidatePrepCacheHits: Number(profile.candidatePrepCacheHits || 0),
    feasibilityCacheHits: Number(profile.searchFeasibilityCacheHits || 0),
    impossible: Boolean(profile.impossible),
    slowestStage: slowestStage[0],
    slowestStageMs: Number(slowestStage[1] || 0),
    stages: profile.stages || {},
    ...serializeResponse(response)
  };
};

const printable = measurement => ({
  Scenario: measurement.label,
  'Wall ms': measurement.elapsedMs.toFixed(1),
  'Engine ms': measurement.engineMs.toFixed(1),
  'Overrun ms': measurement.budgetOverrunMs.toFixed(1),
  'Slowest stage': `${measurement.slowestStage} ${measurement.slowestStageMs.toFixed(1)}`,
  Results: measurement.results,
  Nodes: measurement.nodes.toLocaleString('en-US'),
  Pruned: measurement.pruned.toLocaleString('en-US'),
  'Half states': measurement.halfStates.toLocaleString('en-US'),
  'Deco checks': measurement.decoChecks.toLocaleString('en-US'),
  Cache: measurement.cacheHit ? 'hit' : 'miss',
  'List reuse': measurement.candidateListReuseHits,
  'Payload KB': (measurement.serializedBytes / 1024).toFixed(1),
  'Serialize ms': measurement.serializationMs.toFixed(2)
});

benchmarkDescribe('optimizer benchmarks', () => {
  vi.setConfig({ testTimeout: 120000 });

  it('records representative optimizer and serialization measurements', async() => {
    const measurements = [];
    measurements.push(await runScenario('impossible', IMPOSSIBLE_SEARCH));
    measurements.push(await runScenario('impossible-cache', IMPOSSIBLE_SEARCH));
    measurements.push(await runScenario('small', SMALL_SEARCH));
    measurements.push(await runScenario('medium', MEDIUM_SEARCH));
    measurements.push(await runScenario('medium-cache', MEDIUM_SEARCH));
    measurements.push(await runScenario('heavy', HEAVY_SEARCH));

    expect(measurements.find(item => item.label === 'impossible')).toMatchObject({
      impossible: true, nodes: 0, results: 0
    });
    expect(measurements.find(item => item.label === 'impossible-cache').cacheHit).toBe(true);
    expect(measurements.find(item => item.label === 'small').results).toBeGreaterThan(0);
    expect(measurements.find(item => item.label === 'medium').results).toBeGreaterThan(0);
    expect(measurements.find(item => item.label === 'medium-cache').cacheHit).toBe(true);
    expect(measurements.find(item => item.label === 'heavy').results).toBeGreaterThan(0);
    expect(measurements.every(item => item.serializedBytes > 0)).toBe(true);

    console.log('\nOptimizer benchmark results');
    console.table(measurements.map(printable));

    const outputFile = process.env.BENCHMARK_OUTPUT;
    if (outputFile) {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, JSON.stringify({
        generatedAt: new Date().toISOString(),
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        measurements
      }, null, 2));
      console.log(`Saved benchmark data to ${outputFile}`);
    }
  });
});
