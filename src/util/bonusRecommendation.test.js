import {
  getNewBonusDiscoveryCandidates,
  partitionRecommendationCandidates,
  getRequestedBonusUpgradeCandidates,
  getUnsearchedSetBonusLevels
} from './bonusRecommendation';

describe('bonus recommendation levels', () => {
  it('tries the highest reachable set bonus level first', () => {
    expect(getUnsearchedSetBonusLevels(0, 2)).toEqual([2, 1]);
    expect(getUnsearchedSetBonusLevels(1, 2)).toEqual([2]);
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
});
