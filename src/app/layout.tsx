import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { VersionBanner } from '@/components/version-banner';
import type { ThemeAppearance } from '@/lib/theme/themeDom';
import { ThemeProvider } from '../components/theme-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Continuum AI',
  description: 'Continuum AI – Build, orchestrate, and ship Marketing experiences fast.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

function NoFlashScript() {
  const script = `
    (function() {
      try {
        var cookieMatch = document.cookie.match(/(?:^|; )appearance=(dark|light)/);
        var cookieAppearance = cookieMatch ? cookieMatch[1] : null;
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var appearance = cookieAppearance
          || (stored === 'dark'
            ? 'dark'
            : stored === 'system'
              ? (prefersDark ? 'dark' : 'light')
              : 'light');
        var root = document.documentElement;
        if (appearance === 'dark') {
          root.setAttribute('data-theme', 'dark');
          root.style.colorScheme = 'dark';
          root.classList.remove('light');
          root.classList.add('dark');
        } else {
          root.setAttribute('data-theme', 'light');
          root.style.colorScheme = 'light';
          root.classList.remove('dark');
          root.classList.add('light');
        }
      } catch (_) {}
    })();
  `;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Inline theme bootstrapping prevents auth-page theme flash before React hydrates.
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieAppearance = cookieStore.get('appearance')?.value;
  const initialAppearance: ThemeAppearance = cookieAppearance === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={initialAppearance}
      data-theme={initialAppearance === 'dark' ? 'dark' : 'light'}
      style={{ colorScheme: initialAppearance === 'dark' ? 'dark' : 'light' }}
    >
      <head>
        <NoFlashScript />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider initialAppearance={initialAppearance}>
          <VersionBanner />
          <div className="relative z-10">{children}</div>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
