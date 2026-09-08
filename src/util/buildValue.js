// Ordering heuristics only: these values must never be used to prove dominance.
export const socketCapacity = slots => [3, 2, 1].map(size =>
    (slots || []).filter(slot => slot >= size).length
);

export const compareBuildValue = (left, right) => {
    for (let index = 0; index < left.length; index++) {
        const difference = right[index] - left[index];
        if (difference) { return difference; }
    }
    return 0;
};

export const partialBuildValue = (state, schema, replacementCosts) => {
    let completed = 0;
    let progress = 0;
    for (const [points, targets] of [
        [state.setVector, schema.setTargets], [state.groupVector, schema.groupTargets]
    ]) {
        for (let index = 0; index < targets.length; index++) {
            const target = targets[index];
            if (target <= 0) { continue; }
            const covered = Math.min(points[index] || 0, target);
            completed += Number(covered === target);
            progress += covered / target;
        }
    }
    const savings = schema.skillTargets.reduce((total, target, index) =>
        total + Math.min(state.skillVector[index] || 0, target) * replacementCosts[index], 0
    );
    // Keep weapon and armor capacity distinct. This is a traversal preference,
    // not a claim that a weapon socket can replace an armor socket.
    return [completed, progress, savings,
        ...socketCapacity(state.weaponSlots), ...socketCapacity(state.slots)];
};
