import { buildMitmHalf } from './logic';
import { createBonusCapacity, remainingBonusCapacity, canReachRequiredBonuses } from './bonusReachability';

const piece = (slot, set, group, skill) => [slot, { Test: skill }, group ? ['Group'] : [],
    [1], 10, [], 'high', set ? ['Set'] : []];
const candidates = Object.fromEntries(['head', 'chest', 'waist', 'legs'].map(slot => [slot, [
    [`${slot}-set`, piece(slot, true, false, 1)],
    [`${slot}-group`, piece(slot, false, true, 2)],
    [`${slot}-neither`, piece(slot, false, false, 3)]
]]));
const schemaFor = (setTarget, groupTarget) => ({
    skillNames: ['Test'], skillTargets: [20], skillIndex: new Map([['Test', 0]]),
    setNames: ['Set'], setTargets: [setTarget], setIndex: new Map([['Set', 0]]),
    groupNames: ['Group'], groupTargets: [groupTarget], groupIndex: new Map([['Group', 0]]),
    preserveBonusDiversity: false
});

it('includes opposite-half support and accounts for already-adjusted +1 thresholds', () => {
    const schema = schemaFor(2, 1);
    const capacity = createBonusCapacity(candidates, schema);
    const remaining = remainingBonusCapacity(capacity, ['head', 'chest'], schema);
    expect(canReachRequiredBonuses([0], [0], remaining, schema)).toBe(false);
    expect(canReachRequiredBonuses([1], [0], remaining, schema)).toBe(true);
    expect(canReachRequiredBonuses([0], [0], { set: [1], group: [1] }, schema)).toBe(false);
    expect(canReachRequiredBonuses([0], [0], { set: [1], group: [1] }, schemaFor(1, 1))).toBe(true);
});

it('preserves every feasible compacted full combination across exhaustive small searches', async() => {
    const counts = { pruned: 0 };
    for (const setTarget of [1, 2, 3, 4]) {
        for (const groupTarget of [0, 1, 2, 3]) {
            const schema = schemaFor(setTarget, groupTarget);
            const run = async prune => {
                const runSchema = { ...schema,
                    bonusCapacity: prune ? createBonusCapacity(candidates, schema) : null };
                const profile = { nodes: 0 };
                const left = await buildMitmHalf(['head', 'chest'], candidates, runSchema, null, profile);
                const right = await buildMitmHalf(['waist', 'legs'], candidates, runSchema, null, profile);
                counts.pruned += profile.bonusReachabilityPruned || 0;
                return left.flatMap(a => right.filter(b =>
                    a.setVector[0] + b.setVector[0] >= setTarget &&
                    a.groupVector[0] + b.groupVector[0] >= groupTarget
                ).map(b => [...Object.values(a.pieces), ...Object.values(b.pieces)]
                    .map(([name]) => name).sort().join('|'))).sort();
            };
            expect(await run(true)).toEqual(await run(false));
        }
    }
    expect(counts.pruned).toBeGreaterThan(0);
});
