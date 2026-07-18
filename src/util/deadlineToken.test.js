import { createDeadlineToken } from './deadlineToken';

describe('cooperative deadline token', () => {
  it('expires from a monotonic clock without waiting for the event loop', () => {
    let now = 100;
    const token = createDeadlineToken({ budgetMs: 50, now: () => now });

    expect(token.current).toBe(false);
    now = 149.9;
    expect(token.current).toBe(false);
    now = 150;
    expect(token.current).toBe(true);
    expect(token.timedOut).toBe(true);
  });

  it('reflects external cancellation without reporting a timeout', () => {
    const cancelToken = { current: false };
    const token = createDeadlineToken({ budgetMs: 100, cancelToken, now: () => 10 });
    cancelToken.current = true;

    expect(token.current).toBe(true);
    expect(token.timedOut).toBe(false);
  });

  it('treats a zero budget as unlimited', () => {
    const token = createDeadlineToken({ budgetMs: 0, now: () => Number.MAX_SAFE_INTEGER });
    expect(token.current).toBe(false);
  });
});
