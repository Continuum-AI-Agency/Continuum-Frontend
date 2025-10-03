import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@radix-ui/themes/styles.css";
import { ThemeProvider } from "../components/theme-provider";
import ThemeToggle from "../components/theme-toggle";
import GalaxyBackground from "../components/ui/GalaxyBackground";

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
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var appearance = stored === 'dark' || (!stored && prefersDark) ? 'dark' : 'light';
        var root = document.documentElement;
        if (appearance === 'dark') {
          root.setAttribute('data-theme', 'dark');
          root.style.colorScheme = 'dark';
        } else {
          root.removeAttribute('data-theme');
          root.style.colorScheme = 'light';
        }
      } catch (_) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <NoFlashScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <GalaxyBackground intensity={1} speed="glacial" />
          <div className="wave-background">
            <div className="wave-layer layer-1" />
            <div className="wave-layer layer-2" />
            <div className="wave-layer layer-3" />
          </div>
          <div className="fixed top-4 right-4 z-50">
            <ThemeToggle />
          </div>
          <div className="relative z-10">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
