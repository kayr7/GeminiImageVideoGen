'use client';

import { useState } from 'react';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import MultiFileUpload from '../ui/MultiFileUpload';
import LoadingSpinner from '../shared/LoadingSpinner';
import { CONSTANTS } from '@/lib/utils/constants';

// Use relative URL that goes through nginx proxy
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/HdMImageVideo';

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<string>(CONSTANTS.MODELS.IMAGE.NANO_BANANA.id);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get model info for pricing display
  const getModelInfo = () => {
    const models = CONSTANTS.MODELS.IMAGE;
    return Object.values(models).find((m: any) => m.id === model);
  };

  const selectedModel = getModelInfo();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const response = await fetch(`${API_URL}/api/image/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
            options={Object.values(CONSTANTS.MODELS.IMAGE).map((m: any) => ({
              value: m.id,
              label: `${m.name} - $${m.price.toFixed(2)}/${m.priceUnit.replace('per ', '')}`,
            }))}
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
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {selectedModel.description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                  ${selectedModel.price.toFixed(2)}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {selectedModel.priceUnit}
                </p>
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

