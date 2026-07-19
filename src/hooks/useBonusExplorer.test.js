import { act, renderHook } from '@testing-library/react';
import { useBonusExplorer } from './useBonusExplorer';

describe('useBonusExplorer', () => {
  let originalWorker;
  let workers;

  beforeEach(() => {
    originalWorker = global.Worker;
    workers = [];
    global.Worker = class MockWorker {
      constructor() {
        this.postMessage = vi.fn();
        this.terminate = vi.fn();
        workers.push(this);
      }
    };
  });

  afterEach(() => {
    global.Worker = originalWorker;
  });

  it('tracks proven, impossible, and unresolved candidate outcomes by name', () => {
    const { result } = renderHook(() => useBonusExplorer({}));
    act(() => {
      result.current.start({ skills: { Agitator: 1 }, priorResults: [{ id: 'seed' }] });
    });

    expect(workers).toHaveLength(3);
    act(() => {
      workers.forEach((worker, workerIndex) => worker.onmessage({ data: {
        type: 'init', workerIndex, assigned: workerIndex === 0 ? 1 : 0,
        initialCount: 3, feasibleCount: 2
      } }));
      workers[0].onmessage({ data: {
        type: 'candidate-status', candidateId: 'set:jin',
        candidate: { skillName: "Jin Dahaad's Revolt", status: 'unresolved' }
      } });
      workers[1].onmessage({ data: {
        type: 'candidate-status', candidateId: 'set:gore',
        candidate: { skillName: "Gore Magala's Tyranny", status: 'proven', level: 1 }
      } });
      workers[2].onmessage({ data: {
        type: 'candidate-status', candidateId: 'group:lord',
        candidate: { skillName: "Lord's Soul", status: 'impossible' }
      } });
    });

    expect(result.current.progress).toEqual(expect.objectContaining({
      proven: 1, impossible: 1, unresolved: 1
    }));
    expect(result.current.progress.candidates.map(candidate => candidate.skillName)).toEqual([
      "Gore Magala's Tyranny", "Jin Dahaad's Revolt", "Lord's Soul"
    ]);
  });

  it('hard-terminates every worker when the exploration wall budget expires', () => {
    vi.useFakeTimers();
    const onElapsed = vi.fn();
    const { result } = renderHook(() => useBonusExplorer({ onElapsed }));
    act(() => {
      result.current.start({ skills: { Agitator: 1 }, priorResults: [{ id: 'seed' }] });
      workers[0].onmessage({ data: {
        type: 'candidate-status', candidateId: 'skill:agitator',
        candidate: { skillName: 'Agitator', status: 'verifying' }
      } });
      vi.advanceTimersByTime(25000);
    });

    expect(result.current.isExploring).toBe(false);
    expect(result.current.progress).toEqual(expect.objectContaining({
      status: 'partial', unresolved: 1, budgetExhausted: 1
    }));
    expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    expect(onElapsed).toHaveBeenCalledWith(25);
    vi.useRealTimers();
  });

  it('continues only unresolved candidates with a larger budget and preserves prior proofs', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBonusExplorer({}));
    act(() => {
      result.current.start({
        skills: { Agitator: 1 },
        priorResults: [{ id: 'seed' }],
        recommendationResume: true,
        recommendationBudgetMs: 60000,
        recommendationCandidateIds: ['discover-set-bonus:Unresolved Set'],
        recommendationPriorCandidates: [{
          skillName: 'Already Proven', sourceType: 'discover-set-bonus',
          status: 'proven', level: 1
        }]
      });
      workers[0].onmessage({ data: {
        type: 'candidate-status', candidateId: 'discover-set-bonus:Unresolved Set',
        candidate: {
          skillName: 'Unresolved Set', sourceType: 'discover-set-bonus', status: 'verifying'
        }
      } });
    });

    expect(workers.length).toBeGreaterThanOrEqual(3);
    expect(workers.length).toBeLessThanOrEqual(6);
    expect(workers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      recommendationResume: true,
      recommendationBudgetMs: 60000,
      recommendationCandidateIds: ['discover-set-bonus:Unresolved Set'],
      workerCount: workers.length
    }));
    expect(result.current.progress).toEqual(expect.objectContaining({ proven: 1 }));
    act(() => { vi.advanceTimersByTime(25000); });
    expect(result.current.isExploring).toBe(true);
    act(() => { vi.advanceTimersByTime(35000); });
    expect(result.current.isExploring).toBe(false);
    expect(result.current.progress).toEqual(expect.objectContaining({
      status: 'partial', proven: 1, unresolved: 1
    }));
    vi.useRealTimers();
  });
});
