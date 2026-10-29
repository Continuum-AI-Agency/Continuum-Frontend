'use client';

// The `campaign_structure` block key: a structure drawing addressed as a block, for a surface
// that renders blocks rather than message parts (the P3 analysis panel). It carries the same
// payload as the `paid.campaign_structure` frame under `structure`, and an unknown or broken
// one degrades exactly as the part does — to the outline, or to nothing.

import { campaignStructureOf } from '@/lib/jaina/uiMessageProjection';
import { JainaCampaignStructure } from './JainaCampaignStructure';

export default function CampaignStructureBlock({ block }: { block: { structure?: unknown } }) {
  const structure = campaignStructureOf(block.structure);
  return structure ? <JainaCampaignStructure structure={structure} /> : null;
}
