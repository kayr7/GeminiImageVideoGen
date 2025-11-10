import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/shared/Header';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gemini Creative Playground',
  description: 'Generate images, videos, and music with Google Gemini AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 container mx-auto px-4 py-8">
              {children}
            </main>
            <footer className="bg-gray-100 dark:bg-gray-900 py-6 mt-auto">
              <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
                <p>Powered by Google Gemini API</p>
                <p className="mt-1">
                  © {new Date().getFullYear()} Gemini Creative Playground
                </p>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}

