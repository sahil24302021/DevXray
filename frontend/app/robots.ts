import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dev-xray.vercel.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/about',
          '/pricing',
          '/how-we-score',
          '/report/',
          '/contact',
          '/signin',
          '/signup',
        ],
        disallow: [
          '/dashboard',
          '/candidates',
          '/compare',
          '/job-match',
          '/bulk-upload',
          '/settings',
          '/api/',
          '/auth/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
