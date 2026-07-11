export const getUnsearchedSetBonusLevels = (currentLevel, maxLevel) => {
  const current = Math.max(0, Number(currentLevel) || 0);
  const max = Math.max(current, Number(maxLevel) || 0);
  return Array.from({ length: max - current }, (_, index) => max - index);
};
