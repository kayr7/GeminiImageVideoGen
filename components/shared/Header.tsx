'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/lib/context/AuthContext';

import UsageDisplay from './UsageDisplay';

export default function Header() {
  const pathname = usePathname();
  const { config, token, user, logout, initialising } = useAuth();

  const featureFlags = config?.features;
  const isAdmin = user?.roles?.includes('admin') ?? false;
  const navigation = useMemo(
    () => {
      const items = [{ name: 'Home', href: '/' }];
      if (featureFlags?.imageGeneration ?? true) {
        items.push({ name: 'Image', href: '/image' });
      }
      if (featureFlags?.videoGeneration ?? true) {
        items.push({ name: 'Video', href: '/video' });
      }
      if (isAdmin) {
        items.push({ name: 'Admin', href: '/admin' });
      }
      return items;
    },
    [featureFlags, isAdmin]
  );

  const displayName = user?.displayName || user?.username;

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname === '';
    }
    return pathname?.startsWith(href);
  };

  return (
    <header className="bg-white dark:bg-gray-900 shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link 
            href="/"
            className="flex items-center space-x-2 text-xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span>Gemini Playground</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Usage Display */}
          <div className="flex items-center space-x-3">
            <div className="hidden lg:block">
              <UsageDisplay />
            </div>

            {!initialising && token && (
              <div className="hidden md:flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-300">
                <span>Signed in as {displayName}</span>
              </div>
            )}

            {!initialising && token && (
              <button
                onClick={logout}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Sign out
              </button>
            )}

            {!initialising && !token && (
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Sign in
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

