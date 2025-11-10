'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/context/AuthContext';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-gray-600 dark:text-gray-300">
          Loading sign-in form…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, token, initialising } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTo = searchParams?.get('redirect') || '/';

  useEffect(() => {
    if (!initialising && token) {
      router.replace(redirectTo);
    }
  }, [initialising, token, router, redirectTo]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username.trim(), password);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sign in</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          Use the credentials configured for your deployment to unlock model access and feature settings.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Enter your username"
          required
        />

        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          required
        />

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" isLoading={loading} disabled={loading}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 text-sm text-gray-600 dark:text-gray-300">
        <p>
          Default credentials are <code>admin</code> / <code>admin123</code> unless overridden using environment variables.
        </p>
        <p className="mt-3">
          Lost access? Check the{' '}
          <Link href="/" className="text-blue-600 hover:underline">
            deployment documentation
          </Link>{' '}
          for reset instructions.
        </p>
      </div>
    </div>
  );
}
