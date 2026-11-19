'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
import { ShareLinkPanel } from '@/components/library/share/ShareLinkPanel';
import { shareTokenFromUrl } from '@/components/library/share/shareLinkClient';
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
  const translateUi = useUiTranslations('library');

  const [copied, setCopied] = useState(false);
  const token = url ? shareTokenFromUrl(url) : null;

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translateUi('share_box_21c716f6')}</DialogTitle>
          <DialogDescription>
            {' '}
            {translateUi('anyone_with_the_link_can_review_thi_8efa7028')}{' '}
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
              {copied ? translateUi('copied_8d525e5f') : translateUi('copy_e21f935f')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{translateUi('creating_link_26756b8c')}</p>
        )}
        {token ? <ShareLinkPanel by={{ token }} /> : null}
      </DialogContent>
    </Dialog>
  );
}
