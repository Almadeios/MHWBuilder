import { getCompatibleSlotOptions } from './CharmCreator';

describe('Charm Creator slot options', () => {
  it('allows moving from the slotless R7 roll to the W1 R8 roll', () => {
    const options = getCompatibleSlotOptions(
      ['Attack Boost', 'Agitator'],
      '1-1-0',
      '0-0-0'
    );

    expect(options.weaponOptions).toContain('0-0-0');
    expect(options.weaponOptions).toContain('W1-0-0');
  });
});
