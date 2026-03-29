/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.githubusercontent.com',
      },
    ],
  },
  // Allow API calls to backend during development
  async rewrites() {
    return process.env.NODE_ENV === 'development' ? [] : [];
  },
};

module.exports = nextConfig;
