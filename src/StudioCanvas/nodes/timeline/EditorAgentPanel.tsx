'use client';

import { Send } from 'lucide-react';
import { useState } from 'react';
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
      aria-label="Video Editor agent"
    >
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">Editor agent</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Gemini 3.8 Flash · edits this project’s timeline
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Try “Slow the opening zoom,” “Trim scene two by a second,” or “Add a title over the
            payoff.”
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
        {sending ? <p className="text-xs text-muted-foreground">Inspecting the timeline…</p> : null}
      </div>
      <form
        className="space-y-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Describe an edit…"
          aria-label="Ask the Video Editor agent"
          rows={3}
          disabled={sending}
        />
        <Button type="submit" size="sm" className="w-full" disabled={sending || !draft.trim()}>
          <Send className="size-3.5" /> Apply edit
        </Button>
      </form>
    </aside>
  );
}
