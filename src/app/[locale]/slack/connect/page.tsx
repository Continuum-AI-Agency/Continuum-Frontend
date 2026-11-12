import { Suspense } from 'react';
import { SlackConnectClaim } from '@/components/slack/SlackConnectClaim';

// Public on purpose: a Slack admin who installs Continuum may have no Continuum account, so
// this route stays out of proxy-config's isProtectedRoute and signs in from inside the page.

type SlackConnectSearchParams = Record<string, string | string[] | undefined>;

type SlackConnectPageProps = {
  searchParams?: Promise<SlackConnectSearchParams>;
};

const firstParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? null;

async function SlackConnect({ searchParams }: SlackConnectPageProps) {
  const query = (await searchParams) ?? {};
  return <SlackConnectClaim claim={firstParam(query.claim)} error={firstParam(query.error)} />;
}

export default function SlackConnectPage(props: SlackConnectPageProps) {
  return (
    <Suspense fallback={null}>
      <SlackConnect {...props} />
    </Suspense>
  );
}
