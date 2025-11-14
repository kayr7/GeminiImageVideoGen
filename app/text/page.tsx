'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { extractVariables } from '@/lib/text/utils';

export default function TextGenerationPage() {
  const { token, initialising } = useAuth();

  // Mode selection
  const [mode, setMode] = useState<'single' | 'chat'>('single');

  // User input
  const [systemPromptText, setSystemPromptText] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Response state
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract variables from user message
  const detectedVariables = useMemo(() => extractVariables(userMessage), [userMessage]);

  // Update variable values when detected variables change
  useEffect(() => {
    setVariableValues(prev => {
      const newValues = { ...prev };
      // Add new variables
      detectedVariables.forEach(v => {
        if (!(v in newValues)) {
          newValues[v] = '';
        }
      });
      // Remove variables that are no longer in the template
      Object.keys(newValues).forEach(k => {
        if (!detectedVariables.includes(k)) {
          delete newValues[k];
        }
      });
      return newValues;
    });
  }, [detectedVariables]);

  if (initialising) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!token) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Please log in to use text generation</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Text Generation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Generate text using Gemini AI with templates and system prompts
        </p>
      </div>

      {/* Mode Selector */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              mode === 'single'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Single Turn
          </button>
          <button
            type="button"
            onClick={() => setMode('chat')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              mode === 'chat'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Multi-Turn Chat
          </button>
        </div>
      </div>

      {/* Under Construction Notice */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">🚧</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Under Construction
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            The text generation UI is currently being built. The backend API is complete and functional.
            Features include:
          </p>
          <div className="text-left max-w-2xl mx-auto space-y-2 text-gray-600 dark:text-gray-400">
            <p>✅ Single-turn text generation</p>
            <p>✅ Multi-turn chat sessions with memory</p>
            <p>✅ Template system with {'{{variable}}'} syntax</p>
            <p>✅ System prompts (reusable)</p>
            <p>✅ Real-time variable detection</p>
            <p>✅ Save and manage templates</p>
            <p>✅ Generation history</p>
          </div>
          <div className="pt-4">
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Backend API is available at:
              <code className="ml-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                /api/text/*
              </code>
            </p>
          </div>
        </div>
      </div>

      {/* Placeholder showing variable detection works */}
      {detectedVariables.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
            Detected Template Variables:
          </h3>
          <div className="flex flex-wrap gap-2">
            {detectedVariables.map(variable => (
              <span
                key={variable}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium"
              >
                {'{{'}{variable}{'}}'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Demo Input */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Try the variable detection (type {'{{variableName}}'})
          </label>
          <textarea
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            rows={4}
            placeholder="Example: Write a {{style}} email to {{recipient}} about {{topic}}"
          />
        </div>
        {error && loading && response && systemPromptText && variableValues && mode && (
          <p>Placeholder to use variables</p>
        )}
      </div>
    </div>
  );
}
