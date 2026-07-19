export const getUnsearchedBonusLevels = (currentLevel, maxLevel) => {
  const current = Math.max(0, Number(currentLevel) || 0);
  const max = Math.max(current, Number(maxLevel) || 0);
  return Array.from({ length: max - current }, (_, index) => max - index);
};

export const getUnsearchedSetBonusLevels = getUnsearchedBonusLevels;

export const getFastBonusProofLevels = (currentLevel, maxLevel) => {
  const current = Math.max(0, Number(currentLevel) || 0);
  const max = Math.max(current, Number(maxLevel) || 0);
  if (current >= max) { return []; }
  const next = current + 1;
  return [next, ...getUnsearchedBonusLevels(next, max)];
};

export const isBonusWitnessImprovement = (candidate, witnessLevel) =>
  Number(witnessLevel || 0) > Math.max(
    Number(candidate?.currentLevel || 0),
    Number(candidate?.resumeLevel || 0)
  );

const PRIORITY_GROUP_SKILLS = new Set(["Lord's Soul"]);

export const getBonusCandidatePriority = candidate => {
  if (candidate?.sourceType?.endsWith('group-bonus') &&
    PRIORITY_GROUP_SKILLS.has(candidate.skillName)) {
    return 3;
  }
  if (candidate?.sourceType?.endsWith('set-bonus')) { return 2; }
  if (candidate?.sourceType?.endsWith('group-bonus')) { return 1; }
  return 0;
};

const getRequestedBonusNames = (selectedBonuses, selectorBonus) => Array.from(new Set([
  ...Object.keys(selectedBonuses || {}),
  ...selectorBonus ? [selectorBonus] : []
]));

export const getRequestedBonusUpgradeCandidates = (params, setSkillDb, groupSkillDb) => {
  const makeCandidates = (names, selectedLevels, database, sourceType, score) => names.flatMap(skillName => {
    const currentLevel = Number(selectedLevels?.[skillName] || 0);
    const maxLevel = Number(database?.[skillName]?.[1] || currentLevel);
    if (!database?.[skillName] || currentLevel >= maxLevel) { return []; }

    return [{ skillName, sourceType, currentLevel, maxLevel, score }];
  });

  const setCandidates = makeCandidates(
    getRequestedBonusNames(params.setSkills, params.setSkillBonus),
    params.setSkills,
    setSkillDb,
    'search-set-bonus',
    3000000
  );
  const groupCandidates = makeCandidates(
    getRequestedBonusNames(params.groupSkills, params.groupSkillBonus),
    params.groupSkills,
    groupSkillDb,
    'search-group-bonus',
    2900000
  );
  return [...setCandidates, ...groupCandidates];
};

const getKnownResultBonuses = (results, field) => new Set((results || []).flatMap(result =>
  Object.entries(result?.[field] || {})
    .filter(([, level]) => Number(level) > 0)
    .map(([skillName]) => skillName)
));

export const getNewBonusDiscoveryCandidates = (params, setSkillDb, groupSkillDb) => {
  const requestedSetNames = new Set(getRequestedBonusNames(params.setSkills, params.setSkillBonus));
  const requestedGroupNames = new Set(getRequestedBonusNames(params.groupSkills, params.groupSkillBonus));
  const knownSetNames = getKnownResultBonuses(params.priorResults, 'setSkills');
  const knownGroupNames = getKnownResultBonuses(params.priorResults, 'groupSkills');
  const makeCandidates = (database, excludedNames, knownNames, sourceType, score) =>
    Object.keys(database || {}).flatMap(skillName => {
      if (excludedNames.has(skillName) || knownNames.has(skillName)) { return []; }
      const maxLevel = sourceType === 'discover-set-bonus' ?
        Number(database[skillName]?.[1] || 1) : 1;
      return [{
        skillName,
        sourceType,
        currentLevel: 0,
        maxLevel,
        score,
        maxSearchMs: 1500
      }];
    });

  return [
    ...makeCandidates(setSkillDb, requestedSetNames, knownSetNames, 'discover-set-bonus', 2500000),
    ...makeCandidates(groupSkillDb, requestedGroupNames, knownGroupNames, 'discover-group-bonus', 1500000)
  ];
};

export const getBonusRecommendationCandidates = (params, setSkillDb, groupSkillDb) => [
  ...getRequestedBonusUpgradeCandidates(params, setSkillDb, groupSkillDb),
  ...getNewBonusDiscoveryCandidates(params, setSkillDb, groupSkillDb)
];

export const partitionRecommendationCandidates = (candidates, workerIndex, workerCount) => {
  const count = Math.max(1, Number(workerCount) || 1);
  const index = Math.max(0, Number(workerIndex) || 0) % count;
  return (candidates || []).filter((_, candidateIndex) => candidateIndex % count === index);
};

export const buildCandidateVerificationParams = (params, candidate, level, maxSearchMs) => {
  const skills = { ...params.skills };
  const setSkills = { ...params.setSkills };
  const groupSkills = { ...params.groupSkills };
  if (candidate.sourceType.endsWith('set-bonus')) {
    setSkills[candidate.skillName] = level;
  } else if (candidate.sourceType.endsWith('group-bonus')) {
    groupSkills[candidate.skillName] = level;
  } else {
    throw new Error('Deep recommendation verification only accepts Set Bonuses or Group Skills.');
  }

  return {
    ...params,
    skills,
    setSkills,
    groupSkills,
    bonusDiscovery: false,
    bonusDiscoverySetNames: [],
    bonusDiscoveryGroupNames: [],
    bonusDiscoveryTargetType: '',
    bonusDiscoveryTargetName: '',
    bonusDiscoveryTargetLevel: 0,
    priorResults: [],
    limit: 1,
    findOne: true,
    maxSearchMs
  };
};

export const getBoundedRecommendationSearchMs = (deadlineAt, requestedMs, now = performance.now()) =>
  Math.max(0, Math.min(requestedMs, deadlineAt - now));
