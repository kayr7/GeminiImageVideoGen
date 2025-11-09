/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/HdMImageVideo',
  assetPrefix: '/HdMImageVideo/',
  
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_BASE_PATH: '/HdMImageVideo',
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

