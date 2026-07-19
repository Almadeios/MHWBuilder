import { clearAppData } from './factoryReset';

describe('factory reset', () => {
  it('clears persistent, session, and Cache Storage data', async() => {
    const localStorageArea = { clear: vi.fn() };
    const sessionStorageArea = { clear: vi.fn() };
    const cacheStorage = {
      keys: vi.fn().mockResolvedValue(['assets-v1', 'data-v2']),
      delete: vi.fn().mockResolvedValue(true)
    };

    await clearAppData({ localStorageArea, sessionStorageArea, cacheStorage });

    expect(localStorageArea.clear).toHaveBeenCalledTimes(1);
    expect(sessionStorageArea.clear).toHaveBeenCalledTimes(1);
    expect(cacheStorage.delete).toHaveBeenCalledWith('assets-v1');
    expect(cacheStorage.delete).toHaveBeenCalledWith('data-v2');
  });
});
