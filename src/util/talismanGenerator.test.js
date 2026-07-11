import { formatSlots, generateTalismans } from './talismanGenerator';
import { getArmorFromNames } from './util';

describe('talisman slot formatting', () => {
  it('renders slot icons as a compact token list', () => {
    expect(formatSlots([3, 2], [])).toBe('slot3 slot2');
    expect(formatSlots([2], [])).toBe('slot2');
    expect(formatSlots([2, 1], [])).toBe('slot2 slot1');
    expect(formatSlots([], [1])).toBe('W1');
    expect(formatSlots([2], [1])).toBe('slot2 W1');
  });

  it('does not embed slot text into generated charm names', () => {
    const generated = generateTalismans({ 'Fire Attack': 3, Counterstrike: 1, Antivirus: 1 });
    const names = Object.keys(generated);

    expect(names.length).toBeGreaterThan(0);
    expect(names.some(name => name.includes('slot'))).toBe(false);
    expect(names.some(name => name.includes('W1'))).toBe(false);
  });

  it('names rarity 8 generated talismans as Golden Age Charm rolls', () => {
    const generated = generateTalismans({ Artillery: 3, 'Weakness Exploit': 1 });
    const name = 'Golden Age Charm Artillery 3 / Weakness Exploit 1';

    expect(generated[name]).toBeTruthy();
    expect(generated[name][1]).toEqual({ Artillery: 3, 'Weakness Exploit': 1 });
    expect(generated[name][3]).toEqual([1, 1]);
    expect(generated[name][8]).toEqual([1]);
  });

  it('prefers weapon-slot talismans when multiple slot combos are possible', () => {
    const generated = generateTalismans({ 'Fire Attack': 3, Counterstrike: 1, Antivirus: 1 });
    const generatedEntries = Object.values(generated);

    expect(generatedEntries.some(entry => Array.isArray(entry[8]) && entry[8].length > 0)).toBe(true);
  });

  it.each(['Normal Shots', 'Piercing Shots', 'Rapid Fire Up', 'Spread/Power Shots'])(
    'generates legal bowgun talismans containing %s',
    skillName => {
      const generated = generateTalismans({ [skillName]: 1, 'Critical Boost': 5 });
      const rolls = Object.values(generated);

      expect(rolls.some(roll => roll[1]?.[skillName] === 1)).toBe(true);
    }
  );

  it('fills otherwise empty legal positions with useful complementary skills', () => {
    const generated = generateTalismans({ 'Critical Boost': 5 });
    const criticalBoostRolls = Object.values(generated)
      .filter(roll => roll[1]?.['Critical Boost'] === 1);

    expect(criticalBoostRolls.some(roll => Object.keys(roll[1]).length > 1)).toBe(true);
    expect(criticalBoostRolls.some(roll => roll[1]?.['Attack Boost'] === 1)).toBe(true);
  });

  it('uses extra talisman data for slot rendering in results', () => {
    const armor = getArmorFromNames(['Custom Charm'], {
      'Custom Charm': {
        name: 'Custom Charm',
        rarity: 7,
        skills: { 'Fire Attack': 3 },
        slots: [3],
        weaponSlots: []
      }
    });

    expect(armor[0].slots).toEqual([3]);
  });
});
