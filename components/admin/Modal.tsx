import type { ReactNode } from 'react';

export default function Modal({
  title,
  subtitle,
  maxWidth = 'max-w-lg',
  children,
}: {
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div
        className={`bg-white dark:bg-gray-900 rounded-xl shadow-2xl ${maxWidth} w-full max-h-[90vh] overflow-y-auto p-6`}
      >
        <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
