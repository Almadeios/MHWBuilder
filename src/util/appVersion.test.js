import { getVersionedReloadUrl, shouldReloadForVersion } from './appVersion';

describe('automatic app updates', () => {
  it('reloads once when a different version is published', () => {
    expect(shouldReloadForVersion('old', 'new', null)).toBe(true);
    expect(shouldReloadForVersion('old', 'new', 'new')).toBe(false);
    expect(shouldReloadForVersion('new', 'new', null)).toBe(false);
  });

  it('preserves existing URL state while adding the cache-busting version', () => {
    const result = new URL(getVersionedReloadUrl(
      'https://example.com/MHWBuilder/?skills=1-5#results',
      'abc123'
    ));
    expect(result.searchParams.get('skills')).toBe('1-5');
    expect(result.searchParams.get('appVersion')).toBe('abc123');
    expect(result.hash).toBe('#results');
  });
});
