import { AUTH_EXPIRED_EVENT, apiFetch } from '@/lib/utils/apiClient';

const fetchMock = global.fetch as jest.Mock;
const respond = (status: number) => ({ ok: status < 400, status, json: async () => ({}) });

describe('apiFetch 401 handling', () => {
  const listener = jest.fn();

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock.mockReset();
    listener.mockReset();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  const login = () =>
    window.localStorage.setItem('gemini-auth-session', JSON.stringify({ token: 'tok' }));

  it('dispatches auth:expired when an authenticated request gets 401', async () => {
    login();
    fetchMock.mockResolvedValue(respond(401));
    const response = await apiFetch('/api/placeholders');
    expect(response.status).toBe(401);
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer tok');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch without a token (public pages)', async () => {
    fetchMock.mockResolvedValue(respond(401));
    await apiFetch('/api/prompt-lab/run');
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not dispatch for login or a wrong current password', async () => {
    login();
    fetchMock.mockResolvedValue(respond(401));
    await apiFetch('/api/auth/login', { method: 'POST' });
    await apiFetch('/api/auth/change-password', { method: 'POST' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not dispatch for other errors', async () => {
    login();
    fetchMock.mockResolvedValue(respond(403));
    await apiFetch('/api/admin/users');
    expect(listener).not.toHaveBeenCalled();
  });
});
