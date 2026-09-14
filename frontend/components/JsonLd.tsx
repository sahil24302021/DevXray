export default function JsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dev-xray.vercel.app';

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'DevXray AI',
    alternateName: [
      'GitHub Analyzer',
      'Resume Analyzer',
      'GitHub Profile Checker',
      'GitHub Profile Scanner',
      'Developer Screening Tool',
      'AI Code Checker',
    ],
    url: baseUrl,
    applicationCategory: 'BusinessApplication, DeveloperApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    description:
      'DevXray is a forensic-grade GitHub analyzer and resume analyzer. Scan any developer GitHub profile to evaluate real code quality, detect AI-generated code, verify resume claims, and uncover developer signal.',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: '0',
      highPrice: '2499',
      offerCount: '3',
      offers: [
        {
          '@type': 'Offer',
          name: 'Free Tier',
          price: '0',
          priceCurrency: 'INR',
        },
        {
          '@type': 'Offer',
          name: 'Starter Plan',
          price: '999',
          priceCurrency: 'INR',
        },
        {
          '@type': 'Offer',
          name: 'Pro Plan',
          price: '2499',
          priceCurrency: 'INR',
        },
      ],
    },
    featureList: [
      'GitHub profile deep intelligence scanning',
      'Real code commit quality analysis',
      'AI-generated code detection in repositories',
      'Resume claims cross-referencing against real code',
      'Developer Trust Score & Fraud risk detection',
      'ATS-ready candidate report exports',
      'Radar dimension competence chart',
    ],
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'DevXray AI',
    url: baseUrl,
    logo: `${baseUrl}/devxray-logo.png`,
    sameAs: ['https://github.com/sahil24302021/DevXray'],
    description: 'Developer intelligence platform providing forensic GitHub profiling and candidate assessment.',
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DevXray AI',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/report/{search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
    </>
  );
}
