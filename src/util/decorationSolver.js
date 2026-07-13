const toSlotCounts = slots => {
  const counts = [0, 0, 0, 0];
  (slots || []).forEach(size => {
    if (size >= 1 && size <= 3) { counts[size]++; }
  });
  return counts;
};

const fromSlotCounts = counts => {
  const slots = [];
  for (let size = 1; size <= 3; size++) {
    for (let amount = 0; amount < counts[size]; amount++) { slots.push(size); }
  }
  return slots;
};

const hasCompatibleSlot = (slotCounts, minimumSize) => {
  for (let size = minimumSize; size <= 3; size++) {
    if (slotCounts[size] > 0) { return true; }
  }
  return false;
};

const getStateKey = (needs, armorSlots, weaponSlots, usedCounts, finiteIndexes) => {
  const finiteCounts = finiteIndexes.map(index => usedCounts[index]).join(',');
  return `${needs.join(',')}|a${armorSlots.slice(1).join(',')}|` +
    `w${weaponSlots.slice(1).join(',')}|i${finiteCounts}`;
};

export const solveDecorationsIndexed = ({
  decorations,
  inventory,
  skillsNeeded,
  armorSlots,
  weaponSlots,
  startingUsedCounts = {},
  isBlocked = () => false
}) => {
  const skillNames = Object.entries(skillsNeeded || {})
    .filter(([, level]) => level > 0)
    .map(([skillName]) => skillName);
  if (!skillNames.length) {
    return { decoNames: [], freeSlots: armorSlots || [], freeWeaponSlots: weaponSlots || [] };
  }

  const initialArmorSlots = toSlotCounts(armorSlots);
  const initialWeaponSlots = toSlotCounts(weaponSlots);
  const maxDepth = (armorSlots?.length || 0) + (weaponSlots?.length || 0);
  const candidates = Object.entries(decorations || {}).flatMap(([name, data]) => {
    const [type, decoSkills, size] = data;
    const contributions = skillNames.map(skillName => decoSkills?.[skillName] || 0);
    const limit = Math.max(0, Number(inventory?.[name] || 0));
    const slots = type === 'weapon' ? initialWeaponSlots : initialArmorSlots;
    if (!limit || !contributions.some(Boolean) || !hasCompatibleSlot(slots, size) ||
      isBlocked(decoSkills)) {
      return [];
    }
    return [{ name, type, size, contributions, limit }];
  });
  if (!candidates.length) { return null; }

  const initialNeeds = skillNames.map(skillName => skillsNeeded[skillName]);
  const initialUsedCounts = candidates.map(candidate => startingUsedCounts[candidate.name] || 0);
  const finiteIndexes = candidates.flatMap((candidate, index) =>
    candidate.limit < maxDepth ? [index] : []
  );
  const memo = new Set();

  const visit = (needs, armorSlotCounts, weaponSlotCounts, usedCounts, usedNames, depth) => {
    if (needs.every(level => level <= 0)) {
      return {
        decoNames: usedNames,
        freeSlots: fromSlotCounts(armorSlotCounts),
        freeWeaponSlots: fromSlotCounts(weaponSlotCounts)
      };
    }
    if (depth >= maxDepth) { return null; }

    const stateKey = getStateKey(
      needs, armorSlotCounts, weaponSlotCounts, usedCounts, finiteIndexes
    );
    if (memo.has(stateKey)) { return null; }
    memo.add(stateKey);

    let targetSkillIndex = -1;
    let fewestOptions = Number.POSITIVE_INFINITY;
    for (let skillIndex = 0; skillIndex < needs.length; skillIndex++) {
      if (needs[skillIndex] <= 0) { continue; }
      const options = candidates.reduce((total, candidate, candidateIndex) => {
        if (!candidate.contributions[skillIndex] || usedCounts[candidateIndex] >= candidate.limit) {
          return total;
        }
        const slots = candidate.type === 'weapon' ? weaponSlotCounts : armorSlotCounts;
        return total + (hasCompatibleSlot(slots, candidate.size) ? 1 : 0);
      }, 0);
      if (options < fewestOptions) {
        fewestOptions = options;
        targetSkillIndex = skillIndex;
      }
    }
    if (targetSkillIndex < 0 || fewestOptions === 0) { return null; }

    const orderedCandidates = candidates
      .map((candidate, index) => ({
        candidate,
        index,
        usefulPoints: candidate.contributions.reduce(
          (total, level, skillIndex) => total + Math.min(level, Math.max(0, needs[skillIndex])), 0
        )
      }))
      .filter(({ candidate, index, usefulPoints }) => usefulPoints > 0 &&
        candidate.contributions[targetSkillIndex] > 0 && usedCounts[index] < candidate.limit)
      .sort((a, b) => b.usefulPoints - a.usefulPoints ||
        a.candidate.size - b.candidate.size);

    for (const { candidate, index } of orderedCandidates) {
      const sourceSlots = candidate.type === 'weapon' ? weaponSlotCounts : armorSlotCounts;
      for (let slotSize = candidate.size; slotSize <= 3; slotSize++) {
        if (!sourceSlots[slotSize]) { continue; }
        const nextArmorSlots = armorSlotCounts.slice();
        const nextWeaponSlots = weaponSlotCounts.slice();
        const nextSlots = candidate.type === 'weapon' ? nextWeaponSlots : nextArmorSlots;
        nextSlots[slotSize]--;
        const nextNeeds = needs.map((level, skillIndex) =>
          Math.max(0, level - candidate.contributions[skillIndex])
        );
        const nextUsedCounts = usedCounts.slice();
        nextUsedCounts[index]++;
        const result = visit(
          nextNeeds,
          nextArmorSlots,
          nextWeaponSlots,
          nextUsedCounts,
          [...usedNames, candidate.name],
          depth + 1
        );
        if (result) { return result; }
      }
    }
    return null;
  };

  return visit(
    initialNeeds,
    initialArmorSlots,
    initialWeaponSlots,
    initialUsedCounts,
    [],
    0
  );
};
