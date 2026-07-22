'use client';

import type { UiFetchedPost } from '@continuum/contracts';
import { AgentCardEyebrow, AgentReceipt } from './agentCardKit';
import { PostContentCard } from './PostContentCard';

type Props = {
  posts: UiFetchedPost[];
  label?: string;
};

export function PostContentCardGrid({ posts, label }: Props) {
  if (posts.length === 0) return null;

  return (
    <AgentReceipt className="mt-1 p-3">
      <AgentCardEyebrow
        label={label ?? 'Posts Retrieved'}
        right={<span className="text-xs tabular-nums text-muted-foreground">{posts.length}</span>}
      />
      <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1.5 -mx-1 px-1 [&::-webkit-scrollbar]:hidden">
        {posts.map((post) => (
          <PostContentCard key={post.postId} post={post} />
        ))}
      </div>
    </AgentReceipt>
  );
}
