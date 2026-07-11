import {
  getCustomTalismanKey,
  MAX_CUSTOM_TALISMANS,
  MAX_TALISMAN_NAME_LENGTH,
  normalizeCustomTalismans
} from './customTalismans';
import SKILLS from '../data/compact/skills.json';

const charm = (id, overrides = {}) => ({
  id,
  name: 'Valid charm',
  skills: { Agitator: 1 },
  slots: [3],
  weaponSlots: [],
  ...overrides
});

describe('custom talisman storage safety', () => {
  it('limits names, entries, slots, levels, and removes duplicate rolls', () => {
    const data = [
      charm('first', { name: 'x'.repeat(100), skills: { Agitator: 999 }, slots: [9, 3] }),
      charm('duplicate', { skills: { Agitator: 7 }, slots: [3] }),
      ...Object.keys(SKILLS).slice(0, 150).map((skillName, index) => charm(`extra-${index}`, {
        skills: { [skillName]: 1 }
      }))
    ];

    const result = normalizeCustomTalismans(data);
    expect(result).toHaveLength(MAX_CUSTOM_TALISMANS);
    expect(result[0].name).toHaveLength(MAX_TALISMAN_NAME_LENGTH);
    expect(result[0].skills.Agitator).toBe(7);
    expect(result[0].slots).toEqual([3]);
  });

  it('rejects malformed entries and creates stable duplicate keys', () => {
    expect(normalizeCustomTalismans([null, '<script>', { skills: { Unknown: 1 } }])).toEqual([]);
    expect(getCustomTalismanKey(charm('one'))).toBe(getCustomTalismanKey(charm('two')));
  });
});
