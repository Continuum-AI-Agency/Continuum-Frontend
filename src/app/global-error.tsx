'use client';

import { useEffect, useState } from 'react';
import { matchBrowserLocale } from '@/i18n/browserLocale';
import { isUiLocale, localeCookieName, type UiLocale } from '@/i18n/config';
import en from '@/i18n/emergency/en.json';
import es from '@/i18n/emergency/es.json';
import pt from '@/i18n/emergency/pt-BR.json';

const emergencyMessages = { en, 'pt-BR': pt, es };

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<UiLocale>('en');
  useEffect(() => {
    const stored = document.cookie
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${localeCookieName}=`))
      ?.slice(localeCookieName.length + 1);
    setLocale(isUiLocale(stored) ? stored : matchBrowserLocale(navigator.languages.join(',')));
  }, []);
  const text = emergencyMessages[locale];
  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#09090b',
          color: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: '#3f3f46',
              marginBottom: 16,
            }}
          >
            500
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{text.title}</h1>
          <p style={{ fontSize: 14, color: '#a1a1aa', marginBottom: 32 }}>{text.description}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 40,
              padding: '0 24px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#5A48F9',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {text.reload}
          </button>
        </div>
      </body>
    </html>
  );
}
