import LinkPlatformClient from "./LinkPlatformClient";

type LinkPlatformPageProps = {
  params: Promise<{ platform: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type LinkPlatformSearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default async function LinkPlatformPage({ params, searchParams }: LinkPlatformPageProps) {
  const emptySearchParams: LinkPlatformSearchParams = {};
  const [{ platform }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(emptySearchParams),
  ]);

  return <LinkPlatformClient platform={platform} token={firstParam(query.token)} />;
}
