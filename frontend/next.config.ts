import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'http://10.0.2.2',
    'http://localhost',
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://saascarcare-production.up.railway.app/api/:path*',
      },
    ]
  },
}

export default nextConfig