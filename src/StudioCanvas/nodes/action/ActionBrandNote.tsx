'use client';

// What the node says out loud about the brand values an op resolved.
//
// `ActionNode` is one component for the whole catalog and carries no per-op branches; this is
// the one accessory it renders, and the decision about WHICH ops have something to say lives
// here rather than there. Today that is the burn-in alone: it is the only op whose output is a
// brand DECISION — a face and an ink — rather than a pixel transform, and the only one that can
// substitute a value. A substitute is fine; an unlabelled substitute is not, which is the whole
// reason this badge exists rather than the node quietly rendering a headline in a face nobody
// picked.

import type { ActionId } from '@continuum/contracts';
import { useBrandType } from '@/lib/brands/useBrandType.client';
import { useStudioStore } from '../../stores/useStudioStore';
import { describeHeadlineFaces, resolveHeadlineFaces } from '../../utils/actions/imageText';
import { NodeBadge } from '../NodeChrome';

function BurnInTypeBadge() {
  const brandId = useStudioStore((state) => state.brandId);
  const { inputs, isLoading } = useBrandType(brandId);
  if (isLoading) return null;
  const faces = resolveHeadlineFaces(inputs);
  return (
    <NodeBadge title={describeHeadlineFaces(faces)} data-type-source={faces.source}>
      {faces.family}
      {faces.source === 'fallback' ? ' (no brand face)' : ''}
    </NodeBadge>
  );
}

export function ActionBrandNote({ actionId }: { actionId: ActionId }) {
  return actionId === 'image.text' ? <BurnInTypeBadge /> : null;
}
