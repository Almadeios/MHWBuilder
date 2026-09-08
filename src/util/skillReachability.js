import { _x } from './armorAccessor';

// Unlimited copies and independent per-skill maxima are intentional: these are
// upper bounds, not a decoration assignment or an inventory feasibility proof.
export const createSkillCapacity = (candidateLists, skillNames, decorations, weaponSlots = [], skillTargets = []) => {
    const subsets = skillNames.map(name => [name]);
    if (skillNames.length > 1) { subsets.push(skillNames); }
    const targetsByName = Object.fromEntries(skillNames.map((name, index) => [name, skillTargets[index] ?? Infinity]));
    const targets = subsets.map(names => names.reduce((sum, name) => sum + targetsByName[name], 0));
    const tables = Object.fromEntries(['armor', 'weapon'].map(type => [type,
        [0, 1, 2, 3].map(size => subsets.map(names => Object.values(decorations).reduce(
            (best, [decoType, skills, requiredSize]) => decoType === type && requiredSize <= size ?
                Math.max(best, names.reduce((sum, name) => sum + Math.min(skills[name] || 0, targetsByName[name]), 0)) : best, 0
        )))
    ]));
    const context = { skillNames, subsets, targetsByName, targets, tables };
    const remainingBySlot = Object.fromEntries(Object.entries(candidateLists).map(([slot, entries]) => {
        const contributions = entries.map(([, piece]) => pieceSkillCapacity(piece, context));
        return [slot, subsets.map((_, index) => Math.max(0, ...contributions.map(values => values[index])))];
    }));
    return { ...context, remainingBySlot,
        weapon: socketSkillCapacity(weaponSlots, 'weapon', context) };
};

export const socketSkillCapacity = (slots, type, context) => context.subsets.map((_, index) =>
    (slots || []).reduce((total, size) => total + (context.tables[type][size]?.[index] || 0), 0)
);

export const pieceSkillCapacity = (piece, context) => {
    const armor = socketSkillCapacity(_x.slots(piece), 'armor', context);
    const weapon = socketSkillCapacity(_x.weaponSlots(piece), 'weapon', context);
    return context.subsets.map((names, index) => names.reduce((sum, name) =>
        sum + Math.min(_x.skills(piece)?.[name] || 0, context.targetsByName[name]), 0) + armor[index] + weapon[index]);
};

export const remainingSkillCapacity = (context, assignedSlots) => context.subsets.map((_, index) =>
    context.weapon[index] + Object.entries(context.remainingBySlot).reduce(
        (total, [slot, values]) => total + (assignedSlots.includes(slot) ? 0 : values[index]), 0
    )
);

export const canReachRequiredSkills = (current, addition, remaining, targets) => targets.every(
    (target, index) => current[index] + addition[index] + remaining[index] >= target
);
