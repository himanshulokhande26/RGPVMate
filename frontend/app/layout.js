import './globals.css';

export const metadata = {
  title: 'RGPVMate — AI Study Companion for RGPV Students',
  description: 'Instant PYQ retrieval, syllabus explorer, exam notices, and AI-powered concept explanations for RGPV engineering students.',
  keywords: 'RGPV, PYQ, syllabus, engineering, AI, study, exam, previous year questions',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
