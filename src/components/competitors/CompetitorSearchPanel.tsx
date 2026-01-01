"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  Heading,
  Separator,
  Spinner,
  Text,
  TextField,
  Select,
} from "@radix-ui/themes";
import { ArrowLeftIcon, ClockIcon, MagnifyingGlassIcon, ReloadIcon } from "@radix-ui/react-icons";

import {
  addSavedCompetitorAction,
  getCompetitorDashboardAction,
  listSavedCompetitorsAction,
  refreshCompetitorCacheAction,
  removeSavedCompetitorAction,
} from "@/lib/actions/competitors";
import type { CompetitorDashboard, CompetitorPost, CompetitorSavedProfile } from "@/lib/schemas/competitors";
import { CompetitorPostCard } from "./CompetitorPostCard";

type SortOption =
  | "recent-desc"
  | "recent-asc"
  | "likes-desc"
  | "likes-asc"
  | "views-desc"
  | "views-asc"
  | "engagement-desc"
  | "engagement-asc";

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function calculateEngagement(post: CompetitorPost) {
  if (!post.views || post.views === 0) return 0;
  return ((post.likesCount + post.commentsCount) / post.views) * 100;
}

function sortPosts(posts: CompetitorPost[], sortBy: SortOption) {
  const sorted = [...posts];
  switch (sortBy) {
    case "recent-asc":
      return sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    case "recent-desc":
      return sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    case "likes-asc":
      return sorted.sort((a, b) => a.likesCount - b.likesCount);
    case "likes-desc":
      return sorted.sort((a, b) => b.likesCount - a.likesCount);
    case "views-asc":
      return sorted.sort((a, b) => (a.views ?? 0) - (b.views ?? 0));
    case "views-desc":
      return sorted.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    case "engagement-asc":
      return sorted.sort((a, b) => calculateEngagement(a) - calculateEngagement(b));
    case "engagement-desc":
      return sorted.sort((a, b) => calculateEngagement(b) - calculateEngagement(a));
    default:
      return posts;
  }
}


export function CompetitorSearchPanel({ brandId }: { brandId?: string }) {
  const [username, setUsername] = useState("");
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<CompetitorDashboard | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent-desc");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CompetitorSavedProfile[]>([]);
  const [isSavedLoading, setIsSavedLoading] = useState(false);

  const sortedPosts = useMemo(() => {
    if (!dashboard?.posts) return [];
    return sortPosts(dashboard.posts, sortBy);
  }, [dashboard?.posts, sortBy]);

  useEffect(() => {
    if (!brandId) return;
    setIsSavedLoading(true);
    listSavedCompetitorsAction(brandId)
      .then(setSaved)
      .catch(() => setSaved([]))
      .finally(() => setIsSavedLoading(false));
  }, [brandId]);

useEffect(() => {
  if (!dashboard || dashboard.status !== "scraping" || !activeUsername) return;

  const interval = setInterval(async () => {
    const result = await getCompetitorDashboardAction(activeUsername);
    if (result.status === "success") {
      setDashboard(result);
      clearInterval(interval);
    } else if (result.status === "error") {
      setError(result.message ?? "Unable to refresh competitor data.");
      clearInterval(interval);
    }
  }, 10_000);

  return () => clearInterval(interval);
}, [dashboard, activeUsername]);

const runSearch = async (force = false, overrideUsername?: string) => {
    const candidate = overrideUsername ?? username;
    if (!candidate.trim()) {
      setError("Enter an Instagram handle to search.");
      return;
    }
    const clean = candidate.replace(/^@/, "").trim();
    setIsLoading(true);
    setError(null);
    setActiveUsername(clean);
    try {
      const result = await getCompetitorDashboardAction(clean, { force });
      if (result.status === "error") {
        setError(result.message ?? "Unable to load competitor data.");
      } else {
        setDashboard(result);
        setError(null);
        if (brandId) {
          await addSavedCompetitorAction(clean, brandId);
          const next = await listSavedCompetitorsAction(brandId);
          setSaved(next);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error fetching competitor data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!activeUsername) return;
    setIsRefreshing(true);
    try {
      await refreshCompetitorCacheAction(activeUsername);
      await runSearch(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const cacheBadge = dashboard?.cacheAgeSeconds ? (
    <Badge color={dashboard.cacheAgeSeconds > 45 * 60 ? "amber" : "gray"} variant="surface">
      <ClockIcon className="mr-1 h-3.5 w-3.5" />
      Cached {Math.floor(dashboard.cacheAgeSeconds / 60)}m ago
    </Badge>
  ) : null;

  const renderError = () => {
    if (!error) return null;
    const lower = error.toLowerCase();
    let title = "Unable to load competitor";
    let hint = "Try again in a minute.";
    if (lower.includes("private")) {
      title = "Profile is private";
      hint = "Competitor analysis requires a public profile.";
    } else if (lower.includes("not found") || lower.includes("404")) {
      title = "Profile not found";
      hint = "Check the handle and try again.";
    } else if (lower.includes("rate") || lower.includes("limit")) {
      title = "Temporarily rate limited";
      hint = "Wait a few minutes before retrying.";
    }
    return (
      <Callout.Root color="red" variant="surface">
        <Callout.Icon>
          <ArrowLeftIcon />
        </Callout.Icon>
        <Callout.Text>
          {title}: {error} {hint}
        </Callout.Text>
      </Callout.Root>
    );
  };

  return (
    <Box className="space-y-4">
      <Flex align="center" gap="3" wrap="wrap">
        <TextField.Root
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Search competitor @username"
          className="min-w-[260px]"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              runSearch();
            }
          }}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
        <Flex gap="2">
          <Button onClick={() => runSearch()} disabled={isLoading}>
            {isLoading ? <Spinner loading /> : null}
            Search
          </Button>
          <Button onClick={handleRefresh} disabled={!activeUsername || isRefreshing} variant="outline">
            {isRefreshing ? <Spinner loading /> : <ReloadIcon />}
            Refresh
          </Button>
        </Flex>
        {dashboard && dashboard.status === "scraping" && (
          <Badge color="amber" variant="soft">
            Fetching fresh data…
          </Badge>
        )}
        {cacheBadge}
      </Flex>

      {error && (
        renderError()
      )}

      {brandId && (
        <Box className="space-y-2 rounded-lg border border-border/60 bg-[var(--panel)] p-3">
          <Heading size="3">Saved competitors</Heading>
          {isSavedLoading ? (
            <Spinner loading />
          ) : saved.length === 0 ? (
            <Text size="2" color="gray">
              No saved competitors yet. Searches will be saved automatically.
            </Text>
          ) : (
            <Flex direction="column" gap="2">
              {saved.map((item) => (
                <Flex key={item.username} align="center" justify="between" gap="2">
                  <Flex align="center" gap="2">
                    {item.profilePicUrl ? (
                      <Image
                        src={item.profilePicUrl}
                        alt={item.username}
                        width={32}
                        height={32}
                        unoptimized
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <Box className="h-8 w-8 rounded-full bg-[var(--muted)]" />
                    )}
                    <Box>
                      <Text weight="medium">@{item.username}</Text>
                      {item.cacheAgeSeconds && (
                        <Text size="1" color="gray">
                          Cached {Math.floor(item.cacheAgeSeconds / 60)}m ago
                        </Text>
                      )}
                    </Box>
                  </Flex>
                  <Flex gap="2">
                    <Button size="1" variant="outline" onClick={() => runSearch(false, item.username)}>
                      View
                    </Button>
                    <Button
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={async () => {
                        await removeSavedCompetitorAction(item.username, brandId);
                        const next = await listSavedCompetitorsAction(brandId);
                        setSaved(next);
                      }}
                    >
                      Remove
                    </Button>
                  </Flex>
                </Flex>
              ))}
            </Flex>
          )}
        </Box>
      )}

      {dashboard?.status === "success" && dashboard.profile && (
        <Box className="space-y-3 rounded-lg border border-border/60 bg-[var(--panel)] p-4">
          <Flex align="center" justify="between" wrap="wrap" gap="3">
            <Flex align="center" gap="3">
              {dashboard.profile.profilePicUrl ? (
                <Image
                  src={dashboard.profile.profilePicUrl}
                  alt={dashboard.profile.username}
                  width={48}
                  height={48}
                  unoptimized
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <Box className="h-12 w-12 rounded-full bg-[var(--muted)]" />
              )}
              <Box>
                <Heading size="4" className="text-white">
                  @{dashboard.profile.username}
                </Heading>
                <Text size="2" color="gray">
                  {formatNumber(dashboard.profile.followersCount)} followers
                </Text>
                {dashboard.profile.biography && (
                  <Text size="2" color="gray" className="block max-w-xl">
                    {dashboard.profile.biography}
                  </Text>
                )}
              </Box>
            </Flex>
            <Flex gap="2" align="center">
              {cacheBadge}
            </Flex>
          </Flex>

          <Separator size="4" />

          <Flex gap="3" wrap="wrap">
            <Badge color="gray" variant="surface">Posts: {dashboard.posts.length}</Badge>
            <Badge color="gray" variant="surface">
              Avg likes: {
                dashboard.posts.length > 0
                  ? formatNumber(
                      Math.round(
                        dashboard.posts.reduce((sum, post) => sum + post.likesCount, 0) / dashboard.posts.length
                      )
                    )
                  : "0"
              }
            </Badge>
            <Badge color="gray" variant="surface">
              Avg comments: {
                dashboard.posts.length > 0
                  ? formatNumber(
                      Math.round(
                        dashboard.posts.reduce((sum, post) => sum + post.commentsCount, 0) / dashboard.posts.length
                      )
                    )
                  : "0"
              }
            </Badge>
          </Flex>

          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Heading size="4">Recent posts</Heading>
            <Select.Root value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <Select.Trigger placeholder="Sort posts" />
              <Select.Content>
                <Select.Item value="recent-desc">Newest first</Select.Item>
                <Select.Item value="recent-asc">Oldest first</Select.Item>
                <Select.Item value="likes-desc">Likes ↓</Select.Item>
                <Select.Item value="likes-asc">Likes ↑</Select.Item>
                <Select.Item value="views-desc">Views ↓</Select.Item>
                <Select.Item value="views-asc">Views ↑</Select.Item>
                <Select.Item value="engagement-desc">Engagement ↓</Select.Item>
                <Select.Item value="engagement-asc">Engagement ↑</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>

          {sortedPosts.length === 0 ? (
            <Callout.Root color="gray" variant="surface">
              <Callout.Icon>
                <MagnifyingGlassIcon />
              </Callout.Icon>
              <Callout.Text>No posts available for this profile.</Callout.Text>
            </Callout.Root>
          ) : (
            <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3">
              {sortedPosts.map((post) => (
                <CompetitorPostCard key={post.id} post={post} />
              ))}
            </Grid>
          )}
        </Box>
      )}

      {!dashboard && (
        <Callout.Root color="gray" variant="surface">
          <Callout.Icon>
            <MagnifyingGlassIcon />
          </Callout.Icon>
          <Callout.Text>Search a competitor to see their public Instagram performance.</Callout.Text>
        </Callout.Root>
      )}
    </Box>
  );
}

export default CompetitorSearchPanel;
