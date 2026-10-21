/** @type {import('next').NextConfig} */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://*.cloudflareinsights.com https://cloudflareinsights.com",
  "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://*.cloudflareinsights.com https://cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://gis.bnpb.go.id https://*.tile.opentopomap.org https://flagcdn.com https://*.tile.stamen.com https://*.stadiamaps.com https://purecatamphetamine.github.io https://*.inaturalist.org https://static.inaturalist.org https://inaturalist-open-data.s3.amazonaws.com https://*.gbif.org https://inaturalist-open-data.s3.amazonaws.com",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://gis.bnpb.go.id https://*.tile.opentopomap.org https://cloudflareinsights.com https://*.cloudflareinsights.com https://static.cloudflareinsights.com https://sipkk-new.mediaciptainformasi.co.id https://opsroom.sipongidata.my.id https://router.project-osrm.org https://nominatim.openstreetmap.org https://api.gbif.org",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https://lookerstudio.google.com https://datastudio.google.com",
  "frame-ancestors 'self'",
].join('; ');

// SKDR: copied from NLP-PENYAKIT next.config.mjs (same CSP). Base path and backend URL come from env.
const backend = process.env.BACKEND_INTERNAL_URL;
if (!backend) console.warn('[skdr] BACKEND_INTERNAL_URL is not set; API proxy disabled');

const nextConfig = {
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  experimental: {
    proxyTimeout: 90_000,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: cspDirectives }] }];
  },
  async redirects() {
    return [
      // PR 016: '/' is now the Beranda (app/page.tsx) and '/tv' the MODE TV placeholder (app/tv/page.tsx).
    ];
  },
  async rewrites() {
    if (!backend) return [];
    return [
      { source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` },
      { source: '/api/auth/:path*', destination: `${backend}/api/auth/:path*` },
    ];
  },
};

export default nextConfig;
