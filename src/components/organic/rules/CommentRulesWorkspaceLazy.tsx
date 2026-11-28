'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// The Rules tab mounts only once it is first opened, but the page passes it in as a slot, so a
// static import kept its form stack (~100 KiB) in the planner's first load regardless.
const CommentRulesWorkspaceDynamic = dynamic(
  () =>
    import('@/components/organic/rules/CommentRulesWorkspace').then((m) => ({
      default: m.CommentRulesWorkspace,
    })),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full bg-muted/70" /> },
);

export function CommentRulesWorkspaceLazy(props: {
  brandId: string | null;
  instagramAccountId?: string | null;
}) {
  return <CommentRulesWorkspaceDynamic {...props} />;
}
