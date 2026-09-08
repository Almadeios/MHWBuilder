import { act, renderHook } from '@testing-library/react';
import { useNormalRecommendations } from './useNormalRecommendations';

vi.mock('../util/normalRecommendations', () => ({ getNormalRecommendationCandidates: () => [
    { name: 'Handicraft', level: 1, max: 2, slotTypes: ['weapon'] },
    { name: 'Guard', level: 1, max: 1, slotTypes: ['weapon'] }
] }));

let workers;
beforeEach(() => {
    workers = [];
    vi.useFakeTimers();
    vi.stubGlobal('Worker', class {
        constructor() { this.postMessage = vi.fn(); this.terminate = vi.fn(); workers.push(this); }
    });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('streams shared slot proofs before running individual searches only on request', () => {
    const { result } = renderHook(() => useNormalRecommendations());
    act(() => result.current.start({ skills: {} }));
    expect(workers).toHaveLength(1);
    expect(workers[0].postMessage.mock.calls[0][0].candidate.kind).toBe('capacity');
    const witness = { skills: { Handicraft: 1 } };
    act(() => workers[0].onmessage({ data: { type: 'batch', recommendations: {
        Handicraft: { level: 1, seedResults: [witness] }, Guard: { level: 1, seedResults: [witness] }
    }, done: true } }));
    expect(result.current.recommendations.Handicraft).toMatchObject({ level: 1, seedResults: [witness] });
    expect(result.current.status).toBe('paused');
    expect(result.current.remaining).toBe(1);
    act(() => result.current.start(null, true));
    expect(workers[1].postMessage.mock.calls[0][0]).toMatchObject({ candidate: { kind: 'capacity' },
        params: { recommendationDeepSlots: true } });
    act(() => workers[1].onmessage({ data: { type: 'batch', recommendations: {}, done: true } }));
    expect(workers[1].postMessage.mock.calls[1][0]).toMatchObject({ candidate: { name: 'Handicraft', level: 2 }, budgetMs: 16000 });
    expect(result.current.recommendations.Handicraft.level).toBe(1);
});

it('stops at the wall deadline without declaring unfinished candidates impossible', () => {
    const { result, unmount } = renderHook(() => useNormalRecommendations());
    act(() => result.current.start({ skills: {} }));
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.status).toBe('paused');
    expect(result.current.remaining).toBe(2);
    expect(workers[0].terminate).toHaveBeenCalled();
    unmount();
});

it('ignores stale worker replies after reset', () => {
    const { result } = renderHook(() => useNormalRecommendations());
    act(() => result.current.start({ skills: {} }));
    const worker = workers[0];
    const candidate = worker.postMessage.mock.calls[0][0].candidate;
    act(() => result.current.reset());
    act(() => worker.onmessage({ data: { candidate, status: 'proven', results: [{ skills: { Handicraft: 1 } }] } }));
    expect(result.current.status).toBe('idle');
    expect(result.current.recommendations).toEqual({});
});
