import { armorCombo, configureSearchDecorations, reorder, test } from './logic';

const ARMOR_TYPES = ['head', 'chest', 'arms', 'waist', 'legs'];
const LOCAL_REPLACEMENTS_PER_SLOT = 4;
const LOCAL_CANDIDATE_BUDGET_MS = 250;

const contributes = (piece, candidate) => {
  const names = candidate.sourceType.endsWith('set-bonus') ? piece?.[7] : piece?.[2];
  return (names || []).includes(candidate.skillName);
};

const choose = (values, count, start = 0, prefix = [], output = []) => {
  if (prefix.length === count) {
    output.push(prefix);
    return output;
  }
  for (let index = start; index <= values.length - (count - prefix.length); index++) {
    choose(values, count, index + 1, [...prefix, values[index]], output);
  }
  return output;
};

const scoreReplacement = (piece, params) => {
  const skillScore = Object.entries(params.skills || {}).reduce((score, [name, target]) =>
    score + Math.min(target, piece?.[1]?.[name] || 0) * 1000, 0);
  const setScore = Object.keys(params.setSkills || {}).reduce((score, name) =>
    score + ((piece?.[7] || []).includes(name) ? 500 : 0), 0);
  const groupScore = Object.keys(params.groupSkills || {}).reduce((score, name) =>
    score + ((piece?.[2] || []).includes(name) ? 500 : 0), 0);
  const slotScore = (piece?.[3] || []).reduce((score, size) => score + 4 ** size, 0);
  return skillScore + setScore + groupScore + slotScore;
};

const getReplacementLists = (armorData, params, candidate) => {
  const blacklist = new Set(params.blacklistedArmor || []);
  const blacklistedTypes = new Set(params.blacklistedArmorTypes || []);
  const mandatoryByType = {};
  (params.mandatoryArmor || []).forEach(name => {
    const type = armorData[name]?.[0];
    if (type) { mandatoryByType[type] = name; }
  });
  const byType = Object.fromEntries(ARMOR_TYPES.map(type => [type, []]));
  Object.entries(armorData).forEach(([name, piece]) => {
    const type = piece?.[0];
    if (!byType[type] || piece?.[6] !== (params.rank || 'high') || blacklist.has(name) ||
      blacklistedTypes.has(type) || mandatoryByType[type] && mandatoryByType[type] !== name ||
      !contributes(piece, candidate)) {
      return;
    }
    byType[type].push([name, piece]);
  });
  Object.values(byType).forEach(entries => entries.sort((left, right) =>
    scoreReplacement(right[1], params) - scoreReplacement(left[1], params)
  ).splice(LOCAL_REPLACEMENTS_PER_SLOT));
  return byType;
};

const meetsBonusRequirements = (combo, setSkills, groupSkills) =>
  Object.entries(setSkills || {}).every(([name, level]) =>
    (combo.setSkills?.[name] || 0) >= level * 2
  ) && Object.entries(groupSkills || {}).every(([name]) =>
    (combo.groupSkills?.[name] || 0) >= 3
  );

const buildCombo = (pieces, talisman, params) => armorCombo(
  ...pieces.map(([name, data]) => ({ name, data })),
  talisman,
  params.weaponSlots,
  params.setSkillBonus,
  params.groupSkillBonus
);

const visitProducts = (lists, visit, index = 0, selected = []) => {
  if (index === lists.length) { return visit(selected); }
  for (const value of lists[index]) {
    if (visitProducts(lists, visit, index + 1, [...selected, value])) { return true; }
  }
  return false;
};

export const findLocalBonusWitness = ({
  armorData, candidate, decorations, deadlineAt, params, results, talismans
}) => {
  const replacements = getReplacementLists(armorData, params, candidate);
  const candidateSetSkills = candidate.sourceType.endsWith('set-bonus') ? {
    ...params.setSkills,
    [candidate.skillName]: Math.max(
      candidate.targetLevel || 1,
      params.setSkills?.[candidate.skillName] || 0
    )
  } : params.setSkills;
  const candidateGroupSkills = candidate.sourceType.endsWith('group-bonus') ? {
    ...params.groupSkills,
    [candidate.skillName]: 1
  } : params.groupSkills;
  const orderedResults = [...results].sort((left, right) => {
    const field = candidate.sourceType.endsWith('set-bonus') ? 'setSkillPoints' : 'groupSkillPoints';
    return (right[field]?.[candidate.skillName] || 0) - (left[field]?.[candidate.skillName] || 0);
  });

  for (const result of orderedResults) {
    if (performance.now() >= deadlineAt) { return null; }
    const basePieces = result.armorNames?.slice(0, 5).map(name => [name, armorData[name]]);
    const talismanName = result.armorNames?.[5];
    const talismanData = result.talismanData?.[talismanName] || talismans[talismanName];
    if (!basePieces?.every(([, piece]) => piece) || !talismanData) { continue; }
    const talisman = { name: talismanName, data: talismanData };
    const baseCombo = buildCombo(basePieces, talisman, params);
    const pointField = candidate.sourceType.endsWith('set-bonus') ? 'setSkills' : 'groupSkills';
    const requiredPoints = candidate.sourceType.endsWith('set-bonus') ?
      (candidate.targetLevel || 1) * 2 : 3;
    const deficit = Math.max(0, requiredPoints - (baseCombo[pointField]?.[candidate.skillName] || 0));
    if (deficit === 0 && meetsBonusRequirements(baseCombo, candidateSetSkills, candidateGroupSkills)) {
      const existing = test(baseCombo, decorations, params.skills, params);
      if (existing) { return reorder([existing])[0]; }
    }
    const replaceable = ARMOR_TYPES.map((type, index) => ({ type, index }))
      .filter(({ index }) => !contributes(basePieces[index][1], candidate));
    for (let swapCount = Math.max(1, deficit); swapCount <= Math.min(4, deficit + 1); swapCount++) {
      for (const positions of choose(replaceable, swapCount)) {
        if (performance.now() >= deadlineAt) { return null; }
        const lists = positions.map(({ type }) => replacements[type]);
        if (lists.some(list => !list.length)) { continue; }
        let witness = null;
        visitProducts(lists, selected => {
          if (performance.now() >= deadlineAt) { return true; }
          const pieces = basePieces.map(piece => [...piece]);
          positions.forEach(({ index }, selectedIndex) => { pieces[index] = selected[selectedIndex]; });
          const combo = buildCombo(pieces, talisman, params);
          if (!meetsBonusRequirements(combo, candidateSetSkills, candidateGroupSkills)) { return false; }
          const tested = test(combo, decorations, params.skills, params);
          if (!tested) { return false; }
          witness = reorder([tested])[0];
          return true;
        });
        if (witness) { return witness; }
      }
    }
  }
  return null;
};

export const findLocalBonusWitnesses = ({
  armorData, candidates, deadlineAt, params, results, talismans
}) => {
  const decorations = configureSearchDecorations(params);
  const witnesses = new Map();
  for (const candidate of candidates) {
    if (performance.now() >= deadlineAt) { break; }
    const candidateDeadline = Math.min(
      deadlineAt, performance.now() + LOCAL_CANDIDATE_BUDGET_MS
    );
    let best = null;
    const maxLevel = Math.max(1, Number(candidate.maxLevel) || 1);
    for (let level = maxLevel; level >= 1; level--) {
      if (performance.now() >= candidateDeadline) { break; }
      const result = findLocalBonusWitness({
        armorData,
        candidate: { ...candidate, targetLevel: level },
        decorations,
        deadlineAt: candidateDeadline,
        params,
        results,
        talismans
      });
      if (result) {
        best = { level, result };
        break;
      }
    }
    if (best) { witnesses.set(candidate.skillName, best); }
  }
  return witnesses;
};
