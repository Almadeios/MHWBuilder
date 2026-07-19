import {
  createBonusExplorationCacheKey, createBonusProgress, expirePendingBonusCandidates,
  summarizeBonusWorkerStats
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
      found: 3, timedOut: 1, initial: 20, feasible: 10,
      budgetMs: 25000,
      candidates: new Map([
        ['set:one', { skillName: 'One', status: 'proven' }],
        ['set:two', { skillName: 'Two', status: 'impossible' }],
        ['set:three', {
          skillName: 'Three', status: 'unresolved', reason: 'exploration-budget'
        }]
      ])
    }, 'partial')).toEqual({
      completed: 6, total: 10, found: 3, timedOut: 1,
      initial: 20, feasible: 10, proven: 1, localProven: 0, impossible: 1, unresolved: 1,
      budgetExhausted: 1, budgetMs: 25000,
      mode: 'fast',
      candidates: [
        { skillName: 'One', status: 'proven' },
        { skillName: 'Three', status: 'unresolved', reason: 'exploration-budget' },
        { skillName: 'Two', status: 'impossible' }
      ],
      status: 'partial'
    });
  });

  it('marks only queued or verifying candidates unresolved at the hard deadline', () => {
    const stats = {
      timedOut: 0,
      candidates: new Map([
        ['queued', { skillName: 'Queued', status: 'queued' }],
        ['verifying', { skillName: 'Verifying', status: 'verifying', level: 1 }],
        ['proven', { skillName: 'Proven', status: 'proven', level: 1 }]
      ])
    };

    expect(expirePendingBonusCandidates(stats)).toBe(2);
    expect(stats.candidates.get('queued')).toEqual(expect.objectContaining({
      status: 'unresolved', reason: 'exploration-budget'
    }));
    expect(stats.candidates.get('verifying')).toEqual(expect.objectContaining({
      status: 'proven', maxUnresolved: true, reason: 'exploration-budget'
    }));
    expect(stats.candidates.get('proven')).toEqual({
      skillName: 'Proven', status: 'proven', level: 1
    });
  });
});
