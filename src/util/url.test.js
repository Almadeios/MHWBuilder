import { getUrlWithSearchParams } from './util';

describe('shared URL construction', () => {
  it('replaces existing query parameters and fragments', () => {
    const params = new URLSearchParams({ skills: '120-5_86-3', sf: '3-2' });

    expect(getUrlWithSearchParams(
      'https://example.com/MHWBuilder/?_refresh=old#results', params
    )).toBe('https://example.com/MHWBuilder/?skills=120-5_86-3&sf=3-2');
  });

  it('returns a clean base URL when there are no parameters', () => {
    expect(getUrlWithSearchParams(
      'https://example.com/MHWBuilder/?old=value#results', new URLSearchParams()
    )).toBe('https://example.com/MHWBuilder/');
  });
});
