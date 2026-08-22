'use client';

import { useEffect } from 'react';

// Lightweight mock popup that simulates selecting a document from an external
// integration and posts a message back to the opener window. In production
// this will be replaced by each provider's picker/auth flow.
export default function MockDocumentPicker({ source }: { source: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const payload: {
        type: string;
        source: string;
        name: string;
        externalUrl?: string;
      } = {
        type: 'documents:linked',
        source,
        name: `Sample from ${source}`,
      };

      // For Google Drive, include a realistic download URL using alt=media
      // See: https://developers.google.com/workspace/drive/api/guides/manage-downloads
      if (source === 'google-drive') {
        const mockFileId = 'drive_mock_file_id';
        payload.externalUrl = `https://www.googleapis.com/drive/v3/files/${mockFileId}?alt=media`;
      }

      try {
        window.opener?.postMessage(payload, window.location.origin);
      } catch {
        // ignore cross-window post errors in mock context
      }
      window.close();
    }, 900);

    return () => clearTimeout(timer);
  }, [source]);

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
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Selecting from {source}…</div>
        <div style={{ color: '#666' }}>This window will close automatically.</div>
      </div>
    </div>
  );
}
