import { getUnsearchedSetBonusLevels } from './bonusRecommendation';

describe('bonus recommendation levels', () => {
  it('tries the highest reachable set bonus level first', () => {
    expect(getUnsearchedSetBonusLevels(0, 2)).toEqual([2, 1]);
    expect(getUnsearchedSetBonusLevels(1, 2)).toEqual([2]);
  });

  it('returns no candidates when the maximum is already selected', () => {
    expect(getUnsearchedSetBonusLevels(2, 2)).toEqual([]);
  });
});
