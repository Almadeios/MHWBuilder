import { findLocalBonusWitness, findLocalBonusWitnesses } from './bonusNeighborhood';
import { searchAndSpeed } from './logic';
import {
  getNewBonusDiscoveryCandidates, partitionRecommendationCandidates
} from './bonusRecommendation';
import HEAD from '../data/compact/head.json';
import CHEST from '../data/compact/chest.json';
import ARMS from '../data/compact/arms.json';
import WAIST from '../data/compact/waist.json';
import LEGS from '../data/compact/legs.json';
import TALISMANS from '../data/compact/talisman.json';
import SET_SKILLS from '../data/compact/set-skills.json';
import GROUP_SKILLS from '../data/compact/group-skills.json';

const piece = (type, groupSkills = [], setSkills = [], skills = {}, slots = []) => [
  type, skills, groupSkills, slots, 10, [0, 0, 0, 0, 0], 'high', setSkills
];

const baseResult = armorNames => ({
  armorNames: [...armorNames, 'Test Charm'],
  talismanData: {
    'Test Charm': ['talisman', {}, [], [], 0, [0, 0, 0, 0, 0], 'high', [], []]
  }
});

describe('local bonus neighborhood search', () => {
  it('proves a generic Set Bonus by replacing only the required two armor positions', () => {
    const armorData = {
      'Base Head': piece('head'),
      'Base Chest': piece('chest'),
      'Base Arms': piece('arms'),
      'Base Waist': piece('waist'),
      'Base Legs': piece('legs'),
      'Target Head': piece('head', [], ['Future Set']),
      'Target Chest': piece('chest', [], ['Future Set'])
    };
    const witness = findLocalBonusWitness({
      armorData,
      candidate: {
        skillName: 'Future Set', sourceType: 'discover-set-bonus', currentLevel: 0, maxLevel: 2
      },
      decorations: {},
      deadlineAt: performance.now() + 1000,
      params: { skills: {}, setSkills: {}, groupSkills: {}, weaponSlots: [] },
      results: [baseResult([
        'Base Head', 'Base Chest', 'Base Arms', 'Base Waist', 'Base Legs'
      ])],
      talismans: {}
    });

    expect(witness).not.toBeNull();
    expect(witness.armorNames).toEqual(expect.arrayContaining(['Target Head', 'Target Chest']));
    expect(witness.setSkills).toEqual({ 'Future Set': 1 });
  });

  it('supports the four-point Level 2 Set Bonus threshold', () => {
    const armorData = {
      'Base Head': piece('head'),
      'Base Chest': piece('chest'),
      'Base Arms': piece('arms'),
      'Base Waist': piece('waist'),
      'Base Legs': piece('legs'),
      'Target Head': piece('head', [], ['Future Set']),
      'Target Chest': piece('chest', [], ['Future Set']),
      'Target Arms': piece('arms', [], ['Future Set']),
      'Target Waist': piece('waist', [], ['Future Set'])
    };
    const witness = findLocalBonusWitness({
      armorData,
      candidate: {
        skillName: 'Future Set', sourceType: 'discover-set-bonus',
        currentLevel: 0, maxLevel: 2, targetLevel: 2
      },
      decorations: {},
      deadlineAt: performance.now() + 1000,
      params: { skills: {}, setSkills: {}, groupSkills: {}, weaponSlots: [] },
      results: [baseResult([
        'Base Head', 'Base Chest', 'Base Arms', 'Base Waist', 'Base Legs'
      ])],
      talismans: {}
    });

    expect(witness).not.toBeNull();
    expect(witness.setSkills).toEqual({ 'Future Set': 2 });
  });

  it('respects existing bonus requirements while testing nearby Group Skill swaps', () => {
    const armorData = {
      'Base Head': piece('head'),
      'Base Chest': piece('chest'),
      'Base Arms': piece('arms'),
      'Base Waist': piece('waist'),
      'Base Legs': piece('legs'),
      'Target Head': piece('head', ['Future Group']),
      'Target Chest': piece('chest', ['Future Group']),
      'Target Arms': piece('arms', ['Future Group'])
    };
    const witness = findLocalBonusWitness({
      armorData,
      candidate: {
        skillName: 'Future Group', sourceType: 'discover-group-bonus', currentLevel: 0, maxLevel: 1
      },
      decorations: {},
      deadlineAt: performance.now() + 1000,
      params: { skills: {}, setSkills: {}, groupSkills: {}, weaponSlots: [] },
      results: [baseResult([
        'Base Head', 'Base Chest', 'Base Arms', 'Base Waist', 'Base Legs'
      ])],
      talismans: {}
    });

    expect(witness).not.toBeNull();
    expect(witness.groupSkills).toEqual({ 'Future Group': 1 });
  });

  it('checks real returned builds for nearby bonuses within its local time budget', async() => {
    const params = {
      skills: {
        'Critical Boost': 5, Agitator: 5, 'Weakness Exploit': 5,
        'Maximum Might': 3, Antivirus: 3, Burst: 1, 'Adrenaline Rush': 1,
        "Master's Touch": 1, 'Evade Window': 2, 'Offensive Guard': 3
      },
      setSkills: { "Gore Magala's Tyranny": 1 },
      groupSkills: { "Lord's Soul": 1 },
      weaponSlots: [3, 3, 3],
      setSkillBonus: "Gore Magala's Tyranny",
      limit: 100,
      maxSearchMs: 8000
    };
    const response = await searchAndSpeed(params);
    expect(response.results.length).toBeGreaterThan(0);
    const candidates = getNewBonusDiscoveryCandidates({
      ...params, priorResults: response.results
    }, SET_SKILLS, GROUP_SKILLS);
    const witnesses = new Map();
    for (let workerIndex = 0; workerIndex < 3; workerIndex++) {
      const startedAt = performance.now();
      findLocalBonusWitnesses({
        armorData: { ...HEAD, ...CHEST, ...ARMS, ...WAIST, ...LEGS },
        candidates: partitionRecommendationCandidates(candidates, workerIndex, 3),
        deadlineAt: startedAt + 3000,
        params,
        results: response.results,
        talismans: TALISMANS
      }).forEach((result, name) => witnesses.set(name, result));
      expect(performance.now() - startedAt).toBeLessThan(3500);
    }
    expect(witnesses).toBeInstanceOf(Map);
  }, 20000);
});
