import {
  armorCombo,
  canDecorationSlotsCoverTotalDeficit,
  buildSearchCacheKey,
  collapseFlexibleTalismanResults,
  doesMitmStateDominate,
  extendPriorResults,
  getDecorationReplacementCost,
  groupEquivalentArmorCandidates,
  mergeUniqueResultGroups,
  orderMitmSlotsByRestriction,
  searchAndSpeed,
  sortTalismanCandidatesBySlotSavings
  , test
} from './logic';
import { generateTalismans } from './talismanGenerator';
import HEAD from '../data/compact/head.json';
import CHEST from '../data/compact/chest.json';
import ARMS from '../data/compact/arms.json';
import WAIST from '../data/compact/waist.json';
import LEGS from '../data/compact/legs.json';
import DECORATIONS from '../data/compact/decoration.json';

describe('search feasibility and custom decorations', () => {
  it('orders each MITM half by its most restrictive armor slot', () => {
    expect(orderMitmSlotsByRestriction(['head', 'chest', 'arms'], {
      head: Array(12),
      chest: Array(3),
      arms: Array(7)
    })).toEqual(['chest', 'arms', 'head']);
  });

  it('only dominates MITM states with at least the same skills and compatible slots', () => {
    const superior = {
      skillVector: Uint16Array.from([3, 1]),
      armorSlots: [3, 2, 1],
      weaponSlots: [3, 2]
    };
    expect(doesMitmStateDominate(superior, {
      skillVector: Uint16Array.from([2, 1]),
      armorSlots: [2, 2],
      weaponSlots: [2]
    })).toBe(true);
    expect(doesMitmStateDominate(superior, {
      skillVector: Uint16Array.from([3, 2]),
      armorSlots: [2, 2],
      weaponSlots: [2]
    })).toBe(false);
    expect(doesMitmStateDominate(superior, {
      skillVector: Uint16Array.from([2, 1]),
      armorSlots: [3, 3],
      weaponSlots: [2]
    })).toBe(false);
  });

  it('groups armor equivalent to the query while preserving required bonus differences', () => {
    const makePiece = (extraSkill, setSkills = []) => [
      'head', { Agitator: 1, [extraSkill]: 1 }, [], [2], 50, [0, 0, 0, 0, 0], 'high', setSkills
    ];
    const first = ['First', makePiece('Botanist')];
    const second = ['Second', makePiece('Geologist')];
    const gore = ['Gore', makePiece('Botanist', ["Gore Magala's Tyranny"])];
    const grouped = groupEquivalentArmorCandidates(
      [first, second, gore],
      { Agitator: 5 },
      { "Gore Magala's Tyranny": 2 },
      {}
    );

    expect(grouped.representatives).toHaveLength(2);
    expect(grouped.membersByPiece.get(first[1]).map(([name]) => name)).toEqual([
      'First', 'Second'
    ]);
  });

  it('rejects competing decoration deficits while allowing a dual-skill jewel', () => {
    const desiredSkills = { Agitator: 1, Burst: 1 };
    const separateDecos = {
      Agitator: ['armor', { Agitator: 1 }, 1],
      Burst: ['armor', { Burst: 1 }, 1]
    };
    const dualDeco = {
      Combo: ['armor', { Agitator: 1, Burst: 1 }, 1]
    };

    expect(canDecorationSlotsCoverTotalDeficit(
      {}, [1], [], desiredSkills, separateDecos
    )).toBe(false);
    expect(canDecorationSlotsCoverTotalDeficit(
      {}, [1], [], desiredSkills, dualDeco
    )).toBe(true);
  });

  it('detects two armor skills competing despite unrelated weapon-slot capacity', () => {
    expect(canDecorationSlotsCoverTotalDeficit(
      {}, [1], [3], { Agitator: 1, Burst: 1, Artillery: 1 }, {
        Agitator: ['armor', { Agitator: 1 }, 1],
        Burst: ['armor', { Burst: 1 }, 1],
        Artillery: ['weapon', { Artillery: 10 }, 1]
      }
    )).toBe(false);
  });

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

  it('proves an unreachable skill target impossible before entering MITM', async() => {
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

  it('reuses identical MITM halves across searches with a different time budget', async() => {
    const parameters = {
      skills: { Adaptability: 1 },
      weaponSlots: [1],
      useOnlyOwnedTalismans: true,
      customTalismans: [],
      limit: 1,
      findOne: true
    };
    const first = await searchAndSpeed({ ...parameters, maxSearchMs: 1101 });
    const second = await searchAndSpeed({ ...parameters, maxSearchMs: 1102 });

    expect(first.results).toHaveLength(1);
    expect(second.results).toHaveLength(1);
    expect(second.profile.halfCacheHits).toBe(2);
    expect(second.profile.halfCacheStatesReused).toBeGreaterThan(0);
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
    expect(response.profile.inputCandidateCount).toBeGreaterThan(0);
    expect(response.profile.filteredCandidateCount).toBeLessThanOrEqual(
      response.profile.inputCandidateCount
    );
    expect(response.profile.generatedHalfStates).toBeGreaterThan(0);
    expect(response.profile.decorationSolverCalls).toBeGreaterThan(0);
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

  it('extends a proven result through consecutive recommended armor skills', () => {
    const baseSkills = {
      'Maximum Might': 3,
      'Evade Window': 3
    };
    const baseResult = {
      armorNames: ['head', 'chest', 'arms', 'waist', 'legs', 'charm'],
      skills: baseSkills,
      setSkills: { "Gore Magala's Tyranny": 1 },
      groupSkills: { "Lord's Soul": 1 },
      freeSlots: [1, 1],
      freeWeaponSlots: [],
      decoNames: [],
      talismanData: {}
    };
    const params = {
      skills: {
        ...baseSkills,
        'Shock Absorber': 1,
        'Item Prolonger': 1
      },
      setSkills: { "Gore Magala's Tyranny": 1 },
      groupSkills: { "Lord's Soul": 1 }
    };
    const decos = {
      'Shockproof Jewel 1': ['armor', { 'Shock Absorber': 1 }, 1],
      'Enduring Jewel 1': ['armor', { 'Item Prolonger': 1 }, 1]
    };

    const extended = extendPriorResults([baseResult], params, decos);

    expect(extended).toHaveLength(1);
    expect(extended[0].skills).toEqual(expect.objectContaining({
      'Evade Window': 3,
      'Shock Absorber': 1,
      'Item Prolonger': 1
    }));
    expect(extended[0].freeSlots).toEqual([]);
  });

  it('does not extend a prior result that lacks a required bonus', () => {
    const priorResult = {
      armorNames: ['head', 'chest', 'arms', 'waist', 'legs', 'charm'],
      skills: { 'Evade Window': 3 },
      setSkills: {},
      groupSkills: { "Lord's Soul": 1 },
      freeSlots: [1],
      freeWeaponSlots: [],
      talismanData: {}
    };
    const extended = extendPriorResults([priorResult], {
      skills: { 'Evade Window': 3, 'Shock Absorber': 1 },
      setSkills: { "Gore Magala's Tyranny": 1 },
      groupSkills: { "Lord's Soul": 1 }
    }, {
      'Shockproof Jewel 1': ['armor', { 'Shock Absorber': 1 }, 1]
    });

    expect(extended).toEqual([]);
    expect(priorResult.freeSlots).toEqual([1]);
  });

  it('keeps prior results immutable while extending recommendations', () => {
    const priorResult = {
      armorNames: ['head', 'chest', 'arms', 'waist', 'legs', 'charm'],
      skills: { 'Evade Window': 3 },
      setSkills: {},
      groupSkills: {},
      freeSlots: [1],
      freeWeaponSlots: [],
      decoNames: [],
      talismanData: {}
    };
    const snapshot = JSON.parse(JSON.stringify(priorResult));
    const extended = extendPriorResults([priorResult], {
      skills: { 'Evade Window': 3, 'Shock Absorber': 1 }
    }, {
      'Shockproof Jewel 1': ['armor', { 'Shock Absorber': 1 }, 1]
    });

    expect(extended).toHaveLength(1);
    expect(priorResult).toEqual(snapshot);
  });

  it('completes the reported Burst gunlance-style search', async() => {
    const partialBatches = [];
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
      partialResultFunc: results => partialBatches.push(results),
      limit: 100
    });

    expect(response).toEqual(expect.objectContaining({
      results: expect.any(Array),
      seconds: expect.any(Number),
      profile: expect.any(Object)
    }));
    expect(() => JSON.parse(JSON.stringify(response))).not.toThrow();
    expect(partialBatches).toHaveLength(2);
    expect(partialBatches[0].length).toBeGreaterThan(0);
    expect(partialBatches[0].length).toBeLessThanOrEqual(20);
    expect(partialBatches[1].length).toBeGreaterThan(partialBatches[0].length);
    expect(partialBatches[1].length).toBeLessThanOrEqual(50);
  }, 20000);

  it('finds the reported ranged build with the R7 Rapid Fire Up and Burst charm', async() => {
    const charmName = 'Reported R7 Rapid Burst Charm';
    const skills = {
        'Maximum Might': 3,
        'Rapid Fire Up': 1,
        'Normal Shots': 1,
        Burst: 1,
        'Weakness Exploit': 5,
        Agitator: 5,
        'Adrenaline Rush': 2,
        'Critical Boost': 5,
        Earplugs: 2
    };
    const directSet = armorCombo(
      { name: 'Arkvulcan Helm Gamma', data: HEAD['Arkvulcan Helm Gamma'] },
      { name: 'Gogmazios Mail Beta', data: CHEST['Gogmazios Mail Beta'] },
      { name: 'G Rathalos Vambraces Beta+', data: ARMS['G Rathalos Vambraces Beta+'] },
      { name: 'Dahaad Shardcoil Gamma', data: WAIST['Dahaad Shardcoil Gamma'] },
      { name: 'Sororal Boots Alpha', data: LEGS['Sororal Boots Alpha'] },
      {
        name: charmName,
        data: ['talisman', { 'Rapid Fire Up': 1, Burst: 1 }, [], [2], 0, [], 'high', [], []]
      },
      [3, 3, 3], "Gore Magala's Tyranny", "Lord's Soul"
    );
    expect(test(directSet, DECORATIONS, skills, {})).not.toBeNull();

    const response = await searchAndSpeed({
      skills,
      setSkills: {
        "Gore Magala's Tyranny": 1,
        "Rathalos's Flare": 1
      },
      groupSkills: { "Lord's Soul": 1 },
      setSkillBonus: "Gore Magala's Tyranny",
      groupSkillBonus: "Lord's Soul",
      weaponSlots: [3, 3, 3],
      mandatoryArmor: [
        'Arkvulcan Helm Gamma',
        'Gogmazios Mail Beta',
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
