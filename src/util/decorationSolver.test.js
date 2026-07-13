import { solveDecorationsIndexed } from './decorationSolver';

describe('indexed decoration solver', () => {
  it('uses a dual-skill decoration once to satisfy both deficits', () => {
    const result = solveDecorationsIndexed({
      decorations: {
        Combo: ['armor', { Agitator: 1, Burst: 1 }, 2]
      },
      inventory: { Combo: 1 },
      skillsNeeded: { Agitator: 1, Burst: 1 },
      armorSlots: [2],
      weaponSlots: []
    });

    expect(result).toEqual({
      decoNames: ['Combo'],
      freeSlots: [],
      freeWeaponSlots: []
    });
  });

  it('preserves a larger slot when a smaller compatible slot exists', () => {
    const result = solveDecorationsIndexed({
      decorations: {
        Small: ['armor', { Agitator: 1 }, 1]
      },
      inventory: { Small: 1 },
      skillsNeeded: { Agitator: 1 },
      armorSlots: [3, 1],
      weaponSlots: []
    });

    expect(result.freeSlots).toEqual([3]);
  });

  it('respects finite inventory and armor/weapon slot types', () => {
    const result = solveDecorationsIndexed({
      decorations: {
        ArmorOnly: ['armor', { Burst: 1 }, 1],
        WeaponOnly: ['weapon', { Burst: 1 }, 1]
      },
      inventory: { ArmorOnly: 1, WeaponOnly: 0 },
      skillsNeeded: { Burst: 2 },
      armorSlots: [1],
      weaponSlots: [3]
    });

    expect(result).toBeNull();
  });
});
