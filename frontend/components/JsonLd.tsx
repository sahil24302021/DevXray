export default function JsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dev-xray.vercel.app';

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'DevXray AI — GitHub Profile Analyzer & AI Resume Checker',
    alternateName: [
      'GitHub Profile Analyzer',
      'GitHub Profile Checker',
      'Resume Analyzer',
      'ATS Resume Checker',
      'GitHub Analyzer',
      'Developer Screening Tool',
      'AI Code Detector for GitHub',
      'Developer Intelligence Platform',
    ],
    url: baseUrl,
    applicationCategory: 'BusinessApplication, DeveloperApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    description:
      'DevXray is the leading forensic-grade GitHub profile analyzer and AI resume checker. Scan any developer GitHub profile or resume in 60 seconds to evaluate real code quality, detect AI-generated code, verify resume claims, and calculate Developer Trust Scores.',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '1280',
      bestRating: '5',
      worstRating: '1',
    },
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
          description: '2 Free forensic GitHub and Resume scans with full signal preview',
        },
        {
          '@type': 'Offer',
          name: 'Starter Plan',
          price: '999',
          priceCurrency: 'INR',
          description: '30 Candidate scans, AI interview kits, and ATS export',
        },
        {
          '@type': 'Offer',
          name: 'Pro Plan',
          price: '2499',
          priceCurrency: 'INR',
          description: 'Unlimited scans, team seats, API access, and deep AI fraud detection',
        },
      ],
    },
    featureList: [
      'Instant GitHub profile analyzer & commit forensics',
      'AI-generated code detection (ChatGPT / GitHub Copilot)',
      'PDF Resume claims verification against real git commits',
      'ATS compatibility score and job description matcher',
      'Developer Trust Score (0-100) & fraud risk alerts',
      'Candidate competence radar chart across 6 dimensions',
      'Custom technical interview question generator based on code weaknesses',
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is a GitHub profile analyzer?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'A GitHub profile analyzer is an automated developer intelligence tool that scans a programmer’s GitHub profile, repositories, commits, and pull requests to evaluate their actual engineering skills. Unlike vanity metrics like star counts or commit streak squares, a deep analyzer evaluates lines of code written, architecture quality, language mastery, and code authenticity.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does DevXray check GitHub profiles and verify resumes?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'DevXray pulls all public repositories, commits, and pull requests for a given username via the GitHub API. It measures LOC-weighted languages, repository architecture, testing presence, and commit cadence. When a resume is uploaded, DevXray parses technical claims and cross-references them against actual code commits to verify whether the candidate actually authored the technologies they claim.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can DevXray detect AI-generated code (ChatGPT / GitHub Copilot)?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. DevXray features a 12-pattern forensic AI code detector that inspects commits for synthetic code signatures, repetitive LLM docstring formatting, hallucinated dependencies, and bulk automated commit spikes, calculating an AI Contribution Ratio.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is the Developer Trust Score and how is it calculated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Developer Trust Score is a normalized 0–100 score assessing candidate authenticity. It evaluates 5 core dimensions: Code Quality (modularity, testing), Project Impact (real users, starred tools), Commit Authenticity (human commit distribution), Breadth & Depth (mastery of core stack), and Fraud Risk (forks vs original code).',
        },
      },
      {
        '@type': 'Question',
        name: 'Is DevXray free to use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! DevXray provides 2 free comprehensive forensic scans for any user without requiring a credit card. Paid plans are available for technical recruiters, startups, and engineering managers needing high-volume candidate screening and ATS export.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does DevXray compare to traditional ATS resume checkers?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Traditional ATS checkers only perform basic keyword matching on resume text, which candidates easily game with buzzwords. DevXray validates claims against actual GitHub repositories and source code, providing verified proof of engineering competency.',
        },
      },
    ],
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'DevXray AI',
    url: baseUrl,
    logo: `${baseUrl}/devxray-logo.png`,
    sameAs: ['https://github.com/sahil24302021/DevXray'],
    description: 'Developer intelligence platform providing forensic GitHub profiling, AI code detection, and candidate assessment.',
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DevXray AI — GitHub Profile Analyzer',
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
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
