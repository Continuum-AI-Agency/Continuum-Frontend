'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
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
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#a1a1aa', marginBottom: 32 }}>
            An unexpected error occurred. Please try reloading the page.
          </p>
          <button
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
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
