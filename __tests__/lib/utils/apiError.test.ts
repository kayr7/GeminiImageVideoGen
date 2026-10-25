import { errorMessageFromBody, parseApiResponse } from '@/lib/utils/apiError';

describe('errorMessageFromBody', () => {
  it('prefers a string detail', () => {
    expect(errorMessageFromBody({ detail: 'Name already exists' }, 'x')).toBe('Name already exists');
  });

  it('joins validation messages', () => {
    expect(
      errorMessageFromBody({ detail: [{ msg: 'Value error, bad name' }, { msg: 'too long' }] }, 'x'),
    ).toBe('bad name; too long');
  });

  it('falls back to error.message and the fallback', () => {
    expect(errorMessageFromBody({ error: { message: 'old style' } }, 'x')).toBe('old style');
    expect(errorMessageFromBody(null, 'fallback')).toBe('fallback');
  });
});

describe('parseApiResponse', () => {
  it('returns data on success and throws the backend detail otherwise', async () => {
    const ok = { ok: true, status: 200, json: async () => ({ success: true, data: { a: 1 } }) } as Response;
    await expect(parseApiResponse(ok, 'x')).resolves.toEqual({ a: 1 });

    const bad = { ok: false, status: 409, json: async () => ({ detail: 'duplicate' }) } as Response;
    await expect(parseApiResponse(bad, 'x')).rejects.toMatchObject({ message: 'duplicate', status: 409 });

    const html = { ok: false, status: 502, json: async () => { throw new Error('not json'); } } as unknown as Response;
    await expect(parseApiResponse(html, 'Failed')).rejects.toThrow('Failed');
  });
});
