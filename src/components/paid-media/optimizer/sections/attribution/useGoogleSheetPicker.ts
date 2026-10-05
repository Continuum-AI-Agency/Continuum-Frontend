'use client';

// Choosing a Google Sheet with the Drive picker the Backend already serves
// (GET /integrations/google-drive/picker → a popup that posts `documents:linked` back to its
// opener). The popup answers with the file's id and type; anything that is not a Google Sheet
// is refused here, by name, before the mapping step tries to read it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { startGoogleDrivePicker } from '@/lib/api/integrations';

export const SHEET_PICKER_CONTEXT = 'optimizer-attribution-sheet';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export type PickedSheet = { spreadsheetId: string; name: string };

type PickerMessage = {
  type?: unknown;
  provider?: unknown;
  state?: unknown;
  fileId?: unknown;
  name?: unknown;
  mimeType?: unknown;
  message?: unknown;
};

/** The popup's message → a picked sheet, an error sentence, or null when it is not ours. */
export function readPickerMessage(
  data: unknown,
  state: string,
): { sheet: PickedSheet } | { error: string } | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as PickerMessage;
  if (message.provider !== 'google-drive' || message.state !== state) return null;
  if (message.type === 'documents:error') {
    return {
      error:
        typeof message.message === 'string'
          ? message.message
          : 'The Drive picker closed with an error.',
    };
  }
  if (message.type !== 'documents:linked') return null;
  if (message.mimeType !== GOOGLE_SHEET_MIME || typeof message.fileId !== 'string') {
    return { error: 'That file is not a Google Sheet. Pick a spreadsheet, or upload a CSV.' };
  }
  return {
    sheet: {
      spreadsheetId: message.fileId,
      name: typeof message.name === 'string' ? message.name : 'Google Sheet',
    },
  };
}

export function useGoogleSheetPicker(brandId: string, onPicked: (sheet: PickedSheet) => void) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const stateRef = useRef<string | null>(null);
  const onPickedRef = useRef(onPicked);
  onPickedRef.current = onPicked;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const state = stateRef.current;
      if (!state) return;
      const result = readPickerMessage(event.data, state);
      if (!result) return;
      stateRef.current = null;
      if ('error' in result) setError(result.error);
      else onPickedRef.current(result.sheet);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const open = useCallback(async () => {
    setError(null);
    setOpening(true);
    try {
      const { url, state } = await startGoogleDrivePicker({
        brandId,
        callbackUrl: window.location.href,
        context: SHEET_PICKER_CONTEXT,
      });
      stateRef.current = state;
      window.open(url, 'continuum-sheet-picker', 'width=720,height=640');
    } catch {
      setError('The Drive picker could not open. Paste the sheet link instead.');
    } finally {
      setOpening(false);
    }
  }, [brandId]);

  return { open, opening, error };
}
