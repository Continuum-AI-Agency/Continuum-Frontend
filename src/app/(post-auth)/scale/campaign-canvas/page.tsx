import CampaignFlowCanvasPage from '@/CampaignCanvas';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = {
  title: 'Campaign Flow Canvas | Continuum',
  description: 'Build and manage your Meta advertising campaigns visually with AI assistance.',
};

export default function Page() {
  return <CampaignFlowCanvasPage />;
}
