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
  const { login, setPassword: authSetPassword, token, initialising } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordSetupMode, setPasswordSetupMode] = useState(false);
  const [passwordSetupEmail, setPasswordSetupEmail] = useState('');

  const redirectTo = searchParams?.get('redirect') || '/';

  useEffect(() => {
    if (!initialising && token) {
      router.replace(redirectTo);
    }
  }, [initialising, token, router, redirectTo]);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await login(username.trim(), password);
      
      // Check if password setup is required
      if (response.requirePasswordSetup) {
        setPasswordSetupMode(true);
        setPasswordSetupEmail(username.trim());
        setPassword('');
        setLoading(false);
        return;
      }

      // Normal login succeeded
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSetupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validate password
    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await authSetPassword(passwordSetupEmail, newPassword);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setPasswordSetupMode(false);
    setPasswordSetupEmail('');
    setNewPassword('');
    setConfirmPassword('');
    setPassword('');
    setError(null);
  };

  if (passwordSetupMode) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Set Your Password</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
            Welcome! Please create a secure password for your account.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-200 mt-3 font-medium">
            {passwordSetupEmail}
          </p>
        </div>

        <form onSubmit={handlePasswordSetupSubmit} className="space-y-4">
          <Input
            label="New Password"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter new password"
            required
          />

          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 -mt-2">
            <p>Password must contain:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li className={newPassword.length >= 8 ? 'text-green-600' : ''}>
                At least 8 characters
              </li>
              <li className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>
                One uppercase letter
              </li>
              <li className={/[a-z]/.test(newPassword) ? 'text-green-600' : ''}>
                One lowercase letter
              </li>
              <li className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>One number</li>
            </ul>
          </div>

          <Input
            label="Confirm Password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            required
          />

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Button type="submit" className="w-full" isLoading={loading} disabled={loading}>
              Set Password & Sign In
            </Button>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              ← Back to login
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <span className="font-semibold">First-time setup:</span> Your administrator has created
            an account for you. Please set a secure password to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sign in</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
          Enter your credentials to access the platform.
        </p>
      </div>

      <form onSubmit={handleLoginSubmit} className="space-y-4">
        <Input
          label="Email"
          name="username"
          type="email"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Enter your email"
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
        <p className="mt-3">
          Lost access? Contact your administrator or check the{' '}
          <Link href="/" className="text-blue-600 hover:underline">
            documentation
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
