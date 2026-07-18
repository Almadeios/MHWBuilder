import { act, renderHook } from '@testing-library/react';
import { useSearchWorker } from './useSearchWorker';

vi.mock('../workers/createSearchWorker', () => ({
  createSearchWorker: () => new global.Worker()
}));

describe('useSearchWorker', () => {
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

  it('tracks worker state and routes only current-request results', () => {
    const onPartial = vi.fn();
    const onDone = vi.fn();
    const { result } = renderHook(() => useSearchWorker({ onPartial, onDone }));

    act(() => { result.current.start({ skills: {} }); });
    expect(result.current.state).toMatchObject({ status: 'queued', requestId: 1 });
    expect(workers[0].postMessage).toHaveBeenCalledWith({
      type: 'search', requestId: 1, params: { skills: {} }, useCached: false
    });

    act(() => {
      workers[0].onmessage({ data: {
        type: 'state', requestId: 1, state: { status: 'streaming', requestId: 1 }
      } });
      workers[0].onmessage({ data: {
        type: 'partial', requestId: 1, response: { results: [{ id: 1 }] }
      } });
      workers[0].onmessage({ data: {
        type: 'done', requestId: 0, response: { results: [{ id: 'stale' }] }
      } });
    });

    expect(result.current.state.status).toBe('streaming');
    expect(onPartial).toHaveBeenCalledWith({ results: [{ id: 1 }] });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('hard-cancels CPU-bound workers and records cancellation', () => {
    const { result } = renderHook(() => useSearchWorker({}));
    act(() => { result.current.start({}); });
    act(() => { result.current.cancel(); });

    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({
      status: 'cancelled', requestId: 1, cancelReason: 'user'
    });
  });
});
