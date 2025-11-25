'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import LoadingSpinner from '../shared/LoadingSpinner';
import QuotaDisplay from './QuotaDisplay';
import { CONSTANTS } from '@/lib/utils/constants';
import { useAuth } from '@/lib/context/AuthContext';
import { apiFetch, resolveApiUrl } from '@/lib/utils/apiClient';
import type { ModelInfo } from '@/types';

export default function SpeechGenerator() {
  const { token, config, initialising } = useAuth();

  const speechModelAvailability = config?.models?.['speech'];
  const availableSpeechModels = useMemo<ModelInfo[]>(() => {
    return speechModelAvailability?.enabled ?? [];
  }, [speechModelAvailability]);

  const defaultSpeechModelId = useMemo(() => {
    if (!availableSpeechModels.length) {
      return '';
    }

    const preferred = speechModelAvailability?.default;
    if (preferred && availableSpeechModels.some((modelInfo) => modelInfo.id === preferred)) {
      return preferred;
    }

    return availableSpeechModels[0].id;
  }, [availableSpeechModels, speechModelAvailability?.default]);

  const [text, setText] = useState('');
  const [model, setModel] = useState<string>('');
  const [voice, setVoice] = useState('Kore');
  const [language, setLanguage] = useState('en-US');
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (availableSpeechModels.length === 0) {
      setModel('');
      return;
    }

    setModel((current) => {
      const currentExists = current && availableSpeechModels.some((item) => item.id === current);
      if (currentExists) {
        if (
          defaultSpeechModelId &&
          current !== defaultSpeechModelId &&
          availableSpeechModels.some((item) => item.id === defaultSpeechModelId)
        ) {
          return defaultSpeechModelId;
        }
        return current;
      }

      return defaultSpeechModelId;
    });
  }, [availableSpeechModels, defaultSpeechModelId]);

  const selectedModel = useMemo<ModelInfo | null>(
    () => (model ? availableSpeechModels.find((m) => m.id === model) ?? null : null),
    [availableSpeechModels, model]
  );

  const availableVoices = useMemo(() => {
    if (!selectedModel?.capabilities?.voices) {
        return ["Kore", "Puck", "Charon", "Aoede", "Fenrir"];
    }
    return selectedModel.capabilities.voices;
  }, [selectedModel]);

  const speechGenerationEnabled = config ? config.features.speechGeneration : true;

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('Please enter text to generate speech');
      return;
    }

    if (!model) {
      setError('No speech model is currently available.');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedAudio(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await apiFetch('/api/speech/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          model: model || undefined,
          voice,
          language
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error?.message || 'Failed to generate speech');
      }

      // Handle audio data
      if (data.data.audioUrl) {
        setGeneratedAudio(resolveApiUrl(data.data.audioUrl));
      } else if (data.data.audioData) {
        setGeneratedAudio(`data:audio/wav;base64,${data.data.audioData}`);
      } else {
        throw new Error('No audio data received from Gemini API');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!generatedAudio) return;

    const link = document.createElement('a');
    link.href = generatedAudio;
    link.download = `generated-speech-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (initialising) {
    return <LoadingSpinner message="Loading configuration..." />;
  }

  const showAdminLoginPrompt = !initialising && !token;

  if (!config) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 space-y-3">
        <h2 className="text-xl font-semibold">Configuration unavailable</h2>
        <p className="text-sm">
          We couldn&apos;t load the model configuration from the server. Please try again later or contact an administrator.
        </p>
        {showAdminLoginPrompt && (
          <Link
            href={`/login?redirect=${encodeURIComponent('/speech')}`}
            className="inline-block text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            Sign in for admin controls
          </Link>
        )}
      </div>
    );
  }

  if (!speechGenerationEnabled) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-2">Speech generation disabled</h2>
        <p className="text-sm">
          Speech generation has been turned off by your administrator. Check back later or contact support for access.
        </p>
      </div>
    );
  }

  if (availableSpeechModels.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-2">No speech models available</h2>
        <p className="text-sm">
          All speech generation models are disabled in the current configuration. Adjust your environment variables to enable at least one model.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showAdminLoginPrompt && (
        <div className="max-w-2xl bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">Optional admin sign in available</h2>
          <p className="text-sm mb-4">
            You can start generating speech right away. Administrators can optionally sign in to apply custom model
            availability and feature controls for this deployment.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent('/speech')}`}
            className="inline-block px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign in for admin controls
          </Link>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Controls */}
        <div className="space-y-4">
          {/* Quota Display */}
          {token && <QuotaDisplay generationType="speech" />}
          <h2 className="text-2xl font-bold mb-4">Speech Generation</h2>

          <Textarea
            label="Text"
            placeholder="Enter the text you want to convert to speech..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            helperText={`${text.length}/${CONSTANTS.MAX_PROMPT_LENGTH} characters`}
            maxLength={CONSTANTS.MAX_PROMPT_LENGTH}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              options={availableSpeechModels.map((m) => ({
                value: m.id,
                label:
                  m.price !== undefined && m.priceUnit
                    ? `${m.name} - $${m.price.toFixed(2)}/${m.priceUnit.replace('per ', '')}`
                    : m.name,
              }))}
              disabled={availableSpeechModels.length === 0}
            />

            <Select
              label="Voice"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              options={availableVoices.map(v => ({
                value: v,
                label: v
              }))}
            />
          </div>
          
           <Select
              label="Language (Optional)"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              options={[
                  { value: 'en-US', label: 'English (US)' },
                  { value: 'en-GB', label: 'English (UK)' },
                  { value: 'fr-FR', label: 'French' },
                  { value: 'de-DE', label: 'German' },
                  { value: 'es-ES', label: 'Spanish' },
                  { value: 'it-IT', label: 'Italian' },
                  { value: 'ja-JP', label: 'Japanese' },
                  { value: 'ko-KR', label: 'Korean' },
                  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
              ]}
            />

          {selectedModel && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    {selectedModel.name}
                  </p>
                  {selectedModel.description && (
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      {selectedModel.description}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {selectedModel.price !== undefined && selectedModel.priceUnit ? (
                    <>
                      <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                        ${selectedModel.price.toFixed(2)}
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {selectedModel.priceUnit}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-blue-700 dark:text-blue-300">Included</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            isLoading={loading}
            disabled={loading || !text.trim()}
            className="w-full"
          >
            Generate Speech
          </Button>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Tips for Better Results</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Use punctuation to control pacing</li>
              <li>• Choose the voice that best fits the tone</li>
              <li>• Experiment with different languages</li>
            </ul>
          </div>
        </div>

        {/* Results */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Generated Audio</h2>

          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 min-h-[400px] flex items-center justify-center">
            {loading ? (
              <LoadingSpinner message="Generating your audio..." />
            ) : generatedAudio ? (
              <div className="space-y-4 w-full flex flex-col items-center">
                <audio controls src={generatedAudio} className="w-full" />
                <Button onClick={handleDownload} className="w-full">
                  Download Audio
                </Button>
              </div>
            ) : (
              <p className="text-gray-500">Your generated audio will appear here</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
