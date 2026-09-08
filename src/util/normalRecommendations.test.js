import { discoverSharedSlotRecommendations, getNormalRecommendationCandidates,
    normalVerificationParams, verifyNormalRecommendation } from './normalRecommendations';
import { searchAndSpeed } from './logic';

const screenshotParams = {
    skills: { 'Adrenaline Rush': 1, 'Critical Boost': 5, Burst: 1, Agitator: 5,
        'Weakness Exploit': 5, Antivirus: 3, 'Maximum Might': 3, 'Attack Boost': 5 },
    setSkills: { "Gore Magala's Tyranny": 1, "Fulgur Anjanath's Will": 1 },
    groupSkills: { "Lord's Soul": 1 }, weaponSlots: [3, 3, 3], weaponType: 'great_sword_hunting_horn',
    weaponBaseRaw: 100, weaponBaseAffinity: 0, weaponElementType: 'Water', weaponElementValue: 100,
    weaponSharpness: 'White', setSkillBonus: "Gore Magala's Tyranny", groupSkillBonus: "Lord's Soul"
};

it('checks Handicraft even when the returned builds have no free weapon sockets', () => {
    const candidates = getNormalRecommendationCandidates({ ...screenshotParams,
        priorResults: [{ freeWeaponSlots: [], skills: {} }] });
    expect(candidates.find(candidate => candidate.name === 'Handicraft')).toMatchObject({ level: 1, slotTypes: ['weapon'] });
    expect(candidates.some(candidate => candidate.name === 'Fire Attack')).toBe(false);
});

it('reserves shared slot searches for the explicit deeper check and preserves the query', async() => {
    const search = vi.fn(async() => ({ results: [] }));
    await discoverSharedSlotRecommendations(screenshotParams, search);
    expect(search).not.toHaveBeenCalled();
    await discoverSharedSlotRecommendations({ ...screenshotParams, recommendationDeepSlots: true }, search);
    expect(search.mock.calls.length).toBeGreaterThan(0);
    expect(search.mock.calls.length).toBeLessThanOrEqual(6);
    for (const [query] of search.mock.calls) {
        expect(query.skills).toEqual(screenshotParams.skills);
        expect(query.setSkills).toEqual(screenshotParams.setSkills);
        expect(query.groupSkills).toEqual(screenshotParams.groupSkills);
        expect(query.findOne).toBe(true);
        expect([...(query.recommendationSlots.armor || []), ...(query.recommendationSlots.weapon || [])].length)
            .toBeGreaterThan(0);
    }
});

it('preserves equipment restrictions, inventory, bonuses and existing targets in the new search', () => {
    const params = { ...screenshotParams, mandatoryArmor: ['helm'], blacklistedArmor: ['chest'],
        customTalismans: [{ name: 'Mine' }], customDecorations: [{ name: 'Custom' }],
        decoMods: { 'Handicraft Jewel 1': 0 }, slotFilters: { 1: 1 } };
    const proof = normalVerificationParams(params, { name: 'Handicraft', level: 1 }, 5000);
    expect(proof).toMatchObject({ ...params, skills: { ...params.skills, Handicraft: 1 },
        findOne: true, maxSearchMs: 5000 });
    expect(params.skills.Handicraft).toBeUndefined();
});

it('treats timeouts as unresolved and requires a witness that meets all targets', async() => {
    const candidate = { name: 'Handicraft', level: 1 };
    expect((await verifyNormalRecommendation(screenshotParams, candidate, 10,
        async() => ({ results: [], profile: { timedOut: true } }))).status).toBe('unresolved');
    expect((await verifyNormalRecommendation(screenshotParams, candidate, 10,
        async() => ({ results: [{ skills: { Handicraft: 1 } }] }))).status).toBe('checked');
});

it('finds the reported Handicraft 1 improvement with the screenshot targets', async() => {
    const proof = await verifyNormalRecommendation(screenshotParams,
        { name: 'Handicraft', level: 1 }, 30000, searchAndSpeed);
    expect(proof.status).toBe('proven');
    expect(proof.results[0].skills.Handicraft).toBeGreaterThanOrEqual(1);
}, 45000);
