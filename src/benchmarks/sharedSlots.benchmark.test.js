/* eslint-disable no-process-env */
import fs from 'fs';
import { searchAndSpeed } from '../util/logic';
import { discoverSharedSlotRecommendations, verifyNormalRecommendation } from '../util/normalRecommendations';

const run = process.env.RUN_OPTIMIZER_BENCHMARKS === 'true' ? it : it.skip;
run('compares shared slot recommendations with individual searches for the reported setup', async() => {
    const params = {
        skills: { 'Adrenaline Rush': 1, 'Critical Boost': 5, Burst: 1, Agitator: 5,
            'Weakness Exploit': 5, Antivirus: 3, 'Maximum Might': 3, 'Attack Boost': 5 },
        setSkills: { "Gore Magala's Tyranny": 1, "Fulgur Anjanath's Will": 1 },
        groupSkills: { "Lord's Soul": 1 }, weaponSlots: [3, 3, 3], weaponType: 'great_sword_hunting_horn',
        weaponBaseRaw: 100, weaponElementType: 'Water', weaponElementValue: 100,
        weaponSharpness: 'White', setSkillBonus: "Gore Magala's Tyranny", groupSkillBonus: "Lord's Soul"
    };
    const base = await searchAndSpeed({ ...params, limit: 100 });
    expect(base.results.length).toBeGreaterThan(0);
    const updates = [];
    const shared = await discoverSharedSlotRecommendations({ ...params, priorResults: base.results }, searchAndSpeed,
        update => updates.push({ milliseconds: update.stats.milliseconds, found: Object.keys(update.recommendations).length,
            handicraft: update.recommendations.Handicraft?.level || 0 }));
    const individual = [];
    for (const name of ['Artillery', 'Focus', 'Guard', 'Handicraft']) {
        const started = performance.now();
        const proof = await verifyNormalRecommendation(params, { name, level: 1 }, 8000, searchAndSpeed);
        individual.push({ name, status: proof.status, milliseconds: performance.now() - started });
    }
    for (const [name, info] of Object.entries(shared.recommendations)) {
        for (const witness of info.seedResults) {
            for (const [skill, level] of Object.entries({ ...params.skills, [name]: info.level })) {
                expect(witness.skills[skill]).toBeGreaterThanOrEqual(level);
            }
        }
    }
    fs.mkdirSync('benchmark-results', { recursive: true });
    fs.writeFileSync('benchmark-results/shared-slots.json', JSON.stringify({
        baseSeconds: base.seconds, stats: shared.stats, updates, individual,
        recommendations: Object.fromEntries(Object.entries(shared.recommendations).map(([name, info]) => [name, info.level]))
    }, null, 2));
    for (const proof of individual) {
        if (proof.status === 'proven') { expect(shared.recommendations[proof.name]?.level, proof.name).toBeGreaterThanOrEqual(1); }
    }
    expect(shared.recommendations.Handicraft?.level).toBeGreaterThanOrEqual(1);
}, 120000);
