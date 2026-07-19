import { buildBonusFeasibilityIndex } from './bonusFeasibility';

const piece = (type, groupSkills = [], setSkills = [], rank = 'high') => [
  type, {}, groupSkills, [], 0, [0, 0, 0, 0, 0], rank, setSkills
];

describe('bonus feasibility index', () => {
  it('rejects a set bonus when filters leave fewer than two contributing parts', () => {
    const armor = {
      Head: piece('head', [], ['Gogmapocalypse']),
      Chest: piece('chest', [], ['Gogmapocalypse']),
      Arms: piece('arms')
    };
    const [candidate] = buildBonusFeasibilityIndex(armor, {
      blacklistedArmor: ['Chest']
    }, [{
      skillName: 'Gogmapocalypse',
      sourceType: 'discover-set-bonus',
      maxLevel: 1
    }]);

    expect(candidate).toEqual(expect.objectContaining({
      requiredPoints: 2,
      reachablePoints: 1,
      contributorPieceCount: 1,
      feasibleByArmorCount: false
    }));
  });

  it('applies a matching +1 selector to the required set pieces', () => {
    const armor = { Head: piece('head', [], ["Gore Magala's Tyranny"]) };
    const [candidate] = buildBonusFeasibilityIndex(armor, {
      setSkillBonus: "Gore Magala's Tyranny"
    }, [{
      skillName: "Gore Magala's Tyranny",
      sourceType: 'search-set-bonus',
      maxLevel: 1
    }]);

    expect(candidate.requiredPoints).toBe(1);
    expect(candidate.feasibleByArmorCount).toBe(true);
  });

  it('requires three available parts for a group skill', () => {
    const armor = {
      Head: piece('head', ["Lord's Soul"]),
      Chest: piece('chest', ["Lord's Soul"])
    };
    const [candidate] = buildBonusFeasibilityIndex(armor, {}, [{
      skillName: "Lord's Soul",
      sourceType: 'discover-group-bonus',
      maxLevel: 1
    }]);

    expect(candidate.requiredPoints).toBe(3);
    expect(candidate.contributorPieceCount).toBe(2);
    expect(candidate.feasibleByArmorCount).toBe(false);
  });

  it('keeps a level-one set recommendation even when level two is unreachable', () => {
    const armor = {
      Head: piece('head', [], ['Gogmapocalypse']),
      Chest: piece('chest', [], ['Gogmapocalypse'])
    };
    const [candidate] = buildBonusFeasibilityIndex(armor, {}, [{
      skillName: 'Gogmapocalypse',
      sourceType: 'search-set-bonus',
      currentLevel: 0,
      maxLevel: 2
    }]);

    expect(candidate.requiredPoints).toBe(2);
    expect(candidate.feasibleByArmorCount).toBe(true);
  });
});
