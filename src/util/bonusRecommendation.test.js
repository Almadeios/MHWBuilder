import {
  buildCandidateVerificationParams,
  getBonusCandidatePriority,
  getFastBonusProofLevels,
  getBonusRecommendationCandidates,
  getBoundedRecommendationSearchMs,
  getNewBonusDiscoveryCandidates,
  partitionRecommendationCandidates,
  getRequestedBonusUpgradeCandidates,
  getUnsearchedBonusLevels,
  getUnsearchedSetBonusLevels,
  isBonusWitnessImprovement
} from './bonusRecommendation';

describe('bonus recommendation levels', () => {
  it('tries the highest reachable set bonus level first', () => {
    expect(getUnsearchedSetBonusLevels(0, 2)).toEqual([2, 1]);
    expect(getUnsearchedSetBonusLevels(1, 2)).toEqual([2]);
  });

  it('orders every candidate proof from its maximum level downward', () => {
    expect(getUnsearchedBonusLevels(1, 5)).toEqual([5, 4, 3, 2]);
  });

  it('proves the next bonus level first during the bounded fast scan', () => {
    expect(getFastBonusProofLevels(0, 2)).toEqual([1, 2]);
    expect(getFastBonusProofLevels(1, 2)).toEqual([2]);
    expect(getFastBonusProofLevels(2, 2)).toEqual([]);
  });

  it('does not report a witness at a level already required by the search', () => {
    expect(isBonusWitnessImprovement({ currentLevel: 1, resumeLevel: 0 }, 1)).toBe(false);
    expect(isBonusWitnessImprovement({ currentLevel: 1, resumeLevel: 0 }, 2)).toBe(true);
    expect(isBonusWitnessImprovement({ currentLevel: 0, resumeLevel: 1 }, 1)).toBe(false);
  });

  it("prioritizes Lord's Soul, then Set Bonuses, then other Group Skills", () => {
    const candidates = [
      { skillName: 'Master of the Fist', sourceType: 'discover-group-bonus' },
      { skillName: 'Gogmapocalypse', sourceType: 'discover-set-bonus' },
      { skillName: "Lord's Soul", sourceType: 'discover-group-bonus' },
      { skillName: "Gore Magala's Tyranny", sourceType: 'search-set-bonus' }
    ].sort((left, right) =>
      getBonusCandidatePriority(right) - getBonusCandidatePriority(left)
    );

    expect(candidates.map(candidate => candidate.skillName)).toEqual([
      "Lord's Soul",
      'Gogmapocalypse',
      "Gore Magala's Tyranny",
      'Master of the Fist'
    ]);
  });

  it('never sends normal skills into deep bonus exploration', () => {
    const candidates = getBonusRecommendationCandidates({
      skills: { Agitator: 3, Burst: 1, 'Evade Window': 2 },
      setSkills: { 'Existing Set': 1 },
      groupSkills: {},
      priorResults: []
    }, {
      'Existing Set': ['Effect', 2, [2, 4]],
      'Future Set': ['Effect', 2, [2, 4]]
    }, {
      'Future Group': ['Effect', 1, 3]
    });

    expect(candidates.map(candidate => candidate.skillName)).toEqual([
      'Existing Set', 'Future Set', 'Future Group'
    ]);
    expect(candidates.every(candidate => candidate.sourceType.endsWith('bonus'))).toBe(true);
  });

  it('returns no candidates when the maximum is already selected', () => {
    expect(getUnsearchedSetBonusLevels(2, 2)).toEqual([]);
  });

  it('explores a selected set-bonus selector even before its first level is required', () => {
    const candidates = getRequestedBonusUpgradeCandidates({
      setSkills: {},
      groupSkills: {},
      setSkillBonus: "Gore Magala's Tyranny",
      groupSkillBonus: "Lord's Soul"
    }, {
      "Gore Magala's Tyranny": ['Black Eclipse', 2, [2, 4]]
    }, {
      "Lord's Soul": ['Guts (Tenacity)', 1, 3]
    });

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        skillName: "Gore Magala's Tyranny",
        sourceType: 'search-set-bonus',
        currentLevel: 0,
        maxLevel: 2
      }),
      expect.objectContaining({
        skillName: "Lord's Soul",
        sourceType: 'search-group-bonus',
        currentLevel: 0,
        maxLevel: 1
      })
    ]));
  });

  it('continues an explicitly requested set bonus from its current level', () => {
    const candidates = getRequestedBonusUpgradeCandidates({
      setSkills: { "Gore Magala's Tyranny": 1 },
      groupSkills: {},
      setSkillBonus: "Gore Magala's Tyranny"
    }, {
      "Gore Magala's Tyranny": ['Black Eclipse', 2, [2, 4]]
    }, {});

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({ currentLevel: 1, maxLevel: 2 }));
  });

  it('discovers unselected bonuses at level one without repeating proven bonuses', () => {
    const candidates = getNewBonusDiscoveryCandidates({
      setSkills: {},
      groupSkills: {},
      setSkillBonus: "Gore Magala's Tyranny",
      priorResults: [{
        setSkills: { "Blangonga's Spirit": 1 },
        groupSkills: { "Lord's Soul": 1 }
      }]
    }, {
      "Gore Magala's Tyranny": ['Black Eclipse', 2, [2, 4]],
      "Blangonga's Spirit": ['War Cry', 2, [2, 4]],
      Gogmapocalypse: ['Gogmapocalypse', 2, [2, 4]]
    }, {
      "Lord's Soul": ['Guts (Tenacity)', 1, 3],
      'Master of the Fist': ['Satsui No Hado', 1, 3]
    });

    expect(candidates.map(candidate => candidate.skillName)).toEqual([
      'Gogmapocalypse',
      'Master of the Fist'
    ]);
    expect(candidates[0]).toEqual(expect.objectContaining({
      sourceType: 'discover-set-bonus',
      maxLevel: 2,
      maxSearchMs: 1500
    }));
  });

  it('partitions recommendation candidates without loss or overlap', () => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({ skillName: `Skill ${index}` }));
    const partitions = [0, 1, 2].map(workerIndex =>
      partitionRecommendationCandidates(candidates, workerIndex, 3)
    );

    expect(partitions.flat()).toHaveLength(candidates.length);
    expect(new Set(partitions.flat().map(candidate => candidate.skillName)).size).toBe(candidates.length);
  });

  it('turns an unrequested bonus into an exact ordinary fallback search', () => {
    const params = buildCandidateVerificationParams({
      skills: { Agitator: 5 },
      setSkills: { "Gore Magala's Tyranny": 1 },
      groupSkills: { "Lord's Soul": 1 },
      bonusDiscovery: true,
      bonusDiscoverySetNames: ["Jin Dahaad's Revolt", 'Gogmapocalypse'],
      priorResults: [{ id: 'seed' }]
    }, {
      skillName: "Jin Dahaad's Revolt",
      sourceType: 'discover-set-bonus'
    }, 1, 8000);

    expect(params.setSkills).toEqual({
      "Gore Magala's Tyranny": 1,
      "Jin Dahaad's Revolt": 1
    });
    expect(params).toEqual(expect.objectContaining({
      bonusDiscovery: false,
      bonusDiscoverySetNames: [],
      priorResults: [],
      limit: 1,
      findOne: true,
      maxSearchMs: 8000
    }));
  });

  it('rejects normal skills from deep verification', () => {
    expect(() => buildCandidateVerificationParams({
      skills: { Agitator: 3 }, setSkills: {}, groupSkills: {}
    }, {
      skillName: 'Agitator', sourceType: 'skill'
    }, 5, 3000)).toThrow(/only accepts Set Bonuses or Group Skills/);
  });

  it('caps all candidate searches against one exploration deadline', () => {
    expect(getBoundedRecommendationSearchMs(25000, 8000, 10000)).toBe(8000);
    expect(getBoundedRecommendationSearchMs(25000, 8000, 23000)).toBe(2000);
    expect(getBoundedRecommendationSearchMs(25000, 8000, 26000)).toBe(0);
  });
});
