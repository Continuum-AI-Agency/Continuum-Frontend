'use client';

import { useEffect } from 'react';

export function PopupStatus({ provider }: { provider: string }) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Connecting {provider}…</div>
        <div style={{ color: '#666' }}>This window will close automatically.</div>
      </div>
    </div>
  );
}

export function MockOAuthPopupContent({
  provider,
  context,
}: {
  provider: string;
  context: string;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.opener?.postMessage(
          {
            type: 'oauth:success',
            provider,
            context,
            accountId: `acct_${provider}`,
          },
          window.location.origin,
        );
      } catch {
        // ignore postMessage errors and allow the popup to close
      }
      window.close();
    }, 1000);
    return () => clearTimeout(timer);
  }, [provider, context]);

  return <PopupStatus provider={provider} />;
}
