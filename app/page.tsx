import Link from 'next/link';

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

export default function Home() {
  const features = [
    {
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
    {
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
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Gemini Creative Playground
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          Explore the power of Google&apos;s Gemini AI with interactive tools for 
          image and video generation. Perfect for students, educators, 
          and creative enthusiasts.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-2 gap-8 mb-16">
        {features.map((feature) => (
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
              All content is processed through Google&apos;s Gemini API with built-in
              safety filters. Uploaded images are temporary and automatically
              deleted after processing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

