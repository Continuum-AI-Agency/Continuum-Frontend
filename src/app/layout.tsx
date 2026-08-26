import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { VersionBanner } from '@/components/version-banner';
import { ThemeProvider } from '../components/theme-provider';

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
        var storedValue = localStorage.getItem('theme');
        var stored = storedValue;
        try { stored = storedValue ? JSON.parse(storedValue) : null; } catch (_) {}
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var appearance = stored === 'dark'
          ? 'dark'
          : stored === 'system'
            ? (prefersDark ? 'dark' : 'light')
            : 'light';
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} light`}
      data-theme="light"
      style={{ colorScheme: 'light' }}
    >
      <head>
        <NoFlashScript />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <VersionBanner />
          <div className="relative z-10">{children}</div>
        </ThemeProvider>
        {/* Both call `useParams()`/`useSearchParams()` to report the parameterized route pattern.
            Under Cache Components that reads URL data during prerender, so every dynamic route lost
            its static shell to CLIENT_HOOK_DYNAMIC. A `<Suspense>` boundary here does not clear it
            (measured). Neither reports anything before hydration anyway, so gate them on mount. */}
        <ClientOnly>
          <Analytics />
          <SpeedInsights />
        </ClientOnly>
      </body>
    </html>
  );
}
