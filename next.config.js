const DEFAULT_BASE_PATH = '/HdMImageVideo';

const normaliseBasePath = (value = DEFAULT_BASE_PATH) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
};

const basePath = normaliseBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? DEFAULT_BASE_PATH);
const hasBasePath = basePath.length > 0;

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(hasBasePath
    ? {
        basePath,
        assetPrefix: `${basePath}/`,
      }
    : {}),

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },

  // Image optimization settings
  images: {
    unoptimized: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleapis.com',
      },
    ],
  },

  // Output configuration
  output: 'standalone',

  // Experimental features
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;

