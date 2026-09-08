import { createSlotRecommendationAnalyzer } from './slotRecommendations';
import { reserveSlots } from './slotReservation';
import { buildSearchCacheKey, configureSearchDecorations, test as testArmor } from './logic';
import INVENTORY from '../data/user/deco-inventory.json';
import { generateTalismans } from './talismanGenerator';

const params = {
    decoMods: Object.fromEntries(Object.keys(INVENTORY).map(name => [name, 0])),
    skills: { 'Attack Boost': 1 }, customDecorations: [
        { name: 'Required', type: 'weapon', size: 1, skills: { 'Attack Boost': 1 }, amount: 1 },
        { name: 'Extra', type: 'weapon', size: 1, skills: { Handicraft: 1 }, amount: 1 },
        { name: 'Alternative', type: 'weapon', size: 1, skills: { Guard: 1 }, amount: 1 }
    ]
};
const candidates = [
    { name: 'Handicraft', max: 5, slotTypes: ['weapon'] },
    { name: 'Guard', max: 3, slotTypes: ['weapon'] }
];
const source = { armorNames: ['test'], baseSkills: {}, skills: { 'Attack Boost': 1 },
    slots: [], weaponSlots: [1, 1], decoNames: ['Required'], freeSlots: [], freeWeaponSlots: [1] };

it('shares one equipment layout across all compatible skills and respects finite inventory', () => {
    const analyzer = createSlotRecommendationAnalyzer(params, candidates);
    analyzer.analyze([source]);
    expect(analyzer.recommendations.Handicraft.level).toBe(1);
    expect(analyzer.recommendations.Guard.level).toBe(1);
    for (const info of Object.values(analyzer.recommendations)) {
        const witness = info.seedResults[0];
        expect(witness.skills['Attack Boost']).toBe(1);
        expect(witness.decoNames).toContain('Required');
        expect(witness.decoNames).toHaveLength(2);
    }
    const checks = analyzer.stats.decorationChecks;
    analyzer.analyze([{ ...source }]);
    expect(analyzer.stats.decorationChecks).toBe(checks);
    expect(analyzer.stats.cacheHits).toBeGreaterThan(0);
});

it('rearranges required decorations to reveal space that the original placement missed', () => {
    const analyzer = createSlotRecommendationAnalyzer({ ...params, customDecorations: [
        ...params.customDecorations,
        { name: 'Inefficient', type: 'weapon', size: 1, skills: { 'Attack Boost': 1 }, amount: 2 },
        { name: 'Efficient', type: 'weapon', size: 1, skills: { 'Attack Boost': 2 }, amount: 1 }
    ], skills: { 'Attack Boost': 2 } }, candidates);
    analyzer.analyze([{ ...source, decoNames: ['Inefficient', 'Inefficient'], freeWeaponSlots: [] }]);
    expect(analyzer.recommendations.Handicraft.level).toBe(1);
    expect(analyzer.recommendations.Handicraft.seedResults[0].decoNames).toContain('Efficient');
});

it('preserves armor slot reservations, slot types, bonuses and concrete charm alternatives', () => {
    const analyzer = createSlotRecommendationAnalyzer({ ...params, slotFilters: { 1: 1 },
        setSkills: { Set: 1 } }, candidates);
    analyzer.analyze([{ ...source, slots: [1], weaponSlots: [1], setSkills: { Set: 1 } },
        { ...source, slots: [1], setSkills: {} }]);
    expect(analyzer.recommendations).toEqual({});
    const flex = createSlotRecommendationAnalyzer({ skills: {} }, candidates);
    flex.analyze([{ talismanFlex: { options: { Handicraft: 5, Guard: 3 } }, recommendationSeedResults: [
        { ...source, baseSkills: { Handicraft: 1 }, weaponSlots: [] },
        { ...source, baseSkills: { Guard: 1 }, weaponSlots: [] }
    ] }]);
    expect(flex.recommendations.Handicraft.level).toBe(1);
    expect(flex.recommendations.Handicraft.seedResults[0].skills.Guard).toBeUndefined();
});

it('reserves actual sockets before solving and isolates capacity-query caches', () => {
    expect(reserveSlots([3, 1, 2], [2, 1])).toEqual({ available: [3], reserved: [2, 1] });
    expect(reserveSlots([1], [2])).toBeNull();
    const decos = configureSearchDecorations(params);
    const armor = { names: [], skills: {}, slots: [], weaponSlots: [1, 1], setSkills: {}, groupSkills: {} };
    const query = { ...params, recommendationSlots: { weapon: [1] } };
    const result = testArmor(armor, decos, params.skills, query);
    expect(result.freeWeaponSlots).toEqual([1]);
    expect(testArmor({ ...armor, weaponSlots: [1] }, decos, params.skills, query)).toBeNull();
    expect(buildSearchCacheKey(params)).not.toBe(buildSearchCacheKey(query));
    expect(testArmor({ ...armor, skills: params.skills, weaponSlots: [] }, decos, params.skills, query)).toBeNull();
});

it('uses legal generated charm substitutions only when ownership and pinning allow them', () => {
    const [name, data] = Object.entries(generateTalismans({ 'Attack Boost': 5 }))
        .find(([charmName, charm]) => charmName.startsWith('Golden Age Charm') &&
            charm[1]['Attack Boost'] && charm[1]['Critical Eye']);
    const query = { ...params, customDecorations: [], skills: { 'Attack Boost': data[1]['Attack Boost'] } };
    const witness = { ...source, armorNames: ['head', 'chest', 'arms', 'waist', 'legs', name],
        baseSkills: data[1], slots: data[3], weaponSlots: data[8], talismanData: { [name]: data } };
    const analyzer = createSlotRecommendationAnalyzer(query, candidates);
    analyzer.analyze([witness]);
    expect(analyzer.recommendations.Handicraft?.level).toBeGreaterThanOrEqual(1);
    const replacement = analyzer.recommendations.Handicraft.seedResults[0];
    const replacementName = replacement.armorNames[5];
    expect(generateTalismans({ ...query.skills, Handicraft: 1 })[replacementName]).toEqual(replacement.talismanData[replacementName]);
    for (const restriction of [{ useOnlyOwnedTalismans: true }, { mandatoryArmor: ['', '', '', '', '', name] },
        { blacklistedArmor: [replacementName] }]) {
        const restricted = createSlotRecommendationAnalyzer({ ...query, ...restriction }, candidates);
        restricted.analyze([witness]);
        if (restriction.blacklistedArmor) {
            expect(restricted.recommendations.Handicraft?.seedResults[0].armorNames[5]).not.toBe(replacementName);
        } else {
            expect(restricted.recommendations.Handicraft).toBeUndefined();
        }
    }
});
