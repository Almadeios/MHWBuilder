import { _x } from './armorAccessor';

// Independent maxima deliberately overestimate simultaneous bonus coverage.
// Include every unassigned position, including positions in the opposite half.
export const createBonusCapacity = (candidateLists, schema) => Object.fromEntries(
    Object.entries(candidateLists).map(([slot, candidates]) => [slot, {
        joint: [...new Map(candidates.map(([, piece]) => {
            const vector = [
                ...schema.setNames.map(name => Number((_x.setSkills(piece) || []).includes(name))),
                ...schema.groupNames.map(name => Number((_x.groupSkills(piece) || []).includes(name)))
            ];
            return [vector.join(','), vector];
        })).values()],
        set: schema.setNames.map(name => Number(candidates.some(([, piece]) =>
            (_x.setSkills(piece) || []).includes(name)))),
        group: schema.groupNames.map(name => Number(candidates.some(([, piece]) =>
            (_x.groupSkills(piece) || []).includes(name))))
    }])
);

export const remainingBonusCapacity = (capacity, assignedSlots, schema) => {
    const remaining = Object.entries(capacity).filter(([slot]) => !assignedSlots.includes(slot));
    const targets = [...schema.setTargets, ...schema.groupTargets];
    let joint = [targets.map(() => 0)];
    for (const [, value] of remaining) {
        const next = new Map();
        for (const current of joint) {
            for (const contribution of value.joint) {
                const vector = current.map((points, index) => Math.min(targets[index], points + contribution[index]));
                next.set(vector.join(','), vector);
            }
            if (next.size > 4096) { break; }
        }
        // Fall back to independent optimistic bounds when the joint table grows too large.
        if (next.size > 4096) { joint = null; break; }
        joint = [...next.values()];
    }
    return {
        joint,
        set: schema.setNames.map((_, index) => remaining.reduce((sum, [, value]) => sum + value.set[index], 0)),
        group: schema.groupNames.map((_, index) => remaining.reduce((sum, [, value]) => sum + value.group[index], 0))
    };
};

export const canReachRequiredBonuses = (setVector, groupVector, remaining, schema) =>
    schema.setTargets.every((target, index) => setVector[index] + remaining.set[index] >= target) &&
    schema.groupTargets.every((target, index) => groupVector[index] + remaining.group[index] >= target) &&
    (!remaining.joint || remaining.joint.some(vector =>
        schema.setTargets.every((target, index) => setVector[index] + vector[index] >= target) &&
        schema.groupTargets.every((target, index) =>
            groupVector[index] + vector[schema.setTargets.length + index] >= target)
    ));
