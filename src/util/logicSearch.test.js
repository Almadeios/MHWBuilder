import {
  buildSearchCacheKey,
  collapseFlexibleTalismanResults,
  getDecorationReplacementCost,
  mergeUniqueResultGroups,
  prioritizeTalismanSearchOrder,
  searchAndSpeed,
  shouldExploreOpportunisticSetSkills,
  sortTalismanCandidatesBySlotSavings
} from './logic';
import { generateTalismans } from './talismanGenerator';

describe('search feasibility and custom decorations', () => {
  it('collapses equivalent optional charm skills into one Flex result', () => {
    const makeResult = optionalSkills => ({
      armorNames: ['h', 'c', 'a', 'w', 'l', `charm-${Object.keys(optionalSkills)[0]}`],
      freeSlots: [2],
      freeWeaponSlots: [],
      damageProfile: { expected_dps: 100 },
      talismanData: {
        [`charm-${Object.keys(optionalSkills)[0]}`]: [
          'talisman',
          { 'Rapid Fire Up': 1, 'Evade Window': 2, ...optionalSkills },
          [],
          [2],
          0,
          [],
          'high',
          [],
          []
        ]
      }
    });
    const collapsed = collapseFlexibleTalismanResults([
      makeResult({ Botanist: 2 }),
      makeResult({ Constitution: 2 })
    ], { 'Rapid Fire Up': 1, 'Evade Window': 2 });

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].talismanFlex).toEqual({
      requestedSkills: { 'Rapid Fire Up': 1, 'Evade Window': 2 },
      options: { Botanist: 2, Constitution: 2 },
      variantCount: 2
    });
    expect(collapsed[0].skills?.Botanist).toBeUndefined();
    expect(collapsed[0].skills?.Constitution).toBeUndefined();
  });

  it('explores efficient talismans before committing to armor combinations', () => {
    const order = prioritizeTalismanSearchOrder(
      ['head', 'chest', 'talisman', 'arms'],
      {
        head: Array(5),
        chest: Array(2),
        talisman: Array(300),
        arms: Array(3)
      }
    );
    expect(order).toEqual(['talisman', 'chest', 'arms', 'head']);
  });

  it('does not spend the search budget on opportunistic sets when bonuses are explicit', () => {
    const base = {
      skills: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`Skill ${index}`, 1])),
      findOne: false
    };
    expect(shouldExploreOpportunisticSetSkills(base)).toBe(true);
    expect(shouldExploreOpportunisticSetSkills({
      ...base,
      setSkills: { "Gore Magala's Tyranny": 1 }
    })).toBe(false);
    expect(shouldExploreOpportunisticSetSkills({
      ...base,
      groupSkills: { "Lord's Soul": 1 }
    })).toBe(false);
    expect(shouldExploreOpportunisticSetSkills({
      ...base,
      setSkillBonus: "Gore Magala's Tyranny"
    })).toBe(false);
    expect(shouldExploreOpportunisticSetSkills({
      ...base,
      groupSkillBonus: "Lord's Soul"
    })).toBe(false);
  });

  it('values expensive shot skills above cheap Critical Boost points on talismans', () => {
    expect(getDecorationReplacementCost('Normal Shots')).toBe(3);
    expect(getDecorationReplacementCost('Rapid Fire Up')).toBe(3);
    expect(getDecorationReplacementCost('Piercing Shots')).toBe(3);
    expect(getDecorationReplacementCost('Spread/Power Shots')).toBe(3);
    expect(getDecorationReplacementCost('Agitator')).toBe(3);
    expect(getDecorationReplacementCost('Critical Boost')).toBe(1);
  });

  it('walks efficient shot-skill talismans before Critical Boost-only families', () => {
    const desiredSkills = {
      'Normal Shots': 1,
      'Rapid Fire Up': 1,
      Agitator: 5,
      'Critical Boost': 5
    };
    const candidates = sortTalismanCandidatesBySlotSavings(
      Object.entries(generateTalismans(desiredSkills)),
      desiredSkills
    );
    const normalAgitatorIndex = candidates.findIndex(([, data]) =>
      data[1]?.['Normal Shots'] === 1 && data[1]?.Agitator === 1
    );
    const criticalOnlyFamilyIndex = candidates.findIndex(([, data]) =>
      data[1]?.['Critical Boost'] === 1 &&
      !data[1]?.['Normal Shots'] &&
      !data[1]?.['Rapid Fire Up'] &&
      !data[1]?.Agitator
    );

    expect(normalAgitatorIndex).toBeGreaterThanOrEqual(0);
    expect(criticalOnlyFamilyIndex).toBeGreaterThanOrEqual(0);
    expect(normalAgitatorIndex).toBeLessThan(criticalOnlyFamilyIndex);
  });

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

  it('uses the strongest compatible decoration in feasibility estimates', async() => {
    const response = await searchAndSpeed({
      skills: { 'Critical Boost': 5 },
      weaponSlots: [3, 3, 3],
      blacklistedArmorTypes: ['head', 'chest', 'arms', 'waist', 'legs'],
      limit: 1,
      findOne: true
    });

    expect(response.profile.impossible).not.toBe(true);
    expect(response.results).toHaveLength(1);
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

  it('finds the reported ranged build with the R7 Rapid Fire Up and Burst charm', async() => {
    const charmName = 'Reported R7 Rapid Burst Charm';
    const response = await searchAndSpeed({
      skills: {
        'Maximum Might': 3,
        'Rapid Fire Up': 1,
        'Normal Shots': 1,
        'Weakness Exploit': 5,
        Agitator: 5,
        Antivirus: 3,
        'Adrenaline Rush': 2,
        'Critical Boost': 5,
        Earplugs: 2
      },
      setSkills: {
        "Gore Magala's Tyranny": 1,
        "Rathalos's Flare": 1
      },
      groupSkills: { "Lord's Soul": 1 },
      setSkillBonus: "Gore Magala's Tyranny",
      groupSkillBonus: "Lord's Soul",
      weaponSlots: [3, 3, 3],
      mandatoryArmor: [
        'G Rathalos Helm Beta+',
        'Dahaad Shardmail Gamma',
        'G Rathalos Vambraces Beta+',
        'Dahaad Shardcoil Gamma',
        'Sororal Boots Alpha',
        ''
      ],
      customTalismans: [{
        id: 'reported-r7-charm',
        name: charmName,
        skills: { 'Rapid Fire Up': 1, Burst: 1 },
        slots: [2],
        weaponSlots: []
      }],
      useOnlyOwnedTalismans: true,
      limit: 1,
      findOne: true
    });

    expect(response.results).toHaveLength(1);
    expect(response.results[0].armorNames).toContain(charmName);
  }, 20000);
});
