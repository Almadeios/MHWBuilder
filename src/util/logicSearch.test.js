import { buildSearchCacheKey, mergeUniqueResultGroups, searchAndSpeed } from './logic';

describe('search feasibility and custom decorations', () => {
  it('merges opportunistic result groups without favoring the first group', () => {
    const result = armorName => ({
      armorNames: [armorName],
      decoNames: [],
      freeSlots: [],
      freeWeaponSlots: []
    });
    const base = result('Base armor');
    const dahaad = result('Jin Dahaad armor');
    const other = result('Other set armor');

    expect(mergeUniqueResultGroups([[dahaad, base], [other, base]])).toEqual([dahaad, base, other]);
    expect(mergeUniqueResultGroups([[other, base], [dahaad, base]])).toEqual([other, base, dahaad]);
  });

  it('proves an unreachable skill target impossible before entering the DFS', async() => {
    const response = await searchAndSpeed({
      skills: { 'Attack Boost': 999 },
      limit: 1,
      findOne: true
    });

    expect(response.results).toEqual([]);
    expect(response.profile.impossible).toBe(true);
    expect(response.profile.nodes).toBe(0);
    expect(response.profile.impossibleReasons[0]).toContain('Attack Boost Lv. 999');
  });

  it('uses a saved custom decoration in search and cache identity', async() => {
    const customDecorations = [{
      name: 'Custom Attack Jewel',
      type: 'weapon',
      size: 1,
      skills: { 'Attack Boost': 5 },
      amount: 1
    }];
    const params = {
      skills: { 'Attack Boost': 5 },
      weaponSlots: [1],
      blacklistedArmorTypes: ['head', 'chest', 'arms', 'waist', 'legs'],
      customDecorations,
      limit: 1,
      findOne: true
    };
    const response = await searchAndSpeed(params);

    expect(response.results).toHaveLength(1);
    expect(response.results[0].decoNames).toContain('Custom Attack Jewel');
    expect(buildSearchCacheKey(params)).not.toBe(buildSearchCacheKey({ ...params, customDecorations: [] }));
  });

  it('completes the reported Burst gunlance-style search', async() => {
    const response = await searchAndSpeed({
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
      limit: 100
    });

    expect(response).toEqual(expect.objectContaining({
      results: expect.any(Array),
      seconds: expect.any(Number),
      profile: expect.any(Object)
    }));
    expect(() => JSON.parse(JSON.stringify(response))).not.toThrow();
  }, 20000);
});
