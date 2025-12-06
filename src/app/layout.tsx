import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@radix-ui/themes/styles.css";
import { ThemeProvider } from "../components/theme-provider";
import GalaxyBackground from "../components/ui/GalaxyBackground";
import { ToastProvider } from "../components/ui/ToastProvider";
import { ReactQueryProvider } from "../lib/react-query/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Continuum AI",
  description: "Continuum AI – Build, orchestrate, and ship Marketing experiences fast.",
};

function NoFlashScript() {
  const script = `
    (function() {
      try {
        var cookieMatch = document.cookie.match(/(?:^|; )appearance=(dark|light)/);
        var cookieAppearance = cookieMatch ? cookieMatch[1] : null;
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var appearance = cookieAppearance || (stored === 'dark' || (!stored && prefersDark) ? 'dark' : 'light');
        var root = document.documentElement;
        if (appearance === 'dark') {
          root.setAttribute('data-theme', 'dark');
          root.style.colorScheme = 'dark';
        } else {
          root.setAttribute('data-theme', 'light');
          root.style.colorScheme = 'light';
        }
      } catch (_) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieAppearance = cookieStore.get("appearance")?.value;
  const initialAppearance = cookieAppearance === "dark" || cookieAppearance === "light" ? cookieAppearance : undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={initialAppearance === "dark" ? "dark" : "light"}
      style={{ colorScheme: initialAppearance === "dark" ? "dark" : "light" }}
    >
      <head>
        <NoFlashScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider initialAppearance={initialAppearance}>
          <ReactQueryProvider>
            <ToastProvider>
              <GalaxyBackground intensity={1} speed="glacial" />
              <div className="relative z-10">
                {children}
              </div>
            </ToastProvider>
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
