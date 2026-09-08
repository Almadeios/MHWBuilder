import { compareBuildValue, partialBuildValue, socketCapacity } from './buildValue';

const schema = { skillTargets: [2, 2], setTargets: [2], groupTargets: [3] };
const state = overrides => ({
    skillVector: [0, 0], setVector: [0], groupVector: [0], slots: [], weaponSlots: [], ...overrides
});
const value = partial => partialBuildValue(partial, schema, [3, 2]);

it('values requested skill coverage by replacement cost and caps excess levels', () => {
    expect(compareBuildValue(value(state({ skillVector: [2, 0] })),
        value(state({ skillVector: [0, 2] })))).toBeLessThan(0);
    expect(value(state({ skillVector: [9, 0] }))).toEqual(value(state({ skillVector: [2, 0] })));
});

it('prioritizes activated required bonuses and measures partial threshold progress', () => {
    expect(value(state({ setVector: [2], groupVector: [1] })).slice(0, 2)).toEqual([1, 1 + 1 / 3]);
    expect(compareBuildValue(value(state({ setVector: [2] })),
        value(state({ skillVector: [2, 2], setVector: [1] })))).toBeLessThan(0);
    expect(partialBuildValue(state({ setVector: [1] }), { ...schema, setTargets: [1] }, [3, 2])[0]).toBe(1);
});

it('preserves socket size capacity and separates armor from weapon sockets', () => {
    expect(socketCapacity([3])).toEqual([1, 1, 1]);
    expect(socketCapacity([1, 1, 1])).toEqual([0, 0, 3]);
    expect(value(state({ slots: [3] }))).not.toEqual(value(state({ weaponSlots: [3] })));
});
