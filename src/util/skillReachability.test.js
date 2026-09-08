import { buildMitmHalf } from './logic';
import { createSkillCapacity, remainingSkillCapacity, canReachRequiredSkills } from './skillReachability';

const decos = {
    Combo: ['armor', { A: 1, B: 1 }, 2],
    Small: ['armor', { A: 1 }, 1],
    Weapon: ['weapon', { B: 2 }, 2]
};
const candidates = Object.fromEntries(['head', 'chest'].map(slot => [slot, [
    [`${slot}-a`, [slot, { A: 1 }, [], [1], 0, [], 'high', []]],
    [`${slot}-b`, [slot, { B: 1 }, [], [2], 0, [], 'high', []]],
    [`${slot}-empty`, [slot, {}, [], [], 0, [], 'high', []]]
]]));

const canFill = (skills, slots, target, used = {}) => {
    if (skills.A >= target[0] && skills.B >= target[1]) { return true; }
    if (!slots.length) { return false; }
    const [[type, size], ...rest] = slots;
    return canFill(skills, rest, target, used) || Object.entries(decos).some(([name, [decoType, bonus, needed]]) =>
        type === decoType && size >= needed && !used[name] && canFill(
            { A: skills.A + (bonus.A || 0), B: skills.B + (bonus.B || 0) }, rest, target, { ...used, [name]: 1 }
        )
    );
};

it('keeps all exhaustive feasible builds including mixed jewels, limited inventory and weapon slots', async() => {
    for (const target of [[1, 1], [2, 3], [3, 4], [5, 5]]) {
        const schema = {
            skillNames: ['A', 'B'], skillTargets: target, skillIndex: new Map([['A', 0], ['B', 1]]),
            setNames: [], setTargets: [], setIndex: new Map(),
            groupNames: [], groupTargets: [], groupIndex: new Map(), preserveBonusDiversity: false
        };
        const capacity = createSkillCapacity(candidates, schema.skillNames, decos, [2], target);
        const run = async enabled => {
            const context = { ...schema, skillCapacity: enabled ? capacity : null };
            const profile = { nodes: 0 };
            const left = await buildMitmHalf(['head'], candidates, context, null, profile);
            const right = await buildMitmHalf(['chest'], candidates, context, null, profile);
            return left.flatMap(a => right.flatMap(b => {
                const entries = [...Object.values(a.pieces), ...Object.values(b.pieces)];
                const skills = entries.reduce((sum, [, piece]) => ({
                    A: sum.A + (piece[1].A || 0), B: sum.B + (piece[1].B || 0)
                }), { A: 0, B: 0 });
                const slots = entries.flatMap(([, piece]) => piece[3].map(size => ['armor', size])).concat([['weapon', 2]]);
                return canFill(skills, slots, target) ? [entries.map(([name]) => name).join('|')] : [];
            })).sort();
        };
        expect(await run(true)).toEqual(await run(false));
    }
});

it('does not use armor jewels in weapon slots and includes opposite-half capacity', () => {
    const capacity = createSkillCapacity(candidates, ['A', 'B'], decos, [2], [2, 3]);
    expect(capacity.weapon).toEqual([0, 2, 2]);
    const remaining = remainingSkillCapacity(capacity, ['head']);
    expect(canReachRequiredSkills([0, 0, 0], [0, 0, 0], remaining, [2, 3, 5])).toBe(true);
    expect(canReachRequiredSkills([0, 0, 0], [0, 0, 0], remaining, [9, 3, 12])).toBe(false);
});
