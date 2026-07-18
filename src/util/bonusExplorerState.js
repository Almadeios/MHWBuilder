export const createBonusProgress = (status = 'idle') => ({
  completed: 0,
  total: 0,
  found: 0,
  timedOut: 0,
  initial: 0,
  feasible: 0,
  status
});

export const createBonusExplorationCacheKey = params => JSON.stringify({
  ...params,
  priorResults: (params.priorResults || []).map(result =>
    result.id || result.armorNames?.join('|'))
});

export const summarizeBonusWorkerStats = (stats, status = 'running') => ({
  completed: stats.workers.reduce((total, worker) => total + worker.completed, 0),
  total: stats.workers.reduce((total, worker) => total + worker.total, 0),
  found: stats.found,
  timedOut: stats.timedOut,
  initial: stats.initial,
  feasible: stats.feasible,
  status
});
