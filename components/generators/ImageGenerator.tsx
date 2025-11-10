'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import MultiFileUpload from '../ui/MultiFileUpload';
import LoadingSpinner from '../shared/LoadingSpinner';
import { CONSTANTS } from '@/lib/utils/constants';
import { useAuth } from '@/lib/context/AuthContext';
import type { ModelInfo } from '@/types';

// Use relative URL that goes through nginx proxy
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/HdMImageVideo';

export default function ImageGenerator() {
  const { token, config, initialising } = useAuth();

  const fallbackImageModels = useMemo<ModelInfo[]>(
    () =>
      (Object.values(CONSTANTS.MODELS.IMAGE) as Array<
        (typeof CONSTANTS.MODELS.IMAGE)[keyof typeof CONSTANTS.MODELS.IMAGE]
      >).map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        price: m.price,
        priceUnit: m.priceUnit,
        tier: m.tier,
        category: 'image',
      })),
    []
  );

  const imageModelAvailability = config?.models ? config.models['image'] : undefined;
  const availableImageModels = useMemo<ModelInfo[]>(
    () => {
      if (imageModelAvailability?.enabled?.length) {
        return imageModelAvailability.enabled;
      }
      return fallbackImageModels;
    },
    [imageModelAvailability, fallbackImageModels]
  );

  const resolvedDefaultModel =
    imageModelAvailability?.default ??
    fallbackImageModels[0]?.id ??
    CONSTANTS.MODELS.IMAGE.NANO_BANANA.id;

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<string>(resolvedDefaultModel);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (availableImageModels.length === 0) {
      return;
    }

    const hasCurrentModel = availableImageModels.some((m) => m.id === model);
    if (!hasCurrentModel) {
      setModel(availableImageModels[0].id);
      return;
    }

    const defaultInList = availableImageModels.some((m) => m.id === resolvedDefaultModel);
    if (resolvedDefaultModel && defaultInList && model !== resolvedDefaultModel) {
      setModel(resolvedDefaultModel);
    }
  }, [availableImageModels, resolvedDefaultModel, model]);

  const selectedModel = useMemo<ModelInfo | null>(
    () => availableImageModels.find((m) => m.id === model) ?? null,
    [availableImageModels, model]
  );

  const imageGenerationEnabled = config ? config.features.imageGeneration : true;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/image/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          model,
          aspectRatio,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to generate image');
      }

      // Handle image data
      if (data.data.imageUrl) {
        setGeneratedImage(data.data.imageUrl);
      } else if (data.data.imageData) {
        setGeneratedImage(`data:image/png;base64,${data.data.imageData}`);
      } else {
        throw new Error('No image data received from Gemini API');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (config && !imageGenerationEnabled) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-2">Image generation disabled</h2>
        <p className="text-sm">
          Image generation has been turned off by your administrator. Check back later or contact support for access.
        </p>
      </div>
    );
  }

  if (!initialising && !token) {
    return (
      <div className="max-w-xl mx-auto bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-2">Sign in to generate images</h2>
        <p className="text-sm mb-4">
          Authenticate to load the correct model availability and feature toggles configured for your deployment.
        </p>
        <Link
          href={`/login?redirect=${encodeURIComponent('/image')}`}
          className="inline-block px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (config && availableImageModels.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-2">No image models available</h2>
        <p className="text-sm">
          All image generation models are disabled in the current configuration. Adjust your environment variables to enable at least one model.
        </p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* Controls */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold mb-4">Image Generation</h2>

        <Textarea
          label="Prompt"
          placeholder="Describe the image you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          helperText={`${prompt.length}/${CONSTANTS.MAX_PROMPT_LENGTH} characters`}
          maxLength={CONSTANTS.MAX_PROMPT_LENGTH}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            options={availableImageModels.map((m) => ({
              value: m.id,
              label:
                m.price !== undefined && m.priceUnit
                  ? `${m.name} - $${m.price.toFixed(2)}/${m.priceUnit.replace('per ', '')}`
                  : m.name,
            }))}
            disabled={availableImageModels.length === 0}
          />

          <Select
            label="Aspect Ratio"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            options={CONSTANTS.ASPECT_RATIOS}
          />
        </div>

        <MultiFileUpload
          label="Reference Images (Optional)"
          accept="image/*"
          maxFiles={5}
          onFilesSelect={(files, base64Array) => setReferenceImages(base64Array)}
          preview
          helperText="Upload multiple images for composition or style transfer"
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
          disabled={loading || !prompt.trim()}
          className="w-full"
        >
          Generate Image
        </Button>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Tips for Better Results</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Be specific and detailed in your prompt</li>
            <li>• Mention style, mood, lighting, and composition</li>
            <li>• <strong>Multiple images:</strong> Combine elements or transfer style</li>
            <li>• <strong>Single image:</strong> Best for editing or variations</li>
            <li>• Nano Banana: Best for conversational, iterative editing</li>
            <li>• Imagen: Best for photorealistic, high-quality results</li>
          </ul>
        </div>
      </div>

      {/* Results */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Generated Image</h2>
        
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 min-h-[400px] flex items-center justify-center">
          {loading ? (
            <LoadingSpinner message="Generating your image..." />
          ) : generatedImage ? (
            <div className="space-y-4 w-full">
              <img
                src={generatedImage}
                alt="Generated"
                className="w-full rounded-lg shadow-lg"
              />
              <Button onClick={handleDownload} className="w-full">
                Download Image
              </Button>
            </div>
          ) : (
            <p className="text-gray-500">Your generated image will appear here</p>
          )}
        </div>
      </div>
    </div>
  );
}

