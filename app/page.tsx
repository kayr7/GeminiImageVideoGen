'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { useAuth } from '@/lib/context/AuthContext';

// Simple SVG icons
const PhotoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const VideoCameraIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const FEATURE_DEFINITIONS = {
  image: {
    title: 'Image Generation',
    description: 'Create stunning images from text prompts or transform existing images with AI-powered editing.',
    icon: PhotoIcon,
    href: '/image',
    capabilities: [
      'Text-to-image generation',
      'Image-to-image transformation',
      'AI-powered image editing',
      'Style transfer with reference images',
    ],
  },
  video: {
    title: 'Video Generation',
    description: 'Generate videos from text descriptions or animate still images into dynamic content.',
    icon: VideoCameraIcon,
    href: '/video',
    capabilities: [
      'Text-to-video creation',
      'Image-to-video animation',
      'Multiple quality options',
      'Configurable duration',
    ],
  },
} as const;

export default function Home() {
  const { token, user, config, initialising } = useAuth();

  const featureFlags = config?.features;
  const visibleFeatures = useMemo(() => {
    const items = [] as Array<(typeof FEATURE_DEFINITIONS)[keyof typeof FEATURE_DEFINITIONS]>;
    if (featureFlags?.imageGeneration ?? true) {
      items.push(FEATURE_DEFINITIONS.image);
    }
    if (featureFlags?.videoGeneration ?? true) {
      items.push(FEATURE_DEFINITIONS.video);
    }
    return items;
  }, [featureFlags]);

  const modelSummaries = useMemo(() => {
    if (!config) {
      return [] as Array<{
        category: string;
        enabled: number;
        disabled: number;
        defaultModel?: string;
      }>;
    }
    return Object.entries(config.models).map(([category, availability]) => ({
      category,
      enabled: availability.enabled.length,
      disabled: availability.disabled.length,
      defaultModel: availability.default,
    }));
  }, [config]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Gemini Creative Playground
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          Explore the power of GenAI with interactive tools for
          image and video generation. 
        </p>

        {!initialising && token && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Signed in as <span className="font-semibold">{user?.displayName || user?.username}</span>.
            Your configuration controls which models appear throughout the app.
          </p>
        )}

        {!initialising && !token && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Administrators can{' '}
            <Link href="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              sign in
            </Link>{' '}
            to customise model availability and feature toggles. Everyone else can explore the generators without an account.
          </p>
        )}
      </div>

      {config && (
        <div className="mb-16 grid gap-4 md:grid-cols-2">
          {modelSummaries.map((summary) => (
            <div
              key={summary.category}
              className="p-4 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-left"
            >
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 capitalize">
                {summary.category} models
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                {summary.enabled} enabled{summary.disabled > 0 ? ` • ${summary.disabled} disabled` : ''}
              </p>
              {summary.defaultModel && (
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Default model: <span className="font-medium">{summary.defaultModel}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Feature Cards */}
      <div className="grid md:grid-cols-2 gap-8 mb-16">
        {visibleFeatures.map((feature) => (
          <Link
            key={feature.title}
            href={feature.href}
            className="group block p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400"
          >
            <div className="flex items-center mb-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                <feature.icon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="ml-4 text-2xl font-bold text-gray-900 dark:text-white">
                {feature.title}
              </h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {feature.description}
            </p>

            <ul className="space-y-2">
              {feature.capabilities.map((capability) => (
                <li key={capability} className="flex items-start text-sm text-gray-500 dark:text-gray-400">
                  <svg
                    className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {capability}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center text-blue-600 dark:text-blue-400 font-medium group-hover:translate-x-2 transition-transform">
              Get Started
              <svg
                className="w-5 h-5 ml-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-8 border border-blue-200 dark:border-blue-800">
        <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Important Information
        </h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
              Usage Limits
            </h4>
            <p className="text-gray-700 dark:text-gray-300 text-sm">
              To control costs, this platform implements rate limiting. You can
              view your current usage at the top of the page. Limits reset hourly
              and daily.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
              Best Practices
            </h4>
            <ul className="text-gray-700 dark:text-gray-300 text-sm space-y-1">
              <li>• Be specific and detailed in your prompts</li>
              <li>• Use the fast models for quick iterations</li>
              <li>• Download results immediately (not stored)</li>
              <li>• Experiment with different settings</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
              Getting Help
            </h4>
            <p className="text-gray-700 dark:text-gray-300 text-sm">
              Each generation page includes tips and examples. If you encounter
              issues, check the console for detailed error messages or contact
              support.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
              Privacy & Safety
            </h4>
            <p className="text-gray-700 dark:text-gray-300 text-sm">
              All content is processed through Google&apos;s Gemini API with their built-in
              safety filters. Uploaded and generated images or videos are saved and logged with IP to prevent abuse.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

