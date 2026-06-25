import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useStudioStore } from '../stores/useStudioStore';

const MIN_CHARS = 12;
const DEBOUNCE_MS = 1000;
const TITLE_FUNCTION = 'prompt-title';

const titleResponseSchema = z.object({ title: z.string() });

type UseNodeTitlerArgs = {
  id: string;
  value: string;
  isExecuting: boolean;
};

// Background titler for a prompt box. Watches the box's text and, once it
// settles, asks the `prompt-title` edge function (Gemini Flash-Lite) for a short
// label describing what the box produces, then writes it to the node's `label`.
// Read-only UX — the user never edits the title. Skips while the node is
// executing so it does not fire on every streamed enrichment delta.
export function useNodeTitler({ id, value, isExecuting }: UseNodeTitlerArgs): { isTitling: boolean } {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);

  const [isTitling, setIsTitling] = useState(false);
  const lastTitledRef = useRef<string>('');
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isExecuting) return;

    const trimmed = value.trim();
    if (trimmed.length < MIN_CHARS) return;
    if (value === lastTitledRef.current) return;

    const timeout = setTimeout(() => {
      const seq = (requestSeqRef.current += 1);
      setIsTitling(true);
      void (async () => {
        try {
          const supabase = createSupabaseBrowserClient();
          const { data, error } = await supabase.functions.invoke(TITLE_FUNCTION, {
            body: { prompt: value },
          });
          if (error) throw error;

          if (seq !== requestSeqRef.current) return;
          lastTitledRef.current = value;

          const parsed = titleResponseSchema.safeParse(data);
          const clean = parsed.success ? parsed.data.title.trim() : '';
          if (clean) {
            updateNodeData(id, { label: clean });
            triggerSave();
          }
        } catch {
          // Background UX — never surface titling failures. A later edit retries.
        } finally {
          if (seq === requestSeqRef.current && mountedRef.current) {
            setIsTitling(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [value, isExecuting, id, updateNodeData, triggerSave]);

  return { isTitling };
}
