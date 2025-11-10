'use client';

import { AuthProvider } from '@/lib/context/AuthContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
