'use client';
import { CircleCheck, ExternalLink } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { OrganicAccountProfile } from '@/lib/schemas/organicMetrics';

type OrganicAccountProfileHeaderProps = {
  profile: OrganicAccountProfile;
  platformLabel: string;
};

function initialsFrom(displayName?: string | null, username?: string | null): string {
  const source = displayName?.trim() || username?.trim() || '';
  if (!source) return '?';
  const words = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * The connected account's public identity, shown above its metrics so the
 * numbers are attributable to a visible account rather than an opaque id.
 * Every field is optional: platforms differ in what they expose, and the header
 * renders whatever subset it is given.
 */
export function OrganicAccountProfileHeader({
  profile,
  platformLabel,
}: OrganicAccountProfileHeaderProps) {
  const { displayName, username, avatarUrl, bio, profileUrl, isVerified } = profile;

  const hasIdentity = Boolean(displayName || username || avatarUrl);
  if (!hasIdentity) return null;

  return (
    <section
      aria-label={`${platformLabel} account profile`}
      className="mb-2 flex items-start gap-3 rounded-xl border border-border bg-card/50 p-3"
    >
      <Avatar className="h-12 w-12 shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback>{initialsFrom(displayName, username)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {displayName ? (
            <span className="truncate font-semibold text-foreground">{displayName}</span>
          ) : null}
          {isVerified ? (
            <CircleCheck className="h-4 w-4 shrink-0 text-sky-500" aria-label="Verified account" />
          ) : null}
        </div>

        {username ? <p className="truncate text-sm text-muted-foreground">@{username}</p> : null}

        {bio ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground whitespace-pre-line">
            {bio}
          </p>
        ) : null}
      </div>

      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 self-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          View on {platformLabel}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </section>
  );
}
