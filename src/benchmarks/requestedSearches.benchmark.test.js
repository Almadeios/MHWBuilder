/* eslint-disable no-process-env */
import fs from 'fs';
import { searchAndSpeed } from '../util/logic';

const scenarios = [
    { name: 'Moderate', skills: {
        'Critical Boost': 5, 'Weakness Exploit': 5, 'Maximum Might': 3
    } },
    { name: 'Heavy', skills: {
        'Attack Boost': 5, Artillery: 3, 'Offensive Guard': 3, 'Load Shells': 2, Burst: 5
    } },
    { name: 'Bonus-heavy', skills: {
        'Critical Boost': 5, 'Offensive Guard': 3, "Master's Touch": 1,
        'Maximum Might': 3, 'Weakness Exploit': 5, Agitator: 5, Burst: 1,
        'Adrenaline Rush': 1, 'Evade Window': 2, Antivirus: 3
    }, setSkills: { "Gore Magala's Tyranny": 1 }, groupSkills: { "Lord's Soul": 1 },
    groupSkillBonus: "Lord's Soul", setSkillBonus: "Gore Magala's Tyranny" }
];

const run = process.env.RUN_OPTIMIZER_BENCHMARKS === 'true' ? it : it.skip;
run('measures the three requested build searches', async() => {
    const measurements = [];
    for (const scenario of scenarios) {
        const { name, ...requirements } = scenario;
        const params = { ...requirements, weaponSlots: [3, 3, 3], limit: 100,
            findOne: false, optimizationGoal: 'efficient',
            disableSkillPruning: process.env.DISABLE_SKILL_PRUNING !== 'false',
            disableMatchingCache: process.env.DISABLE_MATCHING_CACHE === 'true' };
        const response = await searchAndSpeed(params);
        measurements.push({ name, params, resultCount: response.results.length,
            seconds: response.seconds, profile: response.profile,
            resultIds: response.results.map(result => result.id) });
        fs.mkdirSync('benchmark-results', { recursive: true });
        const outputPath = process.env.REQUESTED_SEARCH_OUTPUT ||
            `benchmark-results/requested-searches${params.disableSkillPruning ? '-control' : ''}.json`;
        fs.writeFileSync(outputPath, JSON.stringify(measurements, null, 2));
        for (const result of response.results) {
            for (const [skill, level] of Object.entries(requirements.skills)) {
                expect(result.skills[skill] || 0).toBeGreaterThanOrEqual(level);
            }
            for (const [skill, level] of Object.entries(requirements.setSkills || {})) {
                expect(result.setSkills[skill] || 0).toBeGreaterThanOrEqual(level);
            }
            for (const [skill, level] of Object.entries(requirements.groupSkills || {})) {
                expect(result.groupSkills[skill] || 0).toBeGreaterThanOrEqual(level);
            }
        }
    }
}, 180000);
