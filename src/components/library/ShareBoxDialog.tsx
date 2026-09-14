'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  url: string | null;
  onOpenChange: (open: boolean) => void;
};

export function ShareBoxDialog({ open, url, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share box</DialogTitle>
          <DialogDescription>
            Anyone with the link can review this box. Copy it, send it, revoke it later from the
            asset or collection.
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 text-xs"
            />
            <Button type="button" size="sm" onClick={() => void copy()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Creating link…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
