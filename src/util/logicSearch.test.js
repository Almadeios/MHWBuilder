import { buildSearchCacheKey, searchAndSpeed } from './logic';

describe('search feasibility and custom decorations', () => {
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
});
