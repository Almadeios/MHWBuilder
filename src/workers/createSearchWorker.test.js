import { createSearchWorker } from './createSearchWorker';

describe('createSearchWorker', () => {
  const originalWorker = global.Worker;

  afterEach(() => {
    global.Worker = originalWorker;
  });

  it('starts the Vite worker as an ES module', () => {
    global.Worker = vi.fn();

    createSearchWorker();

    expect(global.Worker).toHaveBeenCalledWith(
      expect.any(URL),
      { type: 'module' }
    );
  });
});
