import { buildQuotaSettings, DEFAULT_LIMITS } from '@/components/admin/shared';

describe('buildQuotaSettings', () => {
  it('keeps a limit of 0 instead of falling back to the default', () => {
    const result = buildQuotaSettings('limited', { image: '0', video: '0', speech: '5', text: '0' });
    expect(result.image).toEqual({ type: 'limited', limit: 0 });
    expect(result.video).toEqual({ type: 'limited', limit: 0 });
    expect(result.speech).toEqual({ type: 'limited', limit: 5 });
    expect(result.text).toEqual({ type: 'limited', limit: 0 });
  });

  it('falls back to the default for blank or invalid input', () => {
    const result = buildQuotaSettings('limited', { image: '', video: 'abc', speech: '-3', text: '7' });
    expect(result.image.limit).toBe(DEFAULT_LIMITS.image);
    expect(result.video.limit).toBe(DEFAULT_LIMITS.video);
    expect(result.speech.limit).toBe(0);
    expect(result.text.limit).toBe(7);
  });

  it('sends null limits for unlimited quotas', () => {
    const result = buildQuotaSettings('unlimited', { image: '0', video: '0', speech: '0', text: '0' });
    expect(result.image).toEqual({ type: 'unlimited', limit: null });
  });
});
