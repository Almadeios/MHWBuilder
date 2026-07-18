import {
  createBonusExplorationCacheKey, createBonusProgress, summarizeBonusWorkerStats
} from './bonusExplorerState';

describe('bonus explorer state helpers', () => {
  it('creates isolated progress state', () => {
    const first = createBonusProgress();
    const second = createBonusProgress('running');
    first.completed = 2;

    expect(second).toEqual(expect.objectContaining({ completed: 0, status: 'running' }));
  });

  it('uses compact result identities in cache keys', () => {
    const key = createBonusExplorationCacheKey({
      skills: { Burst: 1 },
      priorResults: [
        { id: 'saved-id', largePayload: { ignored: true } },
        { armorNames: ['head', 'chest', 'arms', 'waist', 'legs', 'charm'] }
      ]
    });

    expect(JSON.parse(key).priorResults).toEqual([
      'saved-id', 'head|chest|arms|waist|legs|charm'
    ]);
    expect(key).not.toContain('largePayload');
  });

  it('aggregates worker progress consistently', () => {
    expect(summarizeBonusWorkerStats({
      workers: [{ completed: 2, total: 3 }, { completed: 4, total: 7 }],
      found: 3, timedOut: 1, initial: 20, feasible: 10
    }, 'partial')).toEqual({
      completed: 6, total: 10, found: 3, timedOut: 1,
      initial: 20, feasible: 10, status: 'partial'
    });
  });
});
