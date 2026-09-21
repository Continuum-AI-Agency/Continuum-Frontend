'use client';

// The Saved view of the Inspiration Library: every competitor post saved to the
// brand's Library (tracked, searched, or pasted), with the metrics captured when
// it was saved. Pasting any public Instagram post URL saves it here, so a post
// from an account nobody tracks can still be analysed and developed.

import { Link2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSavedInspirationPosts, useSaveInspirationUrl } from '@/lib/api/competitorSpy';
import { ApiError } from '@/lib/api/errors';
import { FilterablePostGrid } from './CompetitorPostGrid';
import type { CompetitorPostView } from './competitorPostView';

const SAVE_URL_ERRORS: Record<string, string> = {
  instagram_url_invalid: 'That is not an Instagram post or reel link.',
  instagram_post_not_found:
    'Instagram did not return that post. It may be private, deleted, or from a personal account.',
};

function saveUrlErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.code ?? error.message;
    return SAVE_URL_ERRORS[code] ?? error.message;
  }
  return 'Could not save that post. Try again.';
}

function PasteUrlForm({ brandId }: { brandId: string }) {
  const [url, setUrl] = useState('');
  const save = useSaveInspirationUrl(brandId);

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const clean = url.trim();
        if (!clean) return;
        save.mutate(clean, { onSuccess: () => setUrl('') });
      }}
    >
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste an Instagram post or reel link"
            aria-label="Instagram post URL"
            className="h-8 pl-8 text-sm"
            disabled={save.isPending}
          />
        </div>
        <Button type="submit" size="sm" disabled={save.isPending || url.trim().length === 0}>
          {save.isPending ? 'Saving…' : 'Save post'}
        </Button>
      </div>
      {save.isError ? (
        <p data-testid="save-url-error" className="text-xs text-destructive">
          {saveUrlErrorText(save.error)}
        </p>
      ) : null}
      {save.data ? (
        <p
          data-testid="save-url-result"
          className="text-xs text-muted-foreground"
          aria-live="polite"
        >
          {save.data.alreadyExisted ? 'Already saved: ' : 'Saved: '}@
          {save.data.post.instagramUsername}
        </p>
      ) : null}
    </form>
  );
}

export function SavedInspiration({
  brandId,
  gridClassName,
  compact = false,
  renderActions,
}: {
  brandId: string;
  gridClassName?: string;
  compact?: boolean;
  renderActions?: (view: CompetitorPostView) => ReactNode;
}) {
  const saved = useSavedInspirationPosts(brandId);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PasteUrlForm brandId={brandId} />
      <FilterablePostGrid
        brandId={brandId}
        showFilters={!compact}
        views={saved.data ?? []}
        isLoading={saved.isLoading}
        isError={saved.isError}
        errorText="Saved posts are unavailable right now."
        gridClassName={gridClassName}
        renderActions={renderActions}
        emptyText="Nothing saved yet. Save a post from the feed, or paste a link above."
      />
    </div>
  );
}
