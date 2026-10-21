/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_INTERNAL_URL;
if (!backend) {
  console.warn('[skdr] BACKEND_INTERNAL_URL is not set; /api/v1 proxy disabled');
}

const nextConfig = {
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  images: { unoptimized: true },
  async rewrites() {
    if (!backend) return [];
    return [{ source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` }];
  },
};

export default nextConfig;
