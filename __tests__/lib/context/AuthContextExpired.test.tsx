import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/context/AuthContext';
import { AUTH_EXPIRED_EVENT } from '@/lib/utils/apiClient';

const replace = jest.fn();
let pathname = '/image';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => pathname,
}));

const fetchMock = global.fetch as jest.Mock;

function Probe() {
  const { token } = useAuth();
  return <p>{token ? `token:${token}` : 'logged out'}</p>;
}

const storeSession = () =>
  window.localStorage.setItem(
    'gemini-auth-session',
    JSON.stringify({ token: 'tok', user: { username: 'u', roles: [] }, config: { features: {} } }),
  );

describe('AuthProvider session expiry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockReset();
    pathname = '/image';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: false }) });
  });

  it('clears the session and redirects to login with the current path', async () => {
    storeSession();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('token:tok')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    });

    await waitFor(() => expect(screen.getByText('logged out')).toBeInTheDocument());
    expect(window.localStorage.getItem('gemini-auth-session')).toBeNull();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login?redirect=%2Fimage&expired=1');
  });

  it('ignores the event when nobody is logged in', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
