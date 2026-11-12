'use client';

import { Send } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
import { appendDictation, DictationButton } from '@/components/dictation/DictationButton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sendVideoProjectAgentTurn } from '@/lib/api/videoProjects.client';

type Message = { role: 'user' | 'assistant'; content: string };

export function EditorAgentPanel({
  projectId,
  onApplied,
}: {
  projectId: string;
  onApplied: (beforeRevision: number) => Promise<void>;
}) {
  const translateUi = useUiTranslations('studio');

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    const history = messages.slice(-10);
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setDraft('');
    setSending(true);
    try {
      const result = await sendVideoProjectAgentTurn(projectId, { message, history });
      setMessages((current) => [...current, { role: 'assistant', content: result.reply }]);
      if (result.revisionBeforeEdits !== undefined) await onApplied(result.revisionBeforeEdits);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: error instanceof Error ? error.message : 'The editor agent could not finish.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      className="flex h-full w-full shrink-0 flex-col border-l border-border bg-card md:w-80"
      aria-label={translateUi('video_editor_agent_9d726b34')}
    >
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">{translateUi('editor_agent_acb612aa')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {' '}
          {translateUi('gemini_3_8_flash_edits_this_project_3ff2fe5f')}{' '}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {' '}
            {translateUi('try_slow_the_opening_zoom_trim_scen_b9486276')}{' '}
          </p>
        ) : (
          messages.map((message, index) => (
            <p
              key={`${index}:${message.role}`}
              className={`rounded-lg p-2 text-xs ${message.role === 'user' ? 'bg-primary/10' : 'bg-muted'}`}
            >
              {message.content}
            </p>
          ))
        )}
        {sending ? (
          <p className="text-xs text-muted-foreground">
            {translateUi('inspecting_the_timeline_f63fc120')}
          </p>
        ) : null}
      </div>
      <form
        className="space-y-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="relative">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={translateUi('describe_an_edit_cd801bc5')}
            aria-label={translateUi('ask_the_video_editor_agent_c2c8b0d1')}
            rows={3}
            disabled={sending}
            className="pr-9"
          />
          <DictationButton
            className="absolute right-1 top-1"
            disabled={sending}
            onTranscript={(spoken) => setDraft((current) => appendDictation(current, spoken))}
          />
        </div>
        <Button type="submit" size="sm" className="w-full" disabled={sending || !draft.trim()}>
          <Send className="size-3.5" /> {translateUi('apply_edit_d539998e')}{' '}
        </Button>
      </form>
    </aside>
  );
}
