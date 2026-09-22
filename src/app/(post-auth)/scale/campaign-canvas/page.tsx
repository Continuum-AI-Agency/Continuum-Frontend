import CampaignFlowCanvasPage from '@/CampaignCanvas';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = {
  title: 'Campaign Flow Canvas | Continuum',
  description: 'Build and manage your Meta advertising campaigns visually with AI assistance.',
};

type CampaignCanvasPageProps = {
  /** `?scaffold=<paid_scaffolds.id>` — set by a Jaina scaffold card's "Open on canvas". */
  searchParams: Promise<{ scaffold?: string | string[] }>;
};

export default async function Page({ searchParams }: CampaignCanvasPageProps) {
  const { scaffold } = await searchParams;
  return (
    <CampaignFlowCanvasPage requestedScaffoldId={typeof scaffold === 'string' ? scaffold : null} />
  );
}
