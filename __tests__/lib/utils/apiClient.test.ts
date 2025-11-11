describe('resolveApiUrl', () => {
  const originalEnv = { ...process.env };

  const loadModule = async () => {
    jest.resetModules();
    const module = await import('@/lib/utils/apiClient');
    return module;
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('joins relative paths with the configured base path', async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_BASE_PATH: '/HdMImageVideo',
    };

    const { resolveApiUrl } = await loadModule();
    expect(resolveApiUrl('/api/test')).toBe('/HdMImageVideo/api/test');
  });

  it('returns absolute HTTP urls unchanged', async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_BASE_PATH: '/HdMImageVideo',
    };

    const { resolveApiUrl } = await loadModule();
    const absolute = 'https://example.com/api/test';
    expect(resolveApiUrl(absolute)).toBe(absolute);
  });

  it('returns data urls unchanged', async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_BASE_PATH: '/HdMImageVideo',
    };

    const { resolveApiUrl } = await loadModule();
    const dataUrl = 'data:image/png;base64,AAA';
    expect(resolveApiUrl(dataUrl)).toBe(dataUrl);
  });
});
