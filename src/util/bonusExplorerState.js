export const BONUS_EXPLORATION_WALL_BUDGET_MS = 25000;

export const createBonusProgress = (status = 'idle') => ({
  completed: 0,
  total: 0,
  found: 0,
  timedOut: 0,
  initial: 0,
  feasible: 0,
  proven: 0,
  localProven: 0,
  impossible: 0,
  unresolved: 0,
  budgetExhausted: 0,
  budgetMs: 0,
  mode: 'fast',
  candidates: [],
  status
});

export const expirePendingBonusCandidates = stats => {
  let expired = 0;
  stats.candidates?.forEach((candidate, id) => {
    if (!['queued', 'verifying'].includes(candidate.status)) { return; }
    stats.candidates.set(id, {
      ...candidate,
      status: candidate.level ? 'proven' : 'unresolved',
      maxUnresolved: Boolean(candidate.level),
      reason: 'exploration-budget'
    });
    expired++;
  });
  stats.timedOut = (stats.timedOut || 0) + expired;
  return expired;
};

export const createBonusExplorationCacheKey = params => {
  const cacheParams = { ...params };
  delete cacheParams.recommendationPriorCandidates;
  return JSON.stringify({
    ...cacheParams,
    priorResults: (params.priorResults || []).map(result =>
      result.id || result.armorNames?.join('|'))
  });
};

export const summarizeBonusWorkerStats = (stats, status = 'running') => {
  const candidateValues = stats.candidates?.values?.() || [];
  const candidates = [...candidateValues]
    .sort((left, right) => left.skillName.localeCompare(right.skillName));
  return {
    completed: stats.workers.reduce((total, worker) => total + worker.completed, 0),
    total: stats.workers.reduce((total, worker) => total + worker.total, 0),
    found: stats.found,
    timedOut: stats.timedOut,
    initial: stats.initial,
    feasible: stats.feasible,
    proven: candidates.filter(candidate => candidate.status === 'proven').length,
    localProven: candidates.filter(candidate =>
      candidate.status === 'proven' && candidate.verifiedBy === 'local-armor-swap'
    ).length,
    impossible: candidates.filter(candidate => candidate.status === 'impossible').length,
    unresolved: candidates.filter(candidate =>
      candidate.status === 'unresolved' || candidate.maxUnresolved
    ).length,
    budgetExhausted: candidates.filter(candidate =>
      candidate.reason === 'exploration-budget'
    ).length,
    budgetMs: stats.budgetMs || 0,
    mode: stats.mode || 'fast',
    candidates,
    status
  };
};
