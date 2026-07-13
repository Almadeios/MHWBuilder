const ARMOR_TYPES = ['head', 'chest', 'arms', 'waist', 'legs'];

const getAllowedPiecesByType = (armorData, params) => {
  const mandatoryByType = {};
  (params.mandatoryArmor || []).forEach(name => {
    const piece = armorData[name];
    if (piece && ARMOR_TYPES.includes(piece[0])) { mandatoryByType[piece[0]] = name; }
  });
  const blacklistedNames = new Set(params.blacklistedArmor || []);
  const blacklistedTypes = new Set(params.blacklistedArmorTypes || []);
  const rank = params.rank || 'high';
  const result = Object.fromEntries(ARMOR_TYPES.map(type => [type, []]));

  Object.entries(armorData || {}).forEach(([name, piece]) => {
    const type = piece?.[0];
    if (!ARMOR_TYPES.includes(type) || blacklistedTypes.has(type) ||
      blacklistedNames.has(name) || piece?.[6] !== rank ||
      mandatoryByType[type] && mandatoryByType[type] !== name) {
      return;
    }
    result[type].push(piece);
  });
  return result;
};

export const buildBonusFeasibilityIndex = (armorData, params, candidates) => {
  const allowedByType = getAllowedPiecesByType(armorData, params);
  return (candidates || []).map(candidate => {
    if (!candidate.sourceType.endsWith('set-bonus') &&
      !candidate.sourceType.endsWith('group-bonus')) {
      return { ...candidate, feasibleByArmorCount: true };
    }
    const isSetBonus = candidate.sourceType.endsWith('set-bonus');
    const dataIndex = isSetBonus ? 7 : 2;
    const selectorBonus = isSetBonus ? params.setSkillBonus : params.groupSkillBonus;
    const selectorPoint = selectorBonus === candidate.skillName ? 1 : 0;
    const nextLevel = Math.max(1, Number(candidate.currentLevel || 0) + 1);
    const requiredPoints = Math.max(
      0,
      (isSetBonus ? nextLevel * 2 : 3) - selectorPoint
    );
    const reachablePoints = ARMOR_TYPES.reduce((total, type) => total + (
      allowedByType[type].some(piece => (piece?.[dataIndex] || []).includes(candidate.skillName)) ? 1 : 0
    ), 0);
    return {
      ...candidate,
      requiredPoints,
      reachablePoints,
      feasibleByArmorCount: reachablePoints >= requiredPoints
    };
  });
};
