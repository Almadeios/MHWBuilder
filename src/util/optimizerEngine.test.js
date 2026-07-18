import {
  createOptimizerEngineState, OptimizerEngine, OPTIMIZER_ENGINE_STATUS,
  transitionOptimizerEngine
} from './optimizerEngine';

describe('optimizer engine state', () => {
  it('models the search lifecycle and ignores stale transitions', () => {
    const queued = transitionOptimizerEngine(createOptimizerEngineState(), {
      type: 'queue', requestId: 7
    });
    const running = transitionOptimizerEngine(queued, { type: 'start', requestId: 7, at: 10 });
    const streaming = transitionOptimizerEngine(running, {
      type: 'partial', requestId: 7, resultCount: 4
    });
    const stale = transitionOptimizerEngine(streaming, {
      type: 'complete', requestId: 6, at: 20, resultCount: 99
    });
    const completed = transitionOptimizerEngine(stale, {
      type: 'complete', requestId: 7, at: 30, resultCount: 6
    });

    expect(streaming).toMatchObject({
      status: OPTIMIZER_ENGINE_STATUS.STREAMING, partialCount: 1, resultCount: 4
    });
    expect(stale).toBe(streaming);
    expect(completed).toMatchObject({
      status: OPTIMIZER_ENGINE_STATUS.COMPLETED, finishedAt: 30, resultCount: 6
    });
  });

  it('streams partial results and completes through an injected search function', async() => {
    const messages = [];
    const states = [];
    const times = [1000, 1500, 2000];
    const search = vi.fn(async params => {
      params.partialResultFunc([{ id: 'partial' }], { partial: true });
      return { results: [{ id: 'final-1' }, { id: 'final-2' }], seconds: 1 };
    });
    const engine = new OptimizerEngine({
      now: () => times.shift(), onMessage: message => messages.push(message),
      onStateChange: state => states.push(state), search
    });

    await engine.start({ requestId: 3, params: { skills: {} }, useCached: true });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      cancelToken: { current: false }, partialResultFunc: expect.any(Function)
    }), true);
    expect(messages.map(message => message.type)).toEqual(['partial', 'done']);
    expect(messages[0].response.seconds).toBe(0.5);
    expect(states.map(state => state.status)).toEqual([
      'queued', 'running', 'streaming', 'completed'
    ]);
    expect(engine.getState()).toMatchObject({ status: 'completed', resultCount: 2 });
  });

  it('cancels an active search and suppresses its late result', async() => {
    let resolveSearch;
    const messages = [];
    const search = vi.fn(() => new Promise(resolve => { resolveSearch = resolve; }));
    const engine = new OptimizerEngine({
      now: () => 10, onMessage: message => messages.push(message), search
    });
    const pending = engine.start({ requestId: 9, params: {} });

    expect(engine.cancel('user')).toBe(true);
    resolveSearch({ results: [{ id: 'late' }], seconds: 2 });
    await pending;

    expect(messages).toEqual([]);
    expect(engine.getState()).toMatchObject({
      status: OPTIMIZER_ENGINE_STATUS.CANCELLED, cancelReason: 'user'
    });
  });

  it('turns thrown search errors into serializable failure messages', async() => {
    const messages = [];
    const engine = new OptimizerEngine({
      now: () => 1,
      onMessage: message => messages.push(message),
      search: async() => { throw new Error('optimizer exploded'); }
    });

    await engine.start({ requestId: 11, params: {} });

    expect(engine.getState()).toMatchObject({
      status: OPTIMIZER_ENGINE_STATUS.FAILED,
      error: expect.objectContaining({ message: 'optimizer exploded' })
    });
    expect(messages).toEqual([
      expect.objectContaining({ type: 'error', requestId: 11, message: 'optimizer exploded' })
    ]);
  });
});
