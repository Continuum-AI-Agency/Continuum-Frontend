import { Link2Off } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ShareUnavailableReason } from './loadSharePayload';

const MESSAGES: Record<ShareUnavailableReason, string> = {
  missing: "This share link doesn't exist or is no longer available.",
  revoked: 'This share link was revoked by its owner.',
  expired: 'This share link has expired.',
};

export function ShareUnavailableCard({ reason }: { reason: ShareUnavailableReason }) {
  const uiText = useTranslations('public');
  return (
    <div
      data-share-unavailable={reason}
      className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 px-8 py-12 text-center"
    >
      <Link2Off className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-base font-semibold text-foreground">
        {uiText('link_unavailable_8ccf202')}
      </h1>
      <p className="text-sm text-muted-foreground">{MESSAGES[reason]}</p>
    </div>
  );
}
