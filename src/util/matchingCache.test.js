import { buildSearchCacheKey, canDecorationSlotsCoverTotalDeficit } from './logic';

it('preserves uncached capacity decisions across socket types, sizes, and combined jewels', () => {
    const decorations = {
        Small: ['armor', { A: 1 }, 1],
        Large: ['armor', { B: 2 }, 3],
        Combo: ['weapon', { A: 1, B: 1 }, 2]
    };
    const pools = [[], [1], [2, 2], [3, 3], [3, 2, 1]];
    for (const armor of pools) {
        for (const weapon of pools) {
            for (const targetA of [1, 3, 6]) {
                for (const targetB of [1, 3, 6]) {
                    const args = [{ A: 1 }, armor, weapon, { A: targetA, B: targetB }, decorations];
                    expect(canDecorationSlotsCoverTotalDeficit(...args, true))
                        .toBe(canDecorationSlotsCoverTotalDeficit(...args, false));
                }
            }
        }
    }
    expect(canDecorationSlotsCoverTotalDeficit({}, [], [3, 3], { B: 4 }, decorations)).toBe(false);
    expect(canDecorationSlotsCoverTotalDeficit({}, [3, 3], [], { B: 4 }, decorations)).toBe(true);
});

it('isolates diagnostic matching modes in the result cache', () => {
    const params = { skills: { Agitator: 5 } };
    expect(buildSearchCacheKey(params)).not.toBe(buildSearchCacheKey({ ...params, disableMatchingCache: true }));
});
