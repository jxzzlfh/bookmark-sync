/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // For static export (GitHub Pages, etc.), change to 'export'
  // output: 'standalone',
  images: {
    // For static export, use unoptimized images
    // unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Transpile shared package
  transpilePackages: ['@bookmark-sync/shared'],
};

module.exports = nextConfig;
