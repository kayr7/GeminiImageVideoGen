'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';

/**
 * Redirects to /login (preserving the return path) when no session exists,
 * and optionally to / when the user is not an admin.
 * Returns `ready` once auth has initialised and the requirements are met.
 */
export function useRequireAuth(redirectPath: string, options: { admin?: boolean } = {}) {
  const router = useRouter();
  const auth = useAuth();
  const { token, user, initialising } = auth;
  const isAdmin = user?.roles?.includes('admin') ?? false;
  const needsAdmin = options.admin === true;

  useEffect(() => {
    if (initialising) return;
    if (!token) {
      router.push(`/login?redirect=${redirectPath}`);
    } else if (needsAdmin && !isAdmin) {
      router.push('/');
    }
  }, [initialising, token, isAdmin, needsAdmin, redirectPath, router]);

  const ready = !initialising && !!token && (!needsAdmin || isAdmin);
  return { ...auth, isAdmin, ready };
}
