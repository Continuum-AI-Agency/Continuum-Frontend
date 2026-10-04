export type PublishedPostRow = {
  brand_id: string;
  caption: string | null;
  content_snapshot: unknown;
  created_at: string;
  draft_id: string | null;
  ig_user_id: string | null;
  instagram_post_id: string | null;
  media_urls: unknown;
  permalink: string | null;
  platform: string;
  platform_account_id: string;
  platform_post_id: string;
  post_type: string;
  published_at: string;
};

const PUBLISHED_POST_PAGE_SIZE = 1000;

export async function fetchPublishedPostPages(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ data: PublishedPostRow[] | null; error: { message: string } | null }>,
): Promise<{ rows: PublishedPostRow[]; error: { message: string } | null }> {
  const rows: PublishedPostRow[] = [];
  for (let offset = 0; ; offset += PUBLISHED_POST_PAGE_SIZE) {
    const { data, error } = await fetchPage(offset, offset + PUBLISHED_POST_PAGE_SIZE - 1);
    if (error) return { rows: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PUBLISHED_POST_PAGE_SIZE) return { rows, error: null };
  }
}
