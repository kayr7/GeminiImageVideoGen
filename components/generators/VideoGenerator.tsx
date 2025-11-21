'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import FileUpload from '../ui/FileUpload';
import MultiFileUpload from '../ui/MultiFileUpload';
import LoadingSpinner from '../shared/LoadingSpinner';
import QuotaDisplay from './QuotaDisplay';
import TemplateSelector from '../shared/TemplateSelector';
import { CONSTANTS } from '@/lib/utils/constants';
import { useAuth } from '@/lib/context/AuthContext';
import { apiFetch, resolveApiUrl } from '@/lib/utils/apiClient';
import type { ModelInfo } from '@/types';

type VideoJob = {
  id: string;
  status?: string;
  videoUrl?: string;
  prompt?: string;
  mode?: string;
  createdAt?: string;
  error?: string;
  [key: string]: unknown;
};

export default function VideoGenerator() {
  const { token, config, initialising } = useAuth();

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  const videoModelAvailability = config?.models?.['video'];
  const availableVideoModels = useMemo<ModelInfo[]>(() => {
    return videoModelAvailability?.enabled ?? [];
  }, [videoModelAvailability]);

  const defaultVideoModelId = useMemo(() => {
    if (!availableVideoModels.length) {
      return '';
    }

    const preferred = videoModelAvailability?.default;
    if (preferred && availableVideoModels.some((modelInfo) => modelInfo.id === preferred)) {
      return preferred;
    }

    return availableVideoModels[0].id;
  }, [availableVideoModels, videoModelAvailability?.default]);

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [model, setModel] = useState('');
  const [resolution, setResolution] = useState('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('4');

  // Image options per Veo documentation
  // NOTE: Cannot combine last frame with reference images (API limitation)
  // Valid: first+last frames OR first frame+reference images OR reference images only
  const [firstFrameInput, setFirstFrameInput] = useState<string | null>(null); // Starting frame (input)
  const [lastFrameInput, setLastFrameInput] = useState<string | null>(null); // Ending frame (input)
  const [referenceImages, setReferenceImages] = useState<string[]>([]); // Style/content guidance (max 3)

  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [firstFrameExtracted, setFirstFrameExtracted] = useState<string | null>(null); // Extracted from generated video
  const [lastFrameExtracted, setLastFrameExtracted] = useState<string | null>(null); // Extracted from generated video
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<VideoJob[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  useEffect(() => {
    if (availableVideoModels.length === 0) {
      setModel('');
      return;
    }

    setModel((current) => {
      const currentExists = current && availableVideoModels.some((item) => item.id === current);
      if (currentExists) {
        if (
          defaultVideoModelId &&
          current !== defaultVideoModelId &&
          availableVideoModels.some((item) => item.id === defaultVideoModelId)
        ) {
          return defaultVideoModelId;
        }
        return current;
      }

      return defaultVideoModelId;
    });
  }, [availableVideoModels, defaultVideoModelId]);

  const selectedModel = useMemo<ModelInfo | null>(
    () => (model ? availableVideoModels.find((m) => m.id === model) ?? null : null),
    [availableVideoModels, model]
  );

  const supportsAdvancedFrames = useMemo(() => {
    if (!selectedModel?.capabilities?.video_reference_images) return false;
    return selectedModel.capabilities.video_reference_images.enabled;
  }, [selectedModel]);

  const maxReferenceImages = useMemo(() => {
    if (!selectedModel?.capabilities?.video_reference_images) return 0;
    return selectedModel.capabilities.video_reference_images.max;
  }, [selectedModel]);

  const supportsStartFrame = useMemo(() => {
    if (!selectedModel?.capabilities?.video_reference_images) return false;
    return selectedModel.capabilities.video_reference_images.supports_start_frame;
  }, [selectedModel]);

  const supportsEndFrame = useMemo(() => {
    if (!selectedModel?.capabilities?.video_reference_images) return false;
    return selectedModel.capabilities.video_reference_images.supports_end_frame;
  }, [selectedModel]);

  const videoGenerationEnabled = config ? config.features.videoGeneration : true;

  useEffect(() => {
    if (!supportsAdvancedFrames) {
      setFirstFrameInput(null);
      setLastFrameInput(null);
    }
  }, [supportsAdvancedFrames]);

  const loadJobHistory = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const response = await apiFetch('/api/video/jobs', {
        headers: { ...authHeaders },
      });
      const data = await response.json();
      if (data.success) {
        const jobs = Array.isArray(data.data?.jobs)
          ? (data.data.jobs as VideoJob[])
          : [];
        setJobHistory(jobs);
      }
    } catch (err) {
      console.error('Failed to load job history:', err);
    }
  }, [token, authHeaders]);

  const checkJobStatus = async (jobId: string) => {
    if (!token) {
      return undefined;
    }
    try {
      const response = await apiFetch(`/api/video/jobs/${jobId}`, {
        headers: { ...authHeaders },
      });
      const data = await response.json();
      if (data.success && data.data) {
        const updatedJob = data.data as VideoJob;
        setJobHistory((prev) => prev.map((job) => (job.id === jobId ? updatedJob : job)));

        if (updatedJob.status === 'completed' && updatedJob.videoUrl) {
          setGeneratedVideo(resolveApiUrl(updatedJob.videoUrl));
          setStatusMessage('Video generation completed!');
        }

        return updatedJob;
      }
    } catch (err) {
      console.error('Failed to check job status:', err);
    }
    return undefined;
  };

  useEffect(() => {
    if (!initialising) {
      loadJobHistory();
    }
  }, [initialising, loadJobHistory]);

  const pollVideoStatus = async (jobId: string) => {
    const maxAttempts = 60; // 10 minutes max (60 attempts * 10 seconds)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await apiFetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}`, {
          headers: { ...authHeaders },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to check video status');
        }

        if (data.data.status === 'completed') {
          if (data.data.videoUrl) {
            setGeneratedVideo(resolveApiUrl(data.data.videoUrl));
            setStatusMessage('Video generation completed!');
            
            // Set extracted frames if available
            if (data.data.firstFrameData) {
              setFirstFrameExtracted(`data:image/jpeg;base64,${data.data.firstFrameData}`);
            }
            if (data.data.lastFrameData) {
              setLastFrameExtracted(`data:image/jpeg;base64,${data.data.lastFrameData}`);
            }
            
            return;
          }
          if (data.data.videoData) {
            setGeneratedVideo(`data:video/mp4;base64,${data.data.videoData}`);
            setStatusMessage('Video generation completed!');
            
            // Set extracted frames if available
            if (data.data.firstFrameData) {
              setFirstFrameExtracted(`data:image/jpeg;base64,${data.data.firstFrameData}`);
            }
            if (data.data.lastFrameData) {
              setLastFrameExtracted(`data:image/jpeg;base64,${data.data.lastFrameData}`);
            }
            
            return;
          }
        } else if (data.data.status === 'processing') {
          setStatusMessage(`Processing video... (${attempts * 10}s elapsed)`);
          await new Promise((resolve) => setTimeout(resolve, 10000));
          attempts++;
        } else if (data.data.status === 'failed') {
          throw new Error('Video generation failed');
        }
      } catch (err) {
        throw err;
      }
    }

    throw new Error('Video generation timed out. Please try again.');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt describing the video');
      return;
    }

    if (!model) {
      setError('No video model is currently available.');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedVideo(null);
    setFirstFrameExtracted(null);
    setLastFrameExtracted(null);
    setStatusMessage('Starting video generation...');

    try {
      // Always use /generate endpoint with appropriate fields
      const requestBody: Record<string, unknown> = {
        prompt: prompt.trim(),
        model,
      };
      
      // Add optional fields if provided
      if (negativePrompt.trim()) {
        requestBody.negativePrompt = negativePrompt.trim();
      }
      
      if (firstFrameInput) {
        requestBody.firstFrame = firstFrameInput;
      }
      
      if (lastFrameInput) {
        requestBody.lastFrame = lastFrameInput;
      }
      
      if (referenceImages.length > 0) {
        requestBody.referenceImages = referenceImages.slice(0, maxReferenceImages);
      }

      if (resolution) requestBody.resolution = resolution;
      if (aspectRatio) requestBody.aspectRatio = aspectRatio;
      if (duration) requestBody.durationSeconds = duration;
      
      const response = await apiFetch('/api/video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to generate video');
      }

      // Start polling if we got a job ID
      if (data.data.jobId) {
        setStatusMessage('Video generation started. This will take several minutes...');
        await pollVideoStatus(data.data.jobId);
      } else if (data.data.videoUrl) {
        setGeneratedVideo(data.data.videoUrl);
        setStatusMessage('Video generation completed!');
      } else if (data.data.videoData) {
        setGeneratedVideo(`data:video/mp4;base64,${data.data.videoData}`);
        setStatusMessage('Video generation completed!');
      } else {
        throw new Error('No video data or job ID in response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
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
            href={`/login?redirect=${encodeURIComponent('/video')}`}
            className="inline-block text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            Sign in for admin controls
          </Link>
        )}
      </div>
    );
  }

  if (!videoGenerationEnabled) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-2">Video generation disabled</h2>
        <p className="text-sm">
          Video generation has been turned off by your administrator. Try again later or reach out to your deployment owner.
        </p>
      </div>
    );
  }

  if (availableVideoModels.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-2">No video models available</h2>
        <p className="text-sm">
          All Veo models are disabled in the current configuration. Update your environment variables to enable at least one video model.
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
            Video generation is available without signing in. Administrators can log in to unlock saved job history and
            manage model availability for your deployment.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent('/video')}`}
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
          {token && <QuotaDisplay generationType="video" />}
          
          <h2 className="text-2xl font-bold mb-4">Video Generation with Veo 3.1</h2>

          {/* Template Selector */}
          <TemplateSelector
            mediaType="video"
            value={prompt}
            onChange={setPrompt}
            disabled={loading}
            label="Prompt Template (Optional)"
          />

          <Textarea
            label="Video Description"
            placeholder="Describe the video you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            helperText={`${prompt.length}/${CONSTANTS.MAX_PROMPT_LENGTH} characters`}
            maxLength={CONSTANTS.MAX_PROMPT_LENGTH}
          />

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="font-semibold text-sm">Advanced Options (Images, Negative Prompt)</span>
              <svg
                className={`w-5 h-5 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvancedOptions && (
              <div className="mt-4 space-y-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                    <strong>Image Options:</strong>
                  </p>
                  <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                    <li>• <strong>First Frame:</strong> Image becomes the starting frame of the video</li>
                    <li>• <strong>Last Frame:</strong> Image becomes the ending frame of the video</li>
                    <li>• <strong>Reference Images:</strong> Up to 3 images guide the visual style/content (not used as frames)</li>
                  </ul>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-semibold">
                    ⚠️ Cannot combine last frame with reference images
                  </p>
                </div>

                {!supportsAdvancedFrames && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-200">
                    ⚠️ Advanced image features are only supported by standard Veo models (e.g. <strong>veo-3.1-generate-preview</strong>).
                    Switch models to use these features.
                  </div>
                )}

                {lastFrameInput && referenceImages.length > 0 && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-800 dark:text-red-200">
                    <strong>⚠️ Conflict:</strong> You cannot use last frame and reference images together.
                    Please remove one or the other before generating.
                  </div>
                )}

                <FileUpload
                  label="First Frame (Optional) - Image becomes the starting frame"
                  accept="image/*"
                  onFileSelect={(file, base64) => setFirstFrameInput(base64 || null)}
                  preview
                  disabled={!supportsAdvancedFrames}
                  helperText={
                    !supportsStartFrame
                      ? 'First frame is not supported by this model'
                      : 'Can be used with last frame OR reference images'
                  }
                />

                <FileUpload
                  label="Last Frame (Optional) - Image becomes the ending frame"
                  accept="image/*"
                  onFileSelect={(file, base64) => setLastFrameInput(base64 || null)}
                  preview
                  disabled={!supportsAdvancedFrames || referenceImages.length > 0}
                  helperText={
                    !supportsEndFrame
                      ? 'Last frame is not supported by this model'
                      : referenceImages.length > 0
                      ? 'Disabled: Cannot use with reference images'
                      : 'Works best with first frame for interpolation'
                  }
                />

                <div>
                  <MultiFileUpload
                    label="Reference Images (Optional)"
                    accept="image/*"
                    maxFiles={3}
                    onFilesSelect={(files, base64Array) => setReferenceImages(base64Array)}
                    preview
                    disabled={!supportsAdvancedFrames || !!lastFrameInput}
                    helperText={
                      !supportsAdvancedFrames
                        ? 'Reference images are not supported by this model'
                        : lastFrameInput
                        ? 'Disabled: Cannot use with last frame'
                        : 'Up to 3 images to guide visual style and content (not used as frames)'
                    }
                  />
                </div>

                <Textarea
                  label="Negative Prompt (Optional)"
                  placeholder="Describe what you DON'T want in the video..."
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  rows={2}
                  helperText="Specify elements to avoid in the generated video"
                />
              </div>
            )}
          </div>

          <Select
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            options={availableVideoModels.map((m) => ({
              value: m.id,
              label:
                m.pricePerVideo !== undefined
                  ? `${m.name} - $${m.pricePerVideo.toFixed(2)}/video`
                  : m.price !== undefined && m.priceUnit
                  ? `${m.name} - $${m.price.toFixed(2)}/${m.priceUnit.replace('per ', '')}`
                  : m.name,
            }))}
            disabled={availableVideoModels.length === 0}
          />

          {selectedModel && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start justify-between mb-2">
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
                  {selectedModel.pricePerVideo !== undefined ? (
                    <>
                      <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                        ${selectedModel.pricePerVideo.toFixed(2)}
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">per video</p>
                    </>
                  ) : selectedModel.price !== undefined && selectedModel.priceUnit ? (
                    <>
                      <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                        ${selectedModel.price.toFixed(2)}
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">{selectedModel.priceUnit}</p>
                    </>
                  ) : (
                    <p className="text-xs text-blue-700 dark:text-blue-300">Included</p>
                  )}
                </div>
              </div>
              {selectedModel.price !== undefined && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  ${selectedModel.price.toFixed(2)} {selectedModel.priceUnit ?? 'per second'}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mt-4">
            <Select
              label="Resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              options={(selectedModel?.capabilities?.resolutions || ['720p', '1080p']).map(r => ({
                value: r,
                label: r
              }))}
            />
            <Select
              label="Aspect Ratio"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              options={(selectedModel?.capabilities?.aspect_ratios || ['16:9', '9:16']).map(r => ({
                value: r,
                label: r
              }))}
            />
            <Select
              label="Duration (s)"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              options={(selectedModel?.capabilities?.durations || [4, 6, 8]).map(d => ({
                value: d.toString(),
                label: `${d}s`
              }))}
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {statusMessage && !error && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 text-sm">{statusMessage}</p>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            isLoading={loading}
            disabled={loading || !prompt.trim()}
            className="w-full"
          >
            Generate Video
          </Button>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Tips for Better Results</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Video generation takes 11 seconds to 6 minutes</li>
              <li>• All videos are 8 seconds at 720p/1080p (24fps)</li>
              <li>• Be descriptive about motion, camera movement, and lighting</li>
              <li>• Use Veo 3.1 Fast for quicker generation (~2x faster)</li>
              <li>• Combine first+last frames OR first frame+reference images (not last+reference)</li>
              <li>• Negative prompts help avoid unwanted elements</li>
            </ul>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Generated Video</h2>
            <Button
              variant="secondary"
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) loadJobHistory();
              }}
              className="text-sm"
            >
              {showHistory ? 'Hide' : 'Show'} Job History ({jobHistory.length})
            </Button>
          </div>

          {/* Job History */}
          {showHistory && (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-3">Recent Video Jobs</h3>
              {jobHistory.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">No previous jobs</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {jobHistory.map((job) => (
                    <div
                      key={job.id}
                      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded p-3 text-sm"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{job.prompt}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {job.mode === 'text' ? 'Text-to-Video' : 'Image-to-Video'} • {' '}
                            {job.createdAt
                              ? new Date(job.createdAt).toLocaleString()
                              : 'Date unavailable'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ml-2 ${
                            job.status === 'completed'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : job.status === 'processing'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                              : job.status === 'failed'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {job.status === 'processing' && (
                          <button
                            onClick={() => checkJobStatus(job.id)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Check Status
                          </button>
                        )}
                        {job.status === 'completed' && job.videoUrl && (
                          <button
                            onClick={() => setGeneratedVideo(resolveApiUrl(job.videoUrl ?? ''))}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            View Video
                          </button>
                        )}
                        {job.status === 'failed' && job.error && (
                          <p className="text-xs text-red-600 dark:text-red-400">{job.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-xl font-semibold mb-2">Current Generation</h3>

            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 min-h-[400px] flex items-center justify-center">
              {loading ? (
                <LoadingSpinner message="Generating your video (this may take a few minutes)..." />
              ) : generatedVideo ? (
                <div className="space-y-4 w-full">
                  <video
                    src={generatedVideo}
                    controls
                    className="w-full rounded-lg shadow-lg"
                  />
                  <Button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = generatedVideo;
                      link.download = `generated-video-${Date.now()}.mp4`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="w-full"
                  >
                    Download Video
                  </Button>
                  
                  {/* Extracted Frames Section */}
                  {(firstFrameExtracted || lastFrameExtracted) && (
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <h4 className="text-sm font-semibold mb-3">Extracted Frames</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {firstFrameExtracted && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">First Frame</p>
                            <img
                              src={firstFrameExtracted}
                              alt="First frame"
                              className="w-full rounded border border-gray-300 dark:border-gray-600"
                            />
                            <Button
                              variant="secondary"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = firstFrameExtracted;
                                link.download = `first-frame-${Date.now()}.jpg`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                              className="w-full text-xs"
                            >
                              Download First Frame
                            </Button>
                          </div>
                        )}
                        
                        {lastFrameExtracted && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Last Frame</p>
                            <img
                              src={lastFrameExtracted}
                              alt="Last frame"
                              className="w-full rounded border border-gray-300 dark:border-gray-600"
                            />
                            <Button
                              variant="secondary"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = lastFrameExtracted;
                                link.download = `last-frame-${Date.now()}.jpg`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                              className="w-full text-xs"
                            >
                              Download Last Frame
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">Your generated video will appear here</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

