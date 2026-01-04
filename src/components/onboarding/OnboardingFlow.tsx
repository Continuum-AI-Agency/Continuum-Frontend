"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import {
  CheckCircledIcon,
  ExclamationTriangleIcon,
  ReloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PLATFORMS, PLATFORM_KEYS, type PlatformKey } from "./platforms";
import {
  clearPlatformConnectionAction,
  completeOnboardingAction,
  fetchOnboardingStateAction,
  mutateOnboardingStateAction,
  resetOnboardingStateAction,
  // New real integration actions
  syncIntegrationAccountsAction,
  associateIntegrationAccountsAction,
  registerDocumentMetadataAction,
  enqueueDocumentEmbedAction,
  removeDocumentAction,
} from "@/app/onboarding/actions";
import type {
  BrandVoiceTag,
  OnboardingDocument,
  OnboardingState,
} from "@/lib/onboarding/state";
import { BRAND_VOICE_TAGS } from "@/lib/onboarding/state";
import { openCenteredPopup, waitForPopupMessage, waitForPopupClosed } from "@/lib/popup";
import {
  useStartMetaSync,
  useStartGoogleSync,
  useStartGoogleDrivePicker,
  applyBrandProfileIntegrationAccounts,
} from "@/lib/api/integrations";
import { useToast } from "@/components/ui/ToastProvider";
import { createIntegrationSelectionToastOptions } from "@/lib/ui/integrationSelectionToast";
import { StrategicAnalysisRealtimeListener } from "@/components/strategic-analyses/StrategicAnalysisRealtimeListener";
import { requestStrategicRunsCatchUp } from "@/components/strategic-analyses/realtimeBus";
import { DocumentSourceIcon } from "./PlatformIcons";
import { uploadCreativeAsset, createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import {
  approveOnboardingBrandProfile,
  checkOnboardingAgentHealth,
  runOnboardingPreview,
  agentRunContextSchema,
  type AgentBrandProfile,
  type AgentRequestPayload,
  type BrandVoice as AgentBrandVoice,
  type TargetAudience as AgentTargetAudience,
  type OnboardingPreviewEvent,
  type BusinessSummary,
  type OnboardingPreviewWorkflowResult,
  type RunOnboardingPreviewResult,
  type WebsiteSummary,
  type IntegrationProvider,
} from "@/lib/onboarding/agentClient";
import type { ContinuumEvent } from "@/lib/events/schema";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useContinuumServerEvents } from "@/lib/sse/useContinuumServerEvents";
import { readServerSentEvents } from "@/lib/sse/readServerSentEvents";
import { Tabs } from "@/components/ui/StableTabs";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { Editor, EditorProvider } from "react-simple-wysiwyg";
import { BrandSwitcherMenu } from "@/components/navigation/BrandSwitcherMenu";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import { resolveWebsiteDraftUrl } from "@/lib/onboarding/websiteDraft";
import { resolveSelectableAssetLabel } from "@/components/onboarding/integrations/selectableAssetUtils";
import { useSelectableAssetsState } from "@/components/onboarding/hooks/useSelectableAssetsState";
import { IntegrationsStep } from "@/components/onboarding/steps/IntegrationsStep";
import {
  FACEBOOK_OAUTH_KEYS,
  GOOGLE_OAUTH_KEYS,
} from "@/components/onboarding/integrations/constants";

const industries = [
  "Advertising",
  "E-commerce",
  "Finance",
  "Health & Wellness",
  "Hospitality",
  "Media & Entertainment",
  "SaaS",
  "Technology",
  "Other",
];

const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "GMT-12:00", label: "GMT-12:00" },
  { value: "GMT-11:00", label: "GMT-11:00" },
  { value: "GMT-10:00", label: "GMT-10:00 (HST)" },
  { value: "GMT-09:00", label: "GMT-09:00 (AKST)" },
  { value: "GMT-08:00", label: "GMT-08:00 (PST)" },
  { value: "GMT-07:00", label: "GMT-07:00 (MST/PT)" },
  { value: "GMT-06:00", label: "GMT-06:00 (CST)" },
  { value: "GMT-05:00", label: "GMT-05:00 (EST)" },
  { value: "GMT-04:00", label: "GMT-04:00 (AST/EDT)" },
  { value: "GMT-03:00", label: "GMT-03:00" },
  { value: "GMT-02:00", label: "GMT-02:00" },
  { value: "GMT-01:00", label: "GMT-01:00" },
  { value: "GMT+00:00", label: "GMT+00:00 (UTC)" },
  { value: "GMT+01:00", label: "GMT+01:00 (CET)" },
  { value: "GMT+02:00", label: "GMT+02:00 (EET)" },
  { value: "GMT+03:00", label: "GMT+03:00" },
  { value: "GMT+04:00", label: "GMT+04:00" },
  { value: "GMT+05:00", label: "GMT+05:00" },
  { value: "GMT+05:30", label: "GMT+05:30 (IST)" },
  { value: "GMT+06:00", label: "GMT+06:00" },
  { value: "GMT+07:00", label: "GMT+07:00" },
  { value: "GMT+08:00", label: "GMT+08:00 (CST)" },
  { value: "GMT+09:00", label: "GMT+09:00 (JST)" },
  { value: "GMT+10:00", label: "GMT+10:00 (AEST)" },
  { value: "GMT+11:00", label: "GMT+11:00" },
  { value: "GMT+12:00", label: "GMT+12:00 (NZST)" },
];

const glassPanelStyle: React.CSSProperties = {
  backgroundColor: "var(--glass-bg)",
  borderColor: "var(--glass-border)",
  boxShadow: "var(--glass-shadow)",
};

const glassPanelClassName = "backdrop-blur-xl border";

type PreviewEditMode = {
  voice: boolean;
  audience: boolean;
  website: boolean;
  business: boolean;
};

function normalizeTimezoneValue(input?: string): string {
  if (!input) return "GMT+00:00";
  if (TIMEZONE_OPTIONS.some(o => o.value === input)) return input;
  if (input === "UTC") return "GMT+00:00";
  return TIMEZONE_OPTIONS[0].value;
}

function parseGmtToMinutes(gmtValue: string): number {
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(gmtValue);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const mins = Number(match[3]);
  return sign * (hours * 60 + mins);
}

function stripHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>(?=\n?)/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripUrls(input: string): string {
  return input
    // Remove markdown links but keep anchor text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    // Remove bare URLs in parentheses or plain text
    .replace(/\((https?:\/\/[^\s)]+)\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitLinesToArray(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function formatVoiceForEdit(voice: AgentBrandVoice): string {
  const parts: string[] = [];
  if (voice.tone) parts.push(`Tone: ${voice.tone}`);
  if (voice.voice_style) parts.push(`Style: ${voice.voice_style}`);
  if (voice.mission) parts.push(`Mission: ${voice.mission}`);
  if (voice.keywords?.length) parts.push(`Keywords: ${voice.keywords.join(", ")}`);
  if (voice.key_messaging?.length) parts.push(`Messaging: ${voice.key_messaging.join(", ")}`);
  if (voice.core_values?.length) parts.push(`Values: ${voice.core_values.join(", ")}`);
  return parts.join("\n");
}

function formatAudienceForEdit(audience: AgentTargetAudience): string {
  const parts: string[] = [];
  if (audience.summary) parts.push(audience.summary);
  if (audience.demographics?.length) parts.push(`Demographics: ${audience.demographics.join(", ")}`);
  if (audience.motivations?.length) parts.push(`Motivations: ${audience.motivations.join(", ")}`);
  if (audience.behaviors?.length) parts.push(`Behaviors: ${audience.behaviors.join(", ")}`);
  if (audience.goals?.length) parts.push(`Goals: ${audience.goals.join(", ")}`);
  return parts.join("\n");
}

function detectGmtFromBrowser(): string {
  const localOffsetMinutes = -new Date().getTimezoneOffset(); // local - UTC in minutes
  // Choose the closest option from our curated list
  let best = TIMEZONE_OPTIONS[0].value;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const opt of TIMEZONE_OPTIONS) {
    const minutes = parseGmtToMinutes(opt.value);
    const diff = Math.abs(minutes - localOffsetMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt.value;
    }
  }
  return best;
}

const brandSchema = z
  .object({
    name: z.string().min(2, "Brand name is required"),
    industry: z.string().min(1, "Industry is required"),
    brandVoice: z.string().optional(),
    targetAudience: z.string().optional(),
    timezone: z.string().min(1, "Timezone is required"),
    website: z
      .string()
      .trim()
      .min(1, "Website is required")
      .refine(value => {
        const candidate = /^(https?:)?\/\//i.test(value) ? value : `https://${value}`;
        return z.string().url("Enter a valid URL (e.g. https://example.com)").safeParse(candidate).success;
      }, "Enter a valid URL (e.g. https://example.com)"),
    otherIndustry: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.industry === "Other") {
        return Boolean(data.otherIndustry && data.otherIndustry.trim().length > 0);
      }
      return true;
    },
    {
      message: "Please specify your industry",
      path: ["otherIndustry"],
    }
  );

type BrandForm = z.infer<typeof brandSchema>;

type OnboardingFlowProps = {
  brandId: string;
  initialState: OnboardingState;
};

const CONNECTOR_SOURCES = [
  { key: "google-drive", label: "Google Drive", status: "soon" as const },
  { key: "canva", label: "Canva", status: "soon" as const },
  { key: "figma", label: "Figma", status: "soon" as const },
  { key: "sharepoint", label: "SharePoint", status: "soon" as const },
  { key: "notion", label: "Notion", status: "soon" as const },
] as const;

// OAuth groupings and coming-soon platforms for the Integrations step

const agentPhaseKeys = ["brand_profile", "voice", "audience", "website", "business"] as const;
type AgentPhase = (typeof agentPhaseKeys)[number];
type AgentPhaseStatus = "idle" | "pending" | "completed" | "error";

const phaseLabel: Record<AgentPhase, string> = {
  brand_profile: "Brand profile",
  voice: "Voice",
  audience: "Audience",
  website: "Website",
  business: "Business",
};

const phaseStatusCopy: Record<AgentPhaseStatus, string> = {
  idle: "Idle",
  pending: "Running",
  completed: "Completed",
  error: "Error",
};

const phaseStatusColor: Record<AgentPhaseStatus, "gray" | "indigo" | "green" | "red"> = {
  idle: "gray",
  pending: "indigo",
  completed: "green",
  error: "red",
};

const PLATFORM_TO_INTEGRATION_PROVIDER: Partial<Record<PlatformKey, IntegrationProvider>> = {
  youtube: "youtube",
  googleAds: "google-ads",
  instagram: "meta",
  facebook: "meta",
  threads: "meta",
  linkedin: "linkedin",
  tiktok: "tiktok",
};

function getSiteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const fallback =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  try {
    return new URL(fallback).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function buildIntegrationCallbackUrl(group: "google" | "facebook", context: string): string {
  const origin = getSiteOrigin();
  const url = new URL("/integrations/callback", origin);
  const provider = group === "facebook" ? "meta" : "google";
  url.searchParams.set("provider", provider);
  url.searchParams.set("context", context);
  return url.toString();
}

function buildDocumentCallbackUrl(provider: "google-drive", context: string): string {
  const origin = getSiteOrigin();
  const url = new URL("/documents/callback", origin);
  url.searchParams.set("provider", provider);
  url.searchParams.set("context", context);
  return url.toString();
}

function createAgentPhaseState(): Record<AgentPhase, AgentPhaseStatus> {
  return {
    brand_profile: "idle",
    voice: "idle",
    audience: "idle",
    website: "idle",
    business: "idle",
  };
}

function createCompletedPhaseState(): Record<AgentPhase, AgentPhaseStatus> {
  return {
    brand_profile: "completed",
    voice: "completed",
    audience: "completed",
    website: "completed",
    business: "completed",
  };
}

function createAgentStreamState(): Record<AgentPhase, string> {
  return {
    brand_profile: "",
    voice: "",
    audience: "",
    website: "",
    business: "",
  };
}

function isAgentPhase(value: string): value is AgentPhase {
  return agentPhaseKeys.includes(value as AgentPhase);
}

function mapAgentStatus(status: string): AgentPhaseStatus | null {
  const normalized = status.toLowerCase();
  if (normalized === "started" || normalized === "running") return "pending";
  if (normalized === "completed") return "completed";
  if (normalized === "error" || normalized === "failed") return "error";
  return null;
}

function createEmptyAccountSelection(): Record<PlatformKey, Set<string>> {
  return {
    youtube: new Set(),
    googleAds: new Set(),
    dv360: new Set(),
    instagram: new Set(),
    facebook: new Set(),
    threads: new Set(),
    tiktok: new Set(),
    linkedin: new Set(),
    amazonAds: new Set(),
  };
}

function createSelectionFromState(state: OnboardingState): Record<PlatformKey, Set<string>> {
  const selection = createEmptyAccountSelection();
  PLATFORM_KEYS.forEach(key => {
    const connection = state.connections[key];
    if (!connection) return;
    const next = selection[key];
    const accounts = connection.accounts ?? [];
    const hasSelectedTrue = accounts.some(account => account.selected === true);
    const hasExplicitSelection = hasSelectedTrue || accounts.some(account => account.selected === false);

    if (hasSelectedTrue) {
      accounts.forEach(account => {
        if (account.selected) next.add(account.id);
      });
      return;
    }

    // If the user explicitly deselected everything, respect the empty set
    if (hasExplicitSelection) {
      return;
    }

    if (connection.accountId) {
      next.add(connection.accountId);
      return;
    }
    if (accounts.length === 1) {
      next.add(accounts[0]?.id);
    }
  });
  return selection;
}

function areAccountSelectionsEqual(
  a: Record<PlatformKey, Set<string>>,
  b: Record<PlatformKey, Set<string>>
): boolean {
  return PLATFORM_KEYS.every(key => {
    const aSet = a[key];
    const bSet = b[key];
    if (aSet.size !== bSet.size) return false;
    for (const value of aSet) {
      if (!bSet.has(value)) return false;
    }
    return true;
  });
}

export default function OnboardingFlow({ brandId, initialState }: OnboardingFlowProps) {
  const router = useRouter();
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<OnboardingState>(initialState);
  const [isPending, startTransition] = useTransition();
  const [selectedVoiceTags, setSelectedVoiceTags] = useState<BrandVoiceTag[]>(initialState.brand.brandVoiceTags ?? []);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [agentPhases, setAgentPhases] = useState<Record<AgentPhase, AgentPhaseStatus>>(() => createAgentPhaseState());
  const [agentStreams, setAgentStreams] = useState<Record<AgentPhase, string>>(() => createAgentStreamState());
  const [agentVoice, setAgentVoice] = useState<AgentBrandVoice | null>(null);
  const [agentAudience, setAgentAudience] = useState<AgentTargetAudience | null>(null);
  const [agentBrandProfile, setAgentBrandProfile] = useState<AgentBrandProfile | null>(null);
  const [agentWebsite, setAgentWebsite] = useState<WebsiteSummary | null>(null);
  const [agentBusiness, setAgentBusiness] = useState<BusinessSummary | null>(null);
  const [voiceHtml, setVoiceHtml] = useState<string>(state.brand.brandVoice ?? "");
  const [audienceHtml, setAudienceHtml] = useState<string>(state.brand.targetAudience ?? "");
  const [websiteHtml, setWebsiteHtml] = useState<string>("");
  const [businessHtml, setBusinessHtml] = useState<string>("");
  const [demographicsHtml, setDemographicsHtml] = useState<string>("");
  const [previewCompletePayload, setPreviewCompletePayload] = useState<OnboardingPreviewWorkflowResult | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasPreviewRun, setHasPreviewRun] = useState(false);
  const [previewEditMode, setPreviewEditMode] = useState<PreviewEditMode>({
    voice: false,
    audience: false,
    website: false,
    business: false,
  });
  // Track selected integration accounts per provider
  const [selectedAccountIdsByKey, setSelectedAccountIdsByKey] = useState<Record<PlatformKey, Set<string>>>(() =>
    createSelectionFromState(initialState)
  );
  const selectedAccountIdsByKeyRef = useRef(selectedAccountIdsByKey);
  useEffect(() => {
    selectedAccountIdsByKeyRef.current = selectedAccountIdsByKey;
  }, [selectedAccountIdsByKey]);
  const [isGoogleDriveLinking, setIsGoogleDriveLinking] = useState(false);
  const previewAbortRef = useRef<AbortController | null>(null);
  const previewPayloadRef = useRef<AgentRequestPayload | null>(null);
  const previewEditTouchedRef = useRef<{ voice: boolean; audience: boolean }>({ voice: false, audience: false });
  const previewHydratedAtRef = useRef<string | null>(null);
  const startMetaSyncMutation = useStartMetaSync();
  const startGoogleSyncMutation = useStartGoogleSync();
  const startGoogleDrivePickerMutation = useStartGoogleDrivePicker();
  const {
    selectableAssetsQuery,
    selectableAssetsFlatList,
    selectableAccountIdToPlatformKey,
    isHydrated: hasSelectableAssetsHydrated,
    refetchSelectableAssets,
  } = useSelectableAssetsState({
    currentUserId: currentUserId ?? undefined,
    brandId,
    setState,
    selectedAccountIdsByKeyRef,
  });
  const isGoogleDrivePickerPending = startGoogleDrivePickerMutation.isPending;
  const { activeBrandId, brandSummaries, isSwitching } = useActiveBrandContext();
  const hasAdditionalBrands = brandSummaries.length > 1;
  const integrationAccountLabelById = useMemo(() => {
    const map = new Map<string, string>();
    selectableAssetsFlatList.forEach(asset => {
      if (!asset.integration_account_id) return;
      map.set(asset.integration_account_id, resolveSelectableAssetLabel(asset));
    });
    PLATFORM_KEYS.forEach(key => {
      state.connections[key]?.accounts?.forEach(account => {
        map.set(account.id, account.name);
      });
    });
    return map;
  }, [selectableAssetsFlatList, state.connections]);
  const getReviewAccountLabels = useCallback(
    (provider: PlatformKey): string[] => {
      const selectedIds = Array.from(selectedAccountIdsByKey[provider] ?? []);
      if (selectedIds.length > 0) {
        const labels = selectedIds.map(id => integrationAccountLabelById.get(id) ?? `Account ${id.slice(0, 6)}`);
        return Array.from(new Set(labels));
      }
      const accounts = state.connections[provider]?.accounts ?? [];
      return accounts.map(account => account.name);
    },
    [integrationAccountLabelById, selectedAccountIdsByKey, state.connections]
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
    getValues,
    reset,
    setValue,
    watch,
  } = useForm<BrandForm>({
    defaultValues: (() => {
      const storedIndustry = initialState.brand.industry;
      const isCustom = Boolean(storedIndustry && !industries.includes(storedIndustry));
      return {
        name: initialState.brand.name,
        industry: isCustom ? "Other" : storedIndustry || industries[0],
        brandVoice: initialState.brand.brandVoice ?? "",
        targetAudience: initialState.brand.targetAudience ?? "",
        timezone: normalizeTimezoneValue(initialState.brand.timezone || "UTC"),
        website: initialState.brand.website ?? "",
        otherIndustry: isCustom ? storedIndustry : "",
      };
    })(),
  });

  const connectedKeys = useMemo(
    () =>
      PLATFORM_KEYS.filter(
        key => state.connections[key]?.connected || (selectedAccountIdsByKey[key]?.size ?? 0) > 0
      ),
    [selectedAccountIdsByKey, state.connections]
  );

  // Keep local selections in sync with the latest connection data (e.g., after resync)
  useEffect(() => {
    setSelectedAccountIdsByKey(prev => {
      if (selectableAssetsFlatList.length === 0) {
        const prevCount = PLATFORM_KEYS.reduce((count, key) => count + prev[key].size, 0);
        if (prevCount > 0 && !hasSelectableAssetsHydrated) return prev;
      }

      const next = createSelectionFromState(state);
      const prevCount = PLATFORM_KEYS.reduce((count, key) => count + prev[key].size, 0);
      const nextCount = PLATFORM_KEYS.reduce((count, key) => count + next[key].size, 0);
      const hasExplicitSelections = PLATFORM_KEYS.some(key =>
        state.connections[key]?.accounts?.some(account => account.selected === true || account.selected === false)
      );
      if (prevCount > 0 && nextCount === 0 && !hasExplicitSelections) {
        return prev;
      }

      PLATFORM_KEYS.forEach(key => {
        const set = prev[key];
        set.forEach(id => {
          const mappedKey = selectableAccountIdToPlatformKey.get(id);
          if (mappedKey) {
            next[mappedKey].add(id);
          } else {
            next[key].add(id);
          }
        });
      });

      return areAccountSelectionsEqual(prev, next) ? prev : next;
    });
  }, [hasSelectableAssetsHydrated, selectableAccountIdToPlatformKey, selectableAssetsFlatList.length, state]);

  const ownerId = useMemo(
    () => state.members.find(member => member.role === "owner")?.id ?? null,
    [state.members]
  );

  const step = state.step;

  const brandDocuments = state.documents;

  const handleAgentPreviewEvent = useCallback(
    (event: OnboardingPreviewEvent) => {
      switch (event.type) {
        case "status": {
          if (!isAgentPhase(event.section)) break;
          const mapped = mapAgentStatus(event.status);
          if (mapped) {
            setAgentPhases(prev => {
              if (prev[event.section] === mapped) {
                return prev;
              }
              return {
                ...prev,
                [event.section]: mapped,
              };
            });
          }
          if (mapped === "error") {
            if (event.error) {
              setAgentError(event.error);
            }
            setAgentStreams(prev => ({ ...prev, [event.section]: "" }));
          }
          if (mapped === "completed") {
            setAgentStreams(prev => ({ ...prev, [event.section]: "" }));
          }
          break;
        }
        case "stream": {
          if (!isAgentPhase(event.section)) break;
          setAgentStreams(prev => ({
            ...prev,
            [event.section]: `${prev[event.section] || ""}${event.delta}`,
          }));
          break;
        }
        case "voice":
          setAgentVoice(event.payload);
          setAgentStreams(prev => ({ ...prev, voice: "" }));
          break;
        case "audience":
          setAgentAudience(event.payload);
          setAgentStreams(prev => ({ ...prev, audience: "" }));
          break;
        case "brand_profile":
          setAgentBrandProfile(event.payload);
          if (event.payload.brand_voice) {
            setAgentVoice(event.payload.brand_voice);
          }
          if (event.payload.target_audience) {
            setAgentAudience(event.payload.target_audience);
          }
          setAgentStreams(prev => ({ ...prev, brand_profile: "" }));
          break;
        case "website":
          setAgentWebsite(event.payload);
          setAgentStreams(prev => ({ ...prev, website: "" }));
          break;
        case "business":
          setAgentBusiness(event.payload);
          setAgentStreams(prev => ({ ...prev, business: "" }));
          break;
        case "structured":
          setAgentWebsite(event.payload.website);
          setAgentBusiness(event.payload.business ?? null);
          setAgentStreams(prev => ({ ...prev, website: "", business: "" }));
          break;
        case "embedding":
          break;
        case "complete":
          setAgentPhases(prev => {
            const next = { ...prev };
            for (const phase of agentPhaseKeys) {
              if (next[phase] !== "completed") {
                next[phase] = "completed";
              }
            }
            return next;
          });
          setAgentStreams(createAgentStreamState());
          if (event.result?.brand_profile) {
            setAgentBrandProfile(event.result.brand_profile);
            if (event.result.brand_profile.brand_voice) {
              setAgentVoice(event.result.brand_profile.brand_voice);
            }
            if (event.result.brand_profile.target_audience) {
              setAgentAudience(event.result.brand_profile.target_audience);
            }
          }
          if (event.result?.structured) {
            setAgentWebsite(event.result.structured.website);
            setAgentBusiness(event.result.structured.business ?? null);
            setAgentStreams(prev => ({ ...prev, website: "", business: "" }));
          }
          // Some agent implementations emit a final complete event without a result payload.
          // Treat that as a valid completion so users can proceed to approval once all phases finish.
          setPreviewCompletePayload(event.result ?? ({} as OnboardingPreviewWorkflowResult));
          break;
        case "error":
          setAgentError(event.message);
          setAgentPhases(prev => {
            const next = { ...prev };
            for (const phase of agentPhaseKeys) {
              if (next[phase] !== "completed") {
                next[phase] = "error";
              }
            }
            return next;
          });
          setAgentStreams(createAgentStreamState());
          break;
        default:
          break;
      }
    },
    []
  );

  // Live update from server events (optional; backend must emit this)
  useContinuumServerEvents({
    "onboarding.document.updated": (event: ContinuumEvent<"onboarding.document.updated">) => {
      if (event.data.brandId !== brandId) return;
      const { documentId, status, errorMessage } = event.data;
      setState(prev => ({
        ...prev,
        documents: prev.documents.map(d => (d.id === documentId ? { ...d, status, errorMessage } : d)),
      }));
    },
  });

  useEffect(() => {
    let canceled = false;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (canceled) return;
        if (error) {
          setCurrentUserId(null);
          return;
        }
        setCurrentUserId(data.user?.id ?? null);
      })
      .catch(() => {
        if (!canceled) {
          setCurrentUserId(null);
        }
      });
    return () => {
      canceled = true;
    };
  }, []);

  // Auto-poll onboarding state while any document is processing
  useEffect(() => {
    const hasProcessing = brandDocuments.some(doc => doc.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      void fetchOnboardingStateAction(brandId)
        .then(next => setState(next))
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [brandDocuments, brandId]);

  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort();
    };
  }, []);

  const industryValue = watch("industry");
  const timezoneValue = watch("timezone");
  const websiteValue = watch("website");

  const streamingAbortRef = useRef<AbortController | null>(null);
  const [isDraftingVoice, setIsDraftingVoice] = useState(false);
  const [isDraftingAudience, setIsDraftingAudience] = useState(false);
  const lastWebsiteTriggeredRef = useRef<string | null>(null);
  const websiteTouchedRef = useRef(false);
  const userEditedRef = useRef<{
    brandVoice: boolean;
    targetAudience: boolean;
    name: boolean;
    website: boolean;
  }>({ brandVoice: false, targetAudience: false, name: false, website: false });

  // Auto-detect timezone from browser on first render if not already set by server
  const autoTimezoneAppliedRef = useRef(false);
  useEffect(() => {
    if (autoTimezoneAppliedRef.current) return;
    const serverProvided = initialState.brand.timezone && initialState.brand.timezone !== "UTC";
    if (serverProvided) {
      autoTimezoneAppliedRef.current = true;
      return;
    }
    const detected = detectGmtFromBrowser();
    const normalized = normalizeTimezoneValue(detected);
    if (!timezoneValue || timezoneValue === "GMT+00:00") {
      setValue("timezone", normalized, { shouldDirty: true });
    }
    autoTimezoneAppliedRef.current = true;
  }, [initialState.brand.timezone, setValue, timezoneValue]);

  useEffect(() => {
    setSelectedVoiceTags(state.brand.brandVoiceTags ?? []);
  }, [state.brand.brandVoiceTags]);

  const hydratePreviewPayload = useCallback((payload: OnboardingPreviewWorkflowResult) => {
    const brandProfile = payload.brand_profile ?? null;
    const structured = payload.structured ?? null;
    setAgentBrandProfile(brandProfile);
    setAgentVoice(brandProfile?.brand_voice ?? null);
    setAgentAudience(brandProfile?.target_audience ?? structured?.target_audience ?? null);
    setAgentWebsite(structured?.website ?? null);
    setAgentBusiness(structured?.business ?? null);
    setAgentStreams(createAgentStreamState());
    setAgentPhases(createCompletedPhaseState());
    setAgentError(null);
    setPreviewCompletePayload(payload);
    setHasPreviewRun(true);
  }, []);

  useEffect(() => {
    const preview = state.preview;
    if (!preview?.payload) return;
    const signature = preview.completedAt ?? "preview";
    if (previewHydratedAtRef.current === signature) return;
    previewHydratedAtRef.current = signature;
    hydratePreviewPayload(preview.payload);
  }, [hydratePreviewPayload, state.preview]);

  useEffect(() => {
    if (isSwitching) return;
    if (activeBrandId && activeBrandId !== brandId) {
      router.replace(`/onboarding?brand=${activeBrandId}`);
    }
  }, [activeBrandId, brandId, isSwitching, router]);

  useEffect(() => {
    if (previewEditTouchedRef.current.voice) return;
    const nextValue = agentVoice
      ? formatVoiceForEdit(agentVoice)
      : agentStreams.voice || state.brand.brandVoice;
    if (nextValue !== undefined && nextValue !== null) {
      setVoiceHtml(nextValue);
    }
  }, [agentStreams.voice, agentVoice, state.brand.brandVoice]);

  useEffect(() => {
    if (previewEditTouchedRef.current.audience) return;
    const base = agentAudience ? formatAudienceForEdit(agentAudience) : agentStreams.audience || state.brand.targetAudience;
    if (base !== undefined && base !== null) {
      setAudienceHtml(stripUrls(base));
    }
  }, [agentAudience, agentStreams.audience, state.brand.targetAudience]);

  useEffect(() => {
    if (agentWebsite?.hero_statement) {
      setWebsiteHtml(agentWebsite.hero_statement || "");
    } else if (agentStreams.website) {
      setWebsiteHtml(agentStreams.website);
    }
  }, [agentStreams.website, agentWebsite]);

  useEffect(() => {
    if (agentBusiness?.business_description) {
      setBusinessHtml(agentBusiness.business_description || "");
    }
  }, [agentBusiness]);

  useEffect(() => {
    if (agentAudience?.demographics?.length) {
      setDemographicsHtml(agentAudience.demographics.map(stripUrls).join("\n"));
    }
  }, [agentAudience?.demographics]);

  useEffect(() => {
    const storedIndustry = state.brand.industry;
    const isCustom = Boolean(storedIndustry && !industries.includes(storedIndustry));

    const currentValues = getValues();

    const nextValues = {
      name: currentValues.name ?? "",
      industry: isCustom ? "Other" : storedIndustry || industries[0],
      brandVoice: currentValues.brandVoice ?? state.brand.brandVoice ?? "",
      targetAudience: currentValues.targetAudience ?? state.brand.targetAudience ?? "",
      timezone: normalizeTimezoneValue(state.brand.timezone || "UTC"),
      website: currentValues.website ?? "",
      otherIndustry: isCustom ? storedIndustry : "",
    };

    let resetNameEdited = false;
    let resetWebsiteEdited = false;

    if (!userEditedRef.current.name) {
      nextValues.name = state.brand.name ?? "";
      resetNameEdited = true;
    }

    if (!userEditedRef.current.website) {
      nextValues.website = state.brand.website ?? "";
      resetWebsiteEdited = true;
    }

    if (!isDraftingVoice && !userEditedRef.current.brandVoice && state.brand.brandVoice !== null) {
      nextValues.brandVoice = state.brand.brandVoice;
    }

    if (!isDraftingAudience && !userEditedRef.current.targetAudience && state.brand.targetAudience !== null) {
      nextValues.targetAudience = state.brand.targetAudience;
    }

    reset(nextValues, { keepDirty: true, keepTouched: true });

    if (resetNameEdited) {
      userEditedRef.current.name = false;
    }
    if (resetWebsiteEdited) {
      userEditedRef.current.website = false;
    }

    if (state.brand.logoPath) {
      void createSignedAssetUrl(state.brand.logoPath, 3600)
        .then(url => setLogoPreviewUrl(url))
        .catch(() => setLogoPreviewUrl(null));
    } else {
      setLogoPreviewUrl(null);
    }
  }, [getValues, isDraftingAudience, isDraftingVoice, reset, state.brand]);

  const getAllSelectedIds = useCallback((): string[] => {
    const selected = new Set<string>();
    (Object.keys(selectedAccountIdsByKey) as PlatformKey[]).forEach(k => {
      selectedAccountIdsByKey[k].forEach(id => selected.add(id));
    });

    const assetPkToIntegrationAccountId = new Map<string, string>();
    selectableAssetsFlatList.forEach(asset => {
      if (!asset.integration_account_id) return;
      assetPkToIntegrationAccountId.set(asset.asset_pk, asset.integration_account_id);
    });

    const resolved = new Set<string>();
    selected.forEach(id => {
      const mapped = assetPkToIntegrationAccountId.get(id);
      resolved.add(mapped ?? id);
    });

    return Array.from(resolved).sort();
  }, [selectedAccountIdsByKey, selectableAssetsFlatList]);

  const getAllAvailableIds = useCallback((): string[] => {
    const all: string[] = [];
    PLATFORM_KEYS.forEach(key => {
      state.connections[key]?.accounts?.forEach(account => {
        all.push(account.id);
      });
    });
    // Also include assets from the selectable-assets API in case they're not yet merged into state
    selectableAssetsFlatList.forEach(asset => {
      if (asset.integration_account_id) {
        all.push(asset.integration_account_id);
      }
    });
    return Array.from(new Set(all));
  }, [state.connections, selectableAssetsFlatList]);

  const buildAgentPayload = useCallback((): AgentRequestPayload => {
    const userId = currentUserId ?? ownerId;
    if (!userId) {
      throw new Error("We could not identify your account. Refresh and try again.");
    }
    const brandName = (state.brand.name || "").trim();
    if (!brandName) {
      throw new Error("Add your brand name before completing onboarding.");
    }

    const providers = Array.from(
      new Set(
        connectedKeys
          .map(key => PLATFORM_TO_INTEGRATION_PROVIDER[key])
          .filter((value): value is IntegrationProvider => Boolean(value))
      )
    );

    // Merge voice with edits: prefer agentVoice structure, override tone with edited text when present
    const editedVoiceText = stripHtmlToText(voiceHtml);
    const mergedVoice: AgentBrandVoice | undefined = agentVoice
      ? { ...agentVoice, tone: editedVoiceText || agentVoice.tone }
      : editedVoiceText
        ? { tone: editedVoiceText }
        : state.brand.brandVoice?.trim()
          ? { tone: state.brand.brandVoice.trim() }
          : undefined;

    // Merge audience with edits
    const editedAudienceSummary = stripHtmlToText(audienceHtml);
    const editedDemographics = demographicsHtml ? splitLinesToArray(stripHtmlToText(demographicsHtml)) : [];
    const mergedAudience: AgentTargetAudience | undefined = (() => {
      const base = agentAudience ? { ...agentAudience } : {};
      const summary = editedAudienceSummary || agentAudience?.summary || state.brand.targetAudience?.trim();
      const demographics = editedDemographics.length ? editedDemographics : agentAudience?.demographics;
      if (!summary && (!demographics || demographics.length === 0)) return agentAudience ? base : undefined;
      return {
        ...base,
        summary: summary ?? base.summary,
        demographics: demographics ?? base.demographics,
      };
    })();

    const websiteUrl = state.brand.website?.trim() || agentWebsite?.website_url || undefined;
    const heroText = stripHtmlToText(websiteHtml);
    const businessText = stripHtmlToText(businessHtml);
    const description = [businessText, heroText, state.brand.industry].filter(Boolean).join(" — ") || undefined;

    const selectedIntegrationAccountIds = Array.from(new Set(getAllSelectedIds())).sort();

    const runContext = agentRunContextSchema.parse({
      user_id: userId,
      brand_id: brandId,
      brand_name: brandName,
      created_at: state.completedAt ?? new Date().toISOString(),
      platform_urls: [],
      integrated_platforms: providers,
      brand_voice_tags: state.brand.brandVoiceTags ?? [],
      integration_account_ids: selectedIntegrationAccountIds,
    });

    return {
      brandProfile: {
        id: brandId,
        brand_name: brandName,
        description,
        brand_voice: mergedVoice,
        target_audience: mergedAudience,
        website_url: websiteUrl && websiteUrl.length > 0 ? websiteUrl : undefined,
      },
      runContext,
    };
  }, [
    agentAudience,
    agentVoice,
    agentWebsite?.website_url,
    businessHtml,
    demographicsHtml,
    voiceHtml,
    audienceHtml,
    websiteHtml,
    brandId,
    connectedKeys,
    currentUserId,
    ownerId,
    state.brand.brandVoice,
    state.brand.brandVoiceTags,
    state.brand.industry,
    state.brand.name,
    state.brand.targetAudience,
    state.brand.website,
    state.completedAt,
    getAllSelectedIds,
  ]);

  const handleBrandSubmit = useCallback(
    (data: BrandForm) => {
      const parsed = brandSchema.safeParse(data);
      if (!parsed.success) {
        parsed.error.issues.forEach(issue => {
          const field = issue.path[0];
          if (field) {
            setError(field as keyof BrandForm, { message: issue.message });
          }
        });
        return;
      }

      // Coerce website to a valid URL or null (avoid server-side Zod url errors)
      const websiteRaw = (data.website || "").trim();
      let website: string | null = null;
      if (websiteRaw.length > 0) {
        const hasScheme = /^(https?:)?\/\//i.test(websiteRaw);
        const candidate = hasScheme ? websiteRaw : `https://${websiteRaw}`;
        const parsed = z.string().url().safeParse(candidate);
        website = parsed.success ? parsed.data : null;
      }

      const payload = {
        name: data.name.trim(),
        industry: data.industry === "Other" && data.otherIndustry ? data.otherIndustry.trim() : data.industry,
        brandVoice: data.brandVoice?.trim() ? data.brandVoice.trim() : null,
        brandVoiceTags: selectedVoiceTags,
        targetAudience: data.targetAudience?.trim() ? data.targetAudience.trim() : null,
        timezone: data.timezone,
        website,
        logoPath: state.brand.logoPath ?? null,
      };

      startTransition(() => {
        void mutateOnboardingStateAction(brandId, {
          step: 1,
          brand: payload,
        })
          .then(next => {
            setState(next);
            userEditedRef.current.name = false;
            userEditedRef.current.website = false;
          })
          .catch(() => {
            show({ title: "Save failed", description: "Could not update brand details.", variant: "error" });
          });
      });
    },
    [brandId, selectedVoiceTags, setError, show, state.brand.logoPath]
  );

  // --- Draft streaming from website on blur ---
  const stopDrafting = useCallback(() => {
    try {
      streamingAbortRef.current?.abort();
    } catch {}
    streamingAbortRef.current = null;
    setIsDraftingVoice(false);
    setIsDraftingAudience(false);
  }, []);

  const stopPreview = useCallback(() => {
    try {
      previewAbortRef.current?.abort();
    } catch {}
    previewAbortRef.current = null;
    setIsAgentRunning(false);
  }, []);

  const resetPreviewState = useCallback(() => {
    setAgentPhases(createAgentPhaseState());
    setAgentStreams(createAgentStreamState());
    setAgentVoice(null);
    setAgentAudience(null);
    setAgentBrandProfile(null);
    setAgentWebsite(null);
    setAgentBusiness(null);
    setPreviewCompletePayload(null);
    setAgentError(null);
    setPreviewEditMode({
      voice: false,
      audience: false,
      website: false,
      business: false,
    });
    previewEditTouchedRef.current = { voice: false, audience: false };
    setVoiceHtml(state.brand.brandVoice ?? "");
    setAudienceHtml(state.brand.targetAudience ?? "");
    setWebsiteHtml("");
    setBusinessHtml("");
    setDemographicsHtml("");
    setHasPreviewRun(false);
  }, [state.brand.brandVoice, state.brand.targetAudience]);

  const handleVoiceEdit = useCallback((html: string) => {
    previewEditTouchedRef.current.voice = true;
    setVoiceHtml(html);
    const text = stripHtmlToText(html);
    setState(prev => ({
      ...prev,
      brand: {
        ...prev.brand,
        brandVoice: text || null,
      },
    }));
  }, []);

  const handleAudienceEdit = useCallback((html: string) => {
    previewEditTouchedRef.current.audience = true;
    setAudienceHtml(html);
    const text = stripHtmlToText(html);
    setState(prev => ({
      ...prev,
      brand: {
        ...prev.brand,
        targetAudience: text || null,
      },
    }));
  }, []);

  const handleWebsiteEdit = useCallback((html: string) => {
    setWebsiteHtml(html);
    const text = stripHtmlToText(html);
    setAgentWebsite(prev => {
      const next: WebsiteSummary = {
        ...(prev || {}),
        hero_statement: text || null,
        website_url: prev?.website_url ?? state.brand.website ?? undefined,
      };
      return next;
    });
  }, [state.brand.website]);

  const handleBusinessEdit = useCallback((html: string) => {
    setBusinessHtml(html);
    const text = stripHtmlToText(html);
    setAgentBusiness(prev => ({
      ...(prev || {}),
      business_description: text || undefined,
    }));
  }, []);

  const handleDemographicsEdit = useCallback((html: string) => {
    setDemographicsHtml(html);
    const text = stripHtmlToText(html);
    const entries = splitLinesToArray(text);
    setAgentAudience(prev => ({
      ...(prev || {}),
      demographics: entries,
    }));
  }, []);

  const togglePreviewEditMode = useCallback((section: keyof PreviewEditMode) => {
    setPreviewEditMode(prev => {
      const nextValue = !prev[section];
      if (nextValue) {
        if (section === "voice") {
          previewEditTouchedRef.current.voice = true;
        }
        if (section === "audience") {
          previewEditTouchedRef.current.audience = true;
        }
      }
      return {
        ...prev,
        [section]: nextValue,
      };
    });
  }, []);

  const handleClear = useCallback(() => {
    stopDrafting();
    stopPreview();
    resetPreviewState();
    previewPayloadRef.current = null;
    setIsPreviewVisible(false);
    lastWebsiteTriggeredRef.current = null;
    userEditedRef.current = { brandVoice: false, targetAudience: false, name: false, website: false };
    setSelectedAccountIdsByKey(createEmptyAccountSelection());
    setSelectedVoiceTags([]);
    setLogoPreviewUrl(null);
    previewEditTouchedRef.current = { voice: false, audience: false };
    setVoiceHtml("");
    setAudienceHtml("");
    reset({
      name: "",
      industry: industries[0],
      brandVoice: "",
      targetAudience: "",
      timezone: normalizeTimezoneValue(detectGmtFromBrowser()),
      website: "",
      otherIndustry: "",
    });
    startTransition(() => {
      void resetOnboardingStateAction(brandId)
        .then(next => {
          setState(next);
          setSelectedAccountIdsByKey(createEmptyAccountSelection());
          show({ title: "Progress cleared", description: "Your onboarding data was reset.", variant: "success" });
        })
        .catch(() => {
          show({ title: "Clear failed", description: "Unable to reset onboarding. Try again.", variant: "error" });
        });
    });
  }, [brandId, reset, resetPreviewState, show, startTransition, stopDrafting, stopPreview]);

  const startDraftingFromWebsite = useCallback(async (url: string) => {
    if (!url || url.trim().length < 5) return;
    // Avoid duplicate triggers for same URL
    if (lastWebsiteTriggeredRef.current === url.trim()) return;
    lastWebsiteTriggeredRef.current = url.trim();

    stopDrafting();
    const ctrl = new AbortController();
    streamingAbortRef.current = ctrl;
    setIsDraftingVoice(true);
    setIsDraftingAudience(true);

    try {
      const trimmedUrl = url.trim();
      let voiceBuffer = "";
      let audienceBuffer = "";

      const streamVoice = async () => {
        const response = await fetch(`/api/onboarding/brand-draft-voice?brand=${encodeURIComponent(brandId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: trimmedUrl }),
          signal: ctrl.signal,
        });

        if (!response.ok || !response.body) {
          setIsDraftingVoice(false);
          show({ title: "Brand voice draft failed", description: "Could not start drafting.", variant: "error" });
          return;
        }

        const reader = response.body.getReader();
        await readServerSentEvents({
          reader,
          signal: ctrl.signal,
          onEvent: (eventName, rawPayload) => {
            if (!eventName) return;
            const payload = rawPayload.trim();
            switch (eventName) {
              case "brandVoice": {
                try {
                  const parsed = JSON.parse(payload);
                  const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
                  if (!delta) break;
                  voiceBuffer += delta;
                  if (!userEditedRef.current.brandVoice) {
                    setValue("brandVoice", voiceBuffer, { shouldDirty: false });
                  }
                } catch {
                  // ignore malformed chunks
                }
                break;
              }
              case "brandVoiceDone":
                setIsDraftingVoice(false);
                break;
              case "done":
                setIsDraftingVoice(false);
                break;
              case "error":
                setIsDraftingVoice(false);
                show({ title: "Brand voice draft error", description: payload || "Upstream error.", variant: "error" });
                break;
              default:
                break;
            }
          },
        });
      };

      const streamAudience = async () => {
        const response = await fetch(`/api/onboarding/brand-draft-audience?brand=${encodeURIComponent(brandId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: trimmedUrl }),
          signal: ctrl.signal,
        });

        if (!response.ok || !response.body) {
          setIsDraftingAudience(false);
          show({ title: "Target audience draft failed", description: "Could not start drafting.", variant: "error" });
          return;
        }

        const reader = response.body.getReader();
        await readServerSentEvents({
          reader,
          signal: ctrl.signal,
          onEvent: (eventName, rawPayload) => {
            if (!eventName) return;
            const payload = rawPayload.trim();
            switch (eventName) {
              case "targetAudience": {
                try {
                  const parsed = JSON.parse(payload);
                  const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
                  if (!delta) break;
                  audienceBuffer += delta;
                  if (!userEditedRef.current.targetAudience) {
                    setValue("targetAudience", audienceBuffer, { shouldDirty: false });
                  }
                } catch {
                  // ignore malformed chunks
                }
                break;
              }
              case "targetAudienceDone":
                setIsDraftingAudience(false);
                break;
              case "done":
                setIsDraftingAudience(false);
                break;
              case "error":
                setIsDraftingAudience(false);
                show({ title: "Target audience draft error", description: payload || "Upstream error.", variant: "error" });
                break;
              default:
                break;
            }
          },
        });
      };

      await Promise.allSettled([streamVoice(), streamAudience()]);

      if (!ctrl.signal.aborted) {
        const finalVoice = (getValues("brandVoice") || "").trim();
        const finalAudience = (getValues("targetAudience") || "").trim();
        setState(prev => ({
          ...prev,
          brand: {
            ...prev.brand,
            brandVoice: finalVoice.length ? finalVoice : null,
            targetAudience: finalAudience.length ? finalAudience : null,
          },
        }));
      }
    } catch {
      // swallow; user may have aborted
    } finally {
      setIsDraftingVoice(false);
      setIsDraftingAudience(false);
      streamingAbortRef.current = null;
    }
  }, [brandId, getValues, setState, setValue, show, stopDrafting]);

  const maybeStartDraftingFromWebsite = useCallback(
    (rawValue: string) => {
      if (step !== 0) return;
      if (!websiteTouchedRef.current) return;
      if (!userEditedRef.current.website) return;
      const resolved = resolveWebsiteDraftUrl(rawValue);
      if (!resolved) return;
      void startDraftingFromWebsite(resolved);
    },
    [startDraftingFromWebsite, step]
  );

  useEffect(() => {
    const resolved = resolveWebsiteDraftUrl(websiteValue ?? "");
    if (!resolved) return;
    if (step !== 0) return;
    if (!websiteTouchedRef.current) return;
    if (!userEditedRef.current.website) return;

    const timeoutId = window.setTimeout(() => {
      void startDraftingFromWebsite(resolved);
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [startDraftingFromWebsite, step, websiteValue]);

  useEffect(() => {
    if (step !== 0) {
      websiteTouchedRef.current = false;
    }
  }, [step]);

  const handleUploadDocuments = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const toUpload = Array.from(files);

      startTransition(() => {
        Promise.all(
          toUpload.map(async file => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("source", "upload");
            formData.append("brandId", brandId);
            const response = await fetch("/api/onboarding/documents", {
              method: "POST",
              body: formData,
            });
            if (!response.ok) {
              throw new Error("Upload failed");
            }
            const json = await response.json();
            return json.state as OnboardingState;
          })
        )
          .then(results => {
            setState(prev => results.at(-1) ?? prev);
            show({ title: "Documents added", description: "Your files were queued for embedding.", variant: "success" });
          })
          .catch(() => {
            show({ title: "Upload failed", description: "We could not process these files. Try again.", variant: "error" });
          });
      });
    },
    [brandId, show]
  );

  const handleLogoUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const file = fileList[0];
      const validTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
      if (!validTypes.includes(file.type as (typeof validTypes)[number])) {
        show({ title: "Unsupported file", description: "Use PNG, JPG, WEBP, or SVG.", variant: "error" });
        return;
      }
      const maxBytes = 2 * 1024 * 1024;
      if (file.size > maxBytes) {
        show({ title: "File too large", description: "Max size is 2MB.", variant: "error" });
        return;
      }

      const extension =
        file.type === "image/png" ? "png" :
        file.type === "image/jpeg" ? "jpg" :
        file.type === "image/webp" ? "webp" :
        file.type === "image/svg+xml" ? "svg" :
        (file.name.split(".").pop() || "png");

      const namedFile = new File([file], `logo.${extension}`, { type: file.type });

      startTransition(() => {
        void (async () => {
          const { asset } = await uploadCreativeAsset(brandId, "branding", namedFile);
          const url = await createSignedAssetUrl(asset.fullPath, 3600);
          setState(prev => ({
            ...prev,
            brand: {
              ...prev.brand,
              logoPath: asset.fullPath,
            },
          }));
          setLogoPreviewUrl(url);
          show({ title: "Logo uploaded", description: "We saved your brand logo.", variant: "success" });
        })().catch(() =>
          show({ title: "Upload failed", description: "Could not upload logo. Try again.", variant: "error" })
        );
      });
    },
    [brandId, show]
  );

  const handleConnectorLaunch = useCallback(
    async (source: (typeof CONNECTOR_SOURCES)[number]["key"]) => {
      if (source === "google-drive") {
        type GoogleDriveLinkedMessage = {
          type: string;
          source: string;
          name: string;
          externalUrl?: string | null;
          state?: string | null;
          context?: string | null;
        };
        type GoogleDriveErrorMessage = {
          type: string;
          source?: string | null;
          message?: string | null;
          state?: string | null;
          context?: string | null;
        };
        let popup: Window | null = null;
        let abortController: AbortController | null = null;
        let linkedPromise: Promise<GoogleDriveLinkedMessage> | null = null;
        let errorPromise: Promise<never> | null = null;
        let closedPromise: Promise<never> | null = null;
        setIsGoogleDriveLinking(true);
        try {
          const callbackUrl = buildDocumentCallbackUrl("google-drive", "onboarding");
          const { url, state } = await startGoogleDrivePickerMutation.mutateAsync({
            brandId,
            callbackUrl,
            context: "onboarding",
          });
          popup = openCenteredPopup(url, "Google Drive");
          if (!popup) {
            show({ title: "Popup blocked", description: "Enable popups to connect external libraries.", variant: "error" });
            return;
          }

          abortController = new AbortController();

          const predicate = (message: GoogleDriveLinkedMessage | GoogleDriveErrorMessage) =>
            (message?.source ?? null) === "google-drive" &&
            (message?.context ?? "onboarding") === "onboarding" &&
            (!state || message?.state === state);

          linkedPromise = waitForPopupMessage<GoogleDriveLinkedMessage>("documents:linked", {
            predicate,
            signal: abortController.signal,
          });

          errorPromise = waitForPopupMessage<GoogleDriveErrorMessage>("documents:error", {
            predicate,
            signal: abortController.signal,
          }).then(payload => {
            const description = payload.message?.trim().length ? payload.message : "Google Drive linking cancelled.";
            throw new Error(description);
          });

          closedPromise = waitForPopupClosed(popup, { signal: abortController.signal }).then(() => {
            throw new Error("Google Drive window closed before completion.");
          });

          const result = await Promise.race([linkedPromise, errorPromise, closedPromise]);
          const { name, externalUrl } = result;
          if (!externalUrl) {
            throw new Error("Google Drive did not return a shareable link.");
          }

          startTransition(() => {
            void enqueueDocumentEmbedAction(brandId, {
              name,
              source: "google-drive",
              externalUrl,
            })
              .then(next => {
                setState(next);
                show({
                  title: "Google Drive library linked",
                  description: `${name} queued for embedding.`,
                  variant: "success",
                });
              })
              .catch(() => {
                show({ title: "Integration failed", description: "Unable to capture the selected document.", variant: "error" });
              });
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unable to link Google Drive. Please try again.";
          show({ title: "Google Drive integration failed", description: message, variant: "error" });
        } finally {
          abortController?.abort();
          const pending: Promise<unknown>[] = [];
          if (linkedPromise) {
            pending.push(linkedPromise.catch(() => undefined));
          }
          if (errorPromise) {
            pending.push(errorPromise.catch(() => undefined));
          }
          if (closedPromise) {
            pending.push(closedPromise.catch(() => undefined));
          }
          try {
            popup?.close();
          } catch {
            // ignore
          }
          if (pending.length > 0) {
            await Promise.all(pending);
          }
          setIsGoogleDriveLinking(false);
        }
        return;
      }

      const popup = openCenteredPopup(`/documents/mock/${source}`, `Connect ${source}`);
      if (!popup) {
        show({ title: "Popup blocked", description: "Enable popups to connect external libraries.", variant: "error" });
        return;
      }

      try {
        const payload = await waitForPopupMessage<{
          type: string;
          source: string;
          name: string;
          externalUrl?: string;
        }>("documents:linked", {
          predicate: message => message.source === source,
        });

        startTransition(() => {
          const action = registerDocumentMetadataAction(brandId, {
            name: payload.name,
            source,
            externalUrl: payload.externalUrl,
            status: "ready",
          });

          void action
            .then(next => {
              setState(next);
              show({ title: `${source} library linked`, description: payload.name, variant: "success" });
            })
            .catch(() => {
              show({ title: "Integration failed", description: "Unable to capture the selected document.", variant: "error" });
            });
        });
      } catch {
        show({ title: "Integration cancelled", description: `We didn't receive a document from ${source}.`, variant: "error" });
      }
    },
    [brandId, setState, setIsGoogleDriveLinking, show, startGoogleDrivePickerMutation, startTransition]
  );

  const removeDocument = useCallback(
    (doc: OnboardingDocument) => {
      startTransition(() => {
        void removeDocumentAction(brandId, doc.id)
          .then(next => {
            setState(next);
            show({ title: "Removed", description: `${doc.name} was removed from the embedder queue.`, variant: "success" });
          })
          .catch(() => {
            show({ title: "Remove failed", description: "We could not remove this document.", variant: "error" });
          });
      });
    },
    [brandId, show]
  );

  const connectGroup = useCallback(
    async (group: "google" | "facebook") => {
      type IntegrationSuccess = {
        type: string;
        provider: string | null;
        accountId?: string | null;
        context?: string;
        state?: string | null;
      };
      type IntegrationError = {
        type: string;
        provider?: string | null;
        context?: string;
        message?: string;
        state?: string | null;
      };
      type PopupResult =
        | { kind: "success"; payload: IntegrationSuccess }
        | { kind: "error"; message: string }
        | { kind: "closed" };

      let cleanupPopup: (() => void) | null = null;
      try {
        const callbackUrl = buildIntegrationCallbackUrl(group, "onboarding");
        const syncResponse =
          group === "google"
            ? await startGoogleSyncMutation.mutateAsync(callbackUrl)
            : await startMetaSyncMutation.mutateAsync(callbackUrl);
        const expectedState = "state" in syncResponse ? syncResponse.state : null;
        const popup = openCenteredPopup(syncResponse.url, `Connect ${group}`);
        if (!popup) {
          show({ title: "Popup blocked", description: "Allow popups to continue.", variant: "error" });
          return;
        }

        const abortCtrl = new AbortController();
        const timeoutId = window.setTimeout(() => {
          try {
            popup?.close();
          } catch {}
          abortCtrl.abort();
        }, 120000);
        const cleanup = () => {
          try {
            abortCtrl.abort();
          } catch {}
          window.clearTimeout(timeoutId);
        };
        cleanupPopup = cleanup;

        const acceptedProviders = group === "facebook" ? new Set(["facebook", "meta"]) : new Set(["google"]);
        const predicate = (message: IntegrationSuccess | IntegrationError) => {
          const provider = message.provider ?? null;
          const providerMatches = provider ? acceptedProviders.has(provider) : true;
          return providerMatches && message.context === "onboarding" && (!expectedState || message.state === expectedState);
        };

        const successPromise = waitForPopupMessage<IntegrationSuccess>("oauth:success", {
          predicate,
          signal: abortCtrl.signal,
        }).then(payload => ({ kind: "success", payload }) as const);

        const errorPromise = waitForPopupMessage<IntegrationError>("oauth:error", {
          predicate,
          signal: abortCtrl.signal,
        }).then(payload => ({ kind: "error", message: payload.message ?? "Connection cancelled." }) as const);

        const closedPromise = waitForPopupClosed(popup, { signal: abortCtrl.signal }).then(
          () => ({ kind: "closed" }) as const
        );

        const result: PopupResult = await Promise.race([successPromise, errorPromise, closedPromise]);

        if (result.kind === "error") {
          cleanup();
          show({ title: "Connection failed", description: result.message, variant: "error" });
          return;
        }

        try {
          popup.close();
        } catch {
          // Popup might already be closed by the callback page.
        }
        cleanup();

        startTransition(() => {
          void (async () => {
            const groups = [group === "google" ? "google" : "meta"] as ("google" | "meta")[];
            const next = await syncIntegrationAccountsAction(brandId, groups);
            setState(next);
            void refetchSelectableAssets();

            const keys = group === "google" ? GOOGLE_OAUTH_KEYS : FACEBOOK_OAUTH_KEYS;
            const didConnect = keys.some(key => {
              const connection = next.connections[key];
              return Boolean(connection?.connected || connection?.accounts?.length || connection?.integrationIds?.length);
            });

            if (!didConnect) {
              show({
                title: "Connection pending",
                description: "We didn't receive account data yet. Try resyncing in a moment.",
                variant: "warning",
              });
              return;
            }

            show({ title: "Connected", description: `Accounts synced for ${group}.`, variant: "success" });
          })().catch(() => {
            show({ title: "Connection failed", description: "Please try again.", variant: "error" });
          });
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Please try again.";
        show({ title: "Connection failed", description: message, variant: "error" });
        cleanupPopup?.();
      }
    },
    [brandId, refetchSelectableAssets, show, startMetaSyncMutation, startGoogleSyncMutation]
  );

  const disconnectGroup = useCallback(
    (group: "google" | "facebook") => {
      startTransition(() => {
        void (async () => {
          const keys = group === "google" ? GOOGLE_OAUTH_KEYS : FACEBOOK_OAUTH_KEYS;
          let next: OnboardingState | null = null;
          for (const key of keys) {
            next = await clearPlatformConnectionAction(brandId, key);
          }
          if (next) setState(next);
          // Clear any local selections for these providers
          setSelectedAccountIdsByKey(prev => {
            const copy: Record<PlatformKey, Set<string>> = {
              youtube: new Set(prev.youtube),
              googleAds: new Set(prev.googleAds),
              dv360: new Set(prev.dv360),
              instagram: new Set(prev.instagram),
              facebook: new Set(prev.facebook),
              threads: new Set(prev.threads),
              tiktok: new Set(prev.tiktok),
              linkedin: new Set(prev.linkedin),
              amazonAds: new Set(prev.amazonAds),
            };
            for (const key of keys) {
              copy[key].clear();
            }
            return copy;
          });
          show({ title: "Disconnected", description: `Removed ${group} integrations.`, variant: "success" });
        })().catch(() => {
          show({ title: "Unable to disconnect", description: "Please retry shortly.", variant: "error" });
        });
      });
    },
    [brandId, show]
  );

  const resyncGroup = useCallback(
    (group: "google" | "facebook") => {
      startTransition(() => {
        void (async () => {
          const groups = [group === "google" ? "google" : "meta"] as ("google" | "meta")[];
          const next = await syncIntegrationAccountsAction(brandId, groups);
          setState(next);
          void refetchSelectableAssets();
          show({ title: "Synced", description: `Pulled the latest accounts for ${group}.`, variant: "success" });
        })().catch(() => {
          show({ title: "Sync failed", description: "Unable to refresh this integration.", variant: "error" });
        });
      });
    },
    [brandId, refetchSelectableAssets, show]
  );

  const refreshAllIntegrations = useCallback(() => {
    startTransition(() => {
      void (async () => {
        const groups: ("google" | "meta")[] = ["google", "meta"];
        const next = await syncIntegrationAccountsAction(brandId, groups);
        setState(next);
        void refetchSelectableAssets();
      })().catch(() => {
        show({ title: "Refresh failed", description: "Unable to sync accounts.", variant: "error" });
      });
    });
  }, [brandId, refetchSelectableAssets, show]);

  const showIntegrationSelectionToast = useCallback(
    (checked: boolean, label?: string | null, count?: number) => {
      show(createIntegrationSelectionToastOptions({ checked, label, count }));
    },
    [show]
  );

  const handleToggleAccount = useCallback(
    (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => {
      setSelectedAccountIdsByKey(prev => {
        const next = { ...prev };
        const set = new Set(next[provider]);
        if (checked) set.add(accountId);
        else set.delete(accountId);
        next[provider] = set;
        return next;
      });
      showIntegrationSelectionToast(checked, label ?? null);
    },
    [showIntegrationSelectionToast]
  );

  const handleToggleSelectableAssets = useCallback(
    (assets: SelectableAsset[], checked: boolean) => {
      let selectableCount = 0;
      setSelectedAccountIdsByKey(prev => {
        const next: Record<PlatformKey, Set<string>> = { ...prev };
        const workingSets = new Map<PlatformKey, Set<string>>();

        for (const asset of assets) {
          if (!asset.integration_account_id) continue;
          const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
          if (!platformKey) continue;
          selectableCount += 1;
          const working = workingSets.get(platformKey) ?? new Set(prev[platformKey]);
          if (checked) working.add(asset.integration_account_id);
          else working.delete(asset.integration_account_id);
          workingSets.set(platformKey, working);
        }

        workingSets.forEach((set, key) => {
          next[key] = set;
        });

        return next;
      });
      if (selectableCount > 0) {
        showIntegrationSelectionToast(checked, null, selectableCount);
      }
    },
    [showIntegrationSelectionToast]
  );

  const canContinueFrom = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex === 0) {
        // Phase 1 gating: only require a brand name (>= 2 chars). Other fields are optional.
        const name = (getValues("name") || "").trim();
        return name.length >= 2 && selectedVoiceTags.length <= 8;
      }
      if (stepIndex === 1) {
        return connectedKeys.length > 0;
      }
      return true;
    },
    [connectedKeys.length, getValues, selectedVoiceTags.length]
  );

  const handleNext = useCallback(() => {
    if (isAgentRunning) return;
    if (step === 0) {
      const name = (getValues("name") || "").trim();
      if (name.length < 2) {
        setError("name", { type: "manual", message: "Brand name is required" });
        return;
      }
      // Submit current form values; server will persist and advance step.
      handleBrandSubmit({ ...getValues(), name } as BrandForm);
      return;
    }

    const nextStep = Math.min(step + 1, 2);
    if (step === 1) {
      const selectedIds = getAllSelectedIds();
      startTransition(() => {
        void (async () => {
          if (selectedIds.length > 0 || getAllAvailableIds().length > 0) {
            await associateIntegrationAccountsAction(brandId, selectedIds, getAllAvailableIds());
          }
          const next = await mutateOnboardingStateAction(brandId, { step: nextStep });
          setState(next);
        })().catch(() => {
          show({ title: "Progress blocked", description: "Unable to save your selections.", variant: "error" });
        });
      });
      return;
    }
    startTransition(() => {
      void mutateOnboardingStateAction(brandId, { step: nextStep })
        .then(next => {
          setState(next);
        })
        .catch(() => {
          show({ title: "Progress blocked", description: "Unable to save your progress.", variant: "error" });
        });
    });
  }, [brandId, getValues, handleBrandSubmit, isAgentRunning, setError, show, step, getAllSelectedIds, getAllAvailableIds]);

  const handleBack = useCallback(() => {
    if (isAgentRunning) return;
    const previousStep = Math.max(step - 1, 0);
    startTransition(() => {
      void mutateOnboardingStateAction(brandId, { step: previousStep })
        .then(next => {
          setState(next);
        })
        .catch(() => {
          show({ title: "Navigation failed", description: "Unable to go back.", variant: "error" });
        });
    });
  }, [brandId, isAgentRunning, show, step]);

  const persistPreviewState = useCallback(
    (payload: OnboardingPreviewWorkflowResult) => {
      const completedAt = new Date().toISOString();
      startTransition(() => {
        void mutateOnboardingStateAction(brandId, { preview: { completedAt, payload } })
          .then(next => {
            setState(next);
          })
          .catch(() => {
            show({
              title: "Preview save failed",
              description: "We couldn't persist the preview, but you can still continue.",
              variant: "error",
            });
          });
      });
    },
    [brandId, show, startTransition]
  );

  const startPreview = useCallback(async () => {
    if (isAgentRunning) return;

    const selectedIds = getAllSelectedIds();
    if (selectedIds.length > 0 || getAllAvailableIds().length > 0) {
      try {
        await associateIntegrationAccountsAction(brandId, selectedIds, getAllAvailableIds());
      } catch {
        show({ title: "Save failed", description: "Could not save your integration selections.", variant: "error" });
        return;
      }
    }

    let payload: AgentRequestPayload;
    try {
      payload = buildAgentPayload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid brand profile. Please review your inputs.";
      show({ title: "Incomplete details", description: message, variant: "error" });
      return;
    }

    previewPayloadRef.current = payload;
    setIsPreviewVisible(true);
    stopPreview();
    resetPreviewState();
    setHasPreviewRun(true);

    const controller = new AbortController();
    previewAbortRef.current = controller;
    setIsAgentRunning(true);

    try {
      await checkOnboardingAgentHealth({ signal: controller.signal });
      const result: RunOnboardingPreviewResult = await runOnboardingPreview({
        payload,
        signal: controller.signal,
        onEvent: handleAgentPreviewEvent,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (result.brandProfile) {
        setAgentBrandProfile(result.brandProfile);
      }
      if (result.structured) {
        setAgentWebsite(result.structured.website);
        setAgentBusiness(result.structured.business ?? null);
      }
      if (result.complete) {
        setPreviewCompletePayload(result.complete);
        persistPreviewState(result.complete);
      }
      // If the stream ends without emitting a complete payload, consider the preview ready
      // when we received any structured/profile data and no errors.
      if (!result.complete && !controller.signal.aborted) {
        const previewHasData = Boolean(result.brandProfile || result.structured);
        if (previewHasData) {
          const fallbackPayload: OnboardingPreviewWorkflowResult = {
            ...(result.brandProfile ? { brand_profile: result.brandProfile } : {}),
            ...(result.structured ? { structured: result.structured } : {}),
          };
          setPreviewCompletePayload(fallbackPayload);
          persistPreviewState(fallbackPayload);
          setAgentPhases(prev => {
            const next = { ...prev };
            for (const phase of agentPhaseKeys) {
              if (next[phase] === "pending" || next[phase] === "idle") {
                next[phase] = "completed";
              }
            }
            return next;
          });
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Unable to generate the onboarding preview. Please try again.";
      setAgentError(message);
      setAgentPhases(prev => {
        const next = { ...prev };
        for (const phase of agentPhaseKeys) {
          if (next[phase] !== "completed") {
            next[phase] = "error";
          }
        }
        return next;
      });
      show({ title: "Preview failed", description: message, variant: "error" });
    } finally {
      setIsAgentRunning(false);
      if (previewAbortRef.current === controller) {
        previewAbortRef.current = null;
      }
    }
  }, [
    brandId,
    buildAgentPayload,
    getAllSelectedIds,
    getAllAvailableIds,
    handleAgentPreviewEvent,
    isAgentRunning,
    persistPreviewState,
    resetPreviewState,
    show,
    stopPreview,
  ]);

  const handleExitPreview = useCallback(() => {
    if (isAgentRunning) return;
    setIsPreviewVisible(false);
    setPreviewEditMode({
      voice: false,
      audience: false,
      website: false,
      business: false,
    });
  }, [isAgentRunning]);

  const completeOnboarding = useCallback(() => {
    if (isAgentRunning) return;
    if (!previewCompletePayload) {
      show({ title: "Preview required", description: "Generate and review your preview before approval.", variant: "error" });
      return;
    }

    startTransition(() => {
      void (async () => {
        const refreshedPayload = buildAgentPayload();
        previewPayloadRef.current = refreshedPayload;
        const selectedIds = getAllSelectedIds();
        const availableIds = getAllAvailableIds();
        if (availableIds.length > 0 && selectedIds.length === 0) {
          show({
            title: "Select an ad account",
            description: "Choose at least one ad account before approving onboarding.",
            variant: "error",
          });
          return;
        }
        if (selectedIds.length > 0) {
          await applyBrandProfileIntegrationAccounts({ brandId, integrationAccountIds: selectedIds });
        }
        const approval = await approveOnboardingBrandProfile({ payload: refreshedPayload });
        setAgentBrandProfile(approval.brand_profile);
        const next = await completeOnboardingAction(brandId);
        setState(next);
        await requestStrategicRunsCatchUp(brandId);
        show({ title: "Onboarding complete", description: "Redirecting to your dashboard.", variant: "success" });
        sessionStorage.setItem('from_onboarding', 'true');
        router.replace("/dashboard");
      })().catch(error => {
        const message =
          error instanceof Error ? error.message : "Unable to finalize onboarding. Please try again.";
        show({ title: "Completion failed", description: message, variant: "error" });
      });
    });
  }, [
    brandId,
    buildAgentPayload,
    getAllAvailableIds,
    getAllSelectedIds,
    isAgentRunning,
    previewCompletePayload,
    router,
    show,
    startTransition,
  ]);

  const isPreviewRunning = isAgentRunning;
  const isCompleting = isPending;
  const shouldShowPreview = isPreviewVisible || isPreviewRunning;

  const renderBrandTags = () => (
    <Flex wrap="wrap" gap="2">
      {BRAND_VOICE_TAGS.map(tag => {
        const active = selectedVoiceTags.includes(tag);
        return (
          <Button
            key={tag}
            variant={active ? "solid" : "outline"}
            color={active ? "violet" : "gray"}
            size="1"
            onClick={() => {
              setSelectedVoiceTags(prev =>
                prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
              );
            }}
            type="button"
          >
            {tag}
          </Button>
        );
      })}
    </Flex>
  );

  const renderBadgeList = (items?: string[] | null, emptyLabel: string = "No data available.") => {
    if (!items || items.length === 0) {
      return (
        <Text color="gray" size="1">
          {emptyLabel}
        </Text>
      );
    }
    return (
      <Flex wrap="wrap" gap="1" className="max-w-full min-w-0">
        {items.map(item => (
          <Badge
            key={item}
            color="gray"
            variant="soft"
            className="max-w-full whitespace-normal break-words text-left leading-snug"
          >
            {item}
          </Badge>
        ))}
      </Flex>
    );
  };

  const renderPreviewSection = (title: string, content: ReactNode, action?: ReactNode) => (
    <Box
      key={title}
      className="border-t pt-3 first:border-t-0 first:pt-0 min-w-0"
      style={{ wordBreak: "break-word", borderColor: "var(--border)" }}
    >
      <Flex align="center" justify="between" gap="2">
        <Text size="2" weight="medium">
          {title}
        </Text>
        {action}
      </Flex>
      <Box className="mt-2 min-w-0" style={{ wordBreak: "break-word" }}>
        {content}
      </Box>
    </Box>
  );

  const renderInlineEditor = (value: string, onChange: (html: string) => void, placeholder: string) => (
    <EditorProvider>
      <Editor
        value={value}
        onChange={event => onChange((event as unknown as { target: { value: string } }).target.value)}
        disabled={isPreviewRunning || isCompleting}
        placeholder={placeholder}
        containerProps={{
          className: "rsw-editor bg-transparent border-none shadow-none p-0 m-0",
          style: { padding: 0, background: "transparent", border: "none" },
        }}
        className="rsw-ce min-h-[60px] text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none bg-transparent border-none p-0 whitespace-pre-wrap break-words"
        style={{ whiteSpace: "pre-wrap", background: "transparent", border: "none", padding: 0, wordBreak: "break-word", overflowWrap: "anywhere", width: "100%" }}
      />
    </EditorProvider>
  );

  const renderDocumentsList = () => {
    if (brandDocuments.length === 0) {
      return <Text color="gray">No documents added yet. Bring your brand voice and visual libraries to kick-start personalization.</Text>;
    }

    return (
      <Flex direction="column" gap="2">
        {brandDocuments.map(doc => (
          <Card key={doc.id} className={glassPanelClassName} style={glassPanelStyle}>
            <Flex align="center" justify="between" p="3" gap="3">
              <Flex direction="column" gap="1">
                <Text weight="medium">{doc.name}</Text>
                <Flex gap="2" align="center">
                  <Badge color="gray">
                    <Flex align="center" gap="1">
                      <DocumentSourceIcon source={doc.source} />
                      <span>{doc.source}</span>
                    </Flex>
                  </Badge>
                  <Text size="1" color="gray">
                    {new Date(doc.createdAt).toLocaleString()} ·
                  </Text>
                  {doc.status === "ready" && <Badge color="green" variant="soft">Ready</Badge>}
                  {doc.status === "processing" && <Badge color="amber" variant="soft">Processing</Badge>}
                  {doc.status === "error" && <Badge color="red" variant="soft">Error</Badge>}
                </Flex>
                {doc.status === "error" && doc.errorMessage && (
                  <Text size="1" color="red">{doc.errorMessage}</Text>
                )}
              </Flex>
              <Button
                variant="ghost"
                color="red"
                onClick={() => removeDocument(doc)}
                disabled={isPending || isAgentRunning}
                size="1"
                aria-label={`Remove ${doc.name}`}
              >
                <TrashIcon />
              </Button>
            </Flex>
          </Card>
        ))}
      </Flex>
    );
  };

  const renderReviewSummary = () => {
    const isSummaryActionDisabled = isPending || isPreviewRunning;
    const hasSavedPreview = Boolean(previewCompletePayload || state.preview?.payload);
    const handlePreviewAction = () => {
      if (hasSavedPreview) {
        if (!previewCompletePayload && state.preview?.payload) {
          hydratePreviewPayload(state.preview.payload);
        }
        setIsPreviewVisible(true);
        return;
      }
      void startPreview();
    };
    return (
      <Card className={`${glassPanelClassName} w-full max-w-none`} style={glassPanelStyle}>
        <Flex direction="column" gap="4" p="4">
          <Heading size="4">Review</Heading>
          <Text color="gray">
            Confirm your workspace setup, then generate a preview to stream the AI recommendations before approval.
          </Text>
          <Card variant="surface" className={glassPanelClassName} style={glassPanelStyle}>
            <Flex direction="column" gap="2" p="3">
              <Text size="2" weight="medium">Brand profile</Text>
              <Text>{state.brand.name}</Text>
              <Flex gap="2">
                <Badge color="violet">{state.brand.industry || "Industry not set"}</Badge>
                <Badge color="gray">{state.brand.timezone}</Badge>
              </Flex>
              {state.brand.website && (
                <Text color="gray" size="2">Website: {state.brand.website}</Text>
              )}
              {logoPreviewUrl && (
                <Flex align="center" gap="2" className="mt-1">
                  <Text size="2" color="gray">Logo:</Text>
                  <Image
                    src={logoPreviewUrl}
                    alt="Brand logo"
                    width={40}
                    height={40}
                    unoptimized
                    className="h-10 w-10 rounded object-contain p-1 border"
                    style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
                  />
                </Flex>
              )}
              {state.brand.brandVoice && (
                <Text color="gray" size="2">Voice: {state.brand.brandVoice}</Text>
              )}
              {state.brand.brandVoiceTags.length > 0 && (
                <Flex gap="1" wrap="wrap">
                  {state.brand.brandVoiceTags.map(tag => (
                    <Badge key={tag} color="green">
                      {tag}
                    </Badge>
                  ))}
                </Flex>
              )}
              {state.brand.targetAudience && (
                <Text color="gray" size="2">Target audience: {state.brand.targetAudience}</Text>
              )}
            </Flex>
          </Card>

          <Card variant="surface" className={glassPanelClassName} style={glassPanelStyle}>
            <Flex direction="column" gap="2" p="3">
              <Text size="2" weight="medium">Brand documents</Text>
              {brandDocuments.length ? (
                <Flex direction="column" gap="1">
                  {brandDocuments.map(doc => (
                    <Flex key={doc.id} align="center" justify="between">
                      <Text size="2">{doc.name}</Text>
                      <Badge color="gray">{doc.source}</Badge>
                    </Flex>
                  ))}
                </Flex>
              ) : (
                <Text color="gray" size="2">No documents uploaded.</Text>
              )}
            </Flex>
          </Card>

          <Card variant="surface" className={glassPanelClassName} style={glassPanelStyle}>
            <Flex direction="column" gap="2" p="3">
              <Text size="2" weight="medium">Connected platforms</Text>
              {connectedKeys.length ? (
                <Flex direction="column" gap="2">
                  {connectedKeys.map(provider => {
                    const connection = state.connections[provider];
                    const label = PLATFORMS.find(p => p.key === provider)?.label ?? provider;
                    const accountLabels = getReviewAccountLabels(provider);
                    const isConnected = Boolean(connection?.connected);
                    const statusLabel = isConnected ? "Connected" : "Selected";
                    const statusColor = isConnected ? "green" : "violet";
                    return (
                      <Card
                        key={provider}
                        variant="surface"
                        className={glassPanelClassName}
                        style={glassPanelStyle}
                      >
                        <Flex direction="column" gap="1" p="2">
                          <Flex justify="between">
                            <Text>{label}</Text>
                            <Badge color={statusColor}>{statusLabel}</Badge>
                          </Flex>
                          {accountLabels.length > 0 ? (
                            <Flex wrap="wrap" gap="2">
                              {accountLabels.map(accountLabel => (
                                <Badge key={`${provider}-${accountLabel}`} color="violet">
                                  {accountLabel}
                                </Badge>
                              ))}
                            </Flex>
                          ) : (
                            <Text color="gray" size="1">No accounts synced yet.</Text>
                          )}
                        </Flex>
                      </Card>
                    );
                  })}
                </Flex>
              ) : (
                <Text color="gray" size="2">No integrations connected.</Text>
              )}
            </Flex>
          </Card>

          <Callout.Root color="green">
            <Callout.Icon>
              <CheckCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              You can manage integrations and brand assets anytime from Settings.
            </Callout.Text>
          </Callout.Root>

          <Flex justify="between" align="center">
            <Button
              type="button"
              variant="ghost"
              color="gray"
              onClick={handleClear}
              disabled={isSummaryActionDisabled}
            >
              Clear
            </Button>
            <Flex gap="2">
              <Button variant="soft" onClick={handleBack} disabled={isSummaryActionDisabled}>
                Back
              </Button>
              <Button onClick={handlePreviewAction} disabled={isSummaryActionDisabled}>
                {isPreviewRunning ? (
                  <>
                    <ReloadIcon className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  hasSavedPreview ? "View preview" : "Generate preview"
                )}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Card>
    );
  };

  const renderPreviewScreen = () => {
    const allPhasesCompleted = agentPhaseKeys.every(phase => agentPhases[phase] === "completed");
    const hasAgentContent = Boolean(
      agentBrandProfile || agentVoice || agentAudience || agentWebsite || agentBusiness
    );
    const hasInlineEdits = Boolean(voiceHtml.trim() || audienceHtml.trim());
    const previewReady =
      hasPreviewRun &&
      !agentError &&
      !isPreviewRunning &&
      (Boolean(previewCompletePayload) || allPhasesCompleted || hasAgentContent || hasInlineEdits);
    const approveDisabled = isCompleting || isPreviewRunning || !previewReady;
    const streamingBrandProfile = agentStreams.brand_profile;
    const streamingVoice = agentStreams.voice;
    const streamingAudience = agentStreams.audience;
    const streamingWebsite = agentStreams.website;
    const streamingBusiness = agentStreams.business;
    const editActionDisabled = isPreviewRunning || isCompleting;
    const voiceIsEditing = previewEditMode.voice;
    const audienceIsEditing = previewEditMode.audience;
    const websiteIsEditing = previewEditMode.website;
    const businessIsEditing = previewEditMode.business;
    const voiceReadOnlyText = stripHtmlToText(voiceHtml);
    const audienceReadOnlyText = stripHtmlToText(audienceHtml);
    const websiteReadOnlyText = stripHtmlToText(websiteHtml);
    const businessReadOnlyText = stripHtmlToText(businessHtml);
    const audienceDemographics = (() => {
      const entries = splitLinesToArray(stripHtmlToText(demographicsHtml));
      return entries.length ? entries : agentAudience?.demographics;
    })();
    const previewStatusBadges = (
      <Flex wrap="wrap" gap="2">
        {agentPhaseKeys.map(phase => (
          <Badge key={phase} color={phaseStatusColor[agentPhases[phase]]}>
            {phaseLabel[phase]} · {phaseStatusCopy[agentPhases[phase]]}
          </Badge>
        ))}
      </Flex>
    );

    const brandProfileContent = agentBrandProfile ? (
      <Flex direction="column" gap="2">
        <Text weight="medium">{agentBrandProfile.brand_name}</Text>
        {agentBrandProfile.description && (
          <SafeMarkdown
            content={agentBrandProfile.description}
            mode="static"
            className="text-sm text-secondary"
          />
        )}
        {agentBrandProfile.website_url && <Text color="gray" size="2">Website: {agentBrandProfile.website_url}</Text>}
      </Flex>
    ) : (
      streamingBrandProfile ? (
        <SafeMarkdown
          content={streamingBrandProfile}
          isAnimating
          className="text-sm text-secondary"
        />
      ) : (
        <Text color="gray" size="2">Awaiting brand profile…</Text>
      )
    );

    const voiceEditable = agentPhases.voice === "completed" || Boolean(previewCompletePayload?.brand_profile?.brand_voice);
    const voiceContent = voiceEditable ? (
      voiceIsEditing ? (
        <Flex direction="column" gap="2">
          {renderInlineEditor(voiceHtml, handleVoiceEdit, "Refine tone, style, and messaging")}
          <Box>
            <Text size="1" color="gray">Keywords</Text>
            <Box className="mt-1">{renderBadgeList(agentVoice?.keywords, "No keywords identified yet.")}</Box>
          </Box>
        </Flex>
      ) : (
        <Flex direction="column" gap="2">
          {voiceReadOnlyText ? (
            <SafeMarkdown
              content={voiceReadOnlyText}
              mode="static"
              className="text-sm text-secondary"
            />
          ) : (
            <Text color="gray" size="2">No voice summary yet.</Text>
          )}
          <Box>
            <Text size="1" color="gray">Keywords</Text>
            <Box className="mt-1">{renderBadgeList(agentVoice?.keywords, "No keywords identified yet.")}</Box>
          </Box>
        </Flex>
      )
    ) : streamingVoice ? (
      <SafeMarkdown
        content={streamingVoice}
        isAnimating
        className="text-sm text-secondary"
      />
    ) : (
      <Text color="gray" size="2">Awaiting voice insights…</Text>
    );

    const audienceEditable = agentPhases.audience === "completed" || Boolean(previewCompletePayload?.structured?.target_audience || agentAudience);
    const audienceContent = audienceEditable ? (
      audienceIsEditing ? (
        <Flex direction="column" gap="2">
          {renderInlineEditor(audienceHtml, handleAudienceEdit, "Refine audience summary and segments")}
          <Box>
            <Text size="1" color="gray">Demographics</Text>
            {renderInlineEditor(demographicsHtml, handleDemographicsEdit, "Edit demographics (one per line)")}
          </Box>
          <Box>
            <Text size="1" color="gray">Motivations</Text>
            <Box className="mt-1">{renderBadgeList(agentAudience?.motivations, "No motivations yet.")}</Box>
          </Box>
        </Flex>
      ) : (
        <Flex direction="column" gap="2">
          {audienceReadOnlyText ? (
            <SafeMarkdown
              content={audienceReadOnlyText}
              mode="static"
              className="text-sm text-secondary"
            />
          ) : (
            <Text color="gray" size="2">No audience summary yet.</Text>
          )}
          <Box>
            <Text size="1" color="gray">Demographics</Text>
            <Box className="mt-1">{renderBadgeList(audienceDemographics, "No demographics yet.")}</Box>
          </Box>
          <Box>
            <Text size="1" color="gray">Motivations</Text>
            <Box className="mt-1">{renderBadgeList(agentAudience?.motivations, "No motivations yet.")}</Box>
          </Box>
        </Flex>
      )
    ) : streamingAudience ? (
      <SafeMarkdown
        content={streamingAudience}
        isAnimating
        className="text-sm text-secondary"
      />
    ) : (
      <Text color="gray" size="2">Awaiting audience insights…</Text>
    );

    const websiteEditable = agentPhases.website === "completed" || Boolean(previewCompletePayload?.structured?.website || agentWebsite);
    const websiteContent = websiteEditable ? (
      websiteIsEditing ? (
        <Flex direction="column" gap="2">
          {agentWebsite?.website_url && <Text color="gray" size="2">URL: {agentWebsite.website_url}</Text>}
          {renderInlineEditor(websiteHtml, handleWebsiteEdit, "Edit hero statement")}
        </Flex>
      ) : (
        <Flex direction="column" gap="2">
          {agentWebsite?.website_url && <Text color="gray" size="2">URL: {agentWebsite.website_url}</Text>}
          {websiteReadOnlyText ? (
            <SafeMarkdown
              content={websiteReadOnlyText}
              mode="static"
              className="text-sm text-secondary"
            />
          ) : (
            <Text color="gray" size="2">No website summary yet.</Text>
          )}
        </Flex>
      )
    ) : streamingWebsite ? (
      <SafeMarkdown
        content={streamingWebsite}
        isAnimating
        className="text-sm text-secondary"
      />
    ) : (
      <Text color="gray" size="2">Awaiting website summary…</Text>
    );

    const businessEditable = agentPhases.business === "completed" || Boolean(previewCompletePayload?.structured?.business || agentBusiness);
    const businessContent = businessEditable ? (
      businessIsEditing ? (
        <Flex direction="column" gap="2">
          {agentBusiness?.business_name && <Text weight="medium">{agentBusiness.business_name}</Text>}
          {renderInlineEditor(businessHtml, handleBusinessEdit, "Edit business overview")}
          <Box>
            <Text size="1" color="gray">Features</Text>
            <Box className="mt-1">{renderBadgeList(agentBusiness?.business_features, "No features captured yet.")}</Box>
          </Box>
          <Box>
            <Text size="1" color="gray">Benefits</Text>
            <Box className="mt-1">{renderBadgeList(agentBusiness?.business_benefits, "No benefits captured yet.")}</Box>
          </Box>
          {agentBusiness?.business_cta && <Text color="gray" size="2">CTA: {agentBusiness.business_cta}</Text>}
        </Flex>
      ) : (
        <Flex direction="column" gap="2">
          {agentBusiness?.business_name && <Text weight="medium">{agentBusiness.business_name}</Text>}
          {businessReadOnlyText ? (
            <SafeMarkdown
              content={businessReadOnlyText}
              mode="static"
              className="text-sm text-secondary"
            />
          ) : (
            <Text color="gray" size="2">No business overview yet.</Text>
          )}
          <Box>
            <Text size="1" color="gray">Features</Text>
            <Box className="mt-1">{renderBadgeList(agentBusiness?.business_features, "No features captured yet.")}</Box>
          </Box>
          <Box>
            <Text size="1" color="gray">Benefits</Text>
            <Box className="mt-1">{renderBadgeList(agentBusiness?.business_benefits, "No benefits captured yet.")}</Box>
          </Box>
          {agentBusiness?.business_cta && <Text color="gray" size="2">CTA: {agentBusiness.business_cta}</Text>}
        </Flex>
      )
    ) : streamingBusiness ? (
      <SafeMarkdown
        content={streamingBusiness}
        isAnimating
        className="text-sm text-secondary"
      />
    ) : (
      <Text color="gray" size="2">Awaiting business summary…</Text>
    );

    const sections = [
      { title: "Brand profile", content: brandProfileContent },
      {
        title: "Voice",
        content: voiceContent,
        action: voiceEditable ? (
          <Button
            type="button"
            variant="ghost"
            size="1"
            color="gray"
            disabled={editActionDisabled}
            onClick={() => togglePreviewEditMode("voice")}
          >
            {voiceIsEditing ? "Done" : "Edit"}
          </Button>
        ) : null,
      },
      {
        title: "Audience",
        content: audienceContent,
        action: audienceEditable ? (
          <Button
            type="button"
            variant="ghost"
            size="1"
            color="gray"
            disabled={editActionDisabled}
            onClick={() => togglePreviewEditMode("audience")}
          >
            {audienceIsEditing ? "Done" : "Edit"}
          </Button>
        ) : null,
      },
      {
        title: "Business overview",
        content: businessContent,
        action: businessEditable ? (
          <Button
            type="button"
            variant="ghost"
            size="1"
            color="gray"
            disabled={editActionDisabled}
            onClick={() => togglePreviewEditMode("business")}
          >
            {businessIsEditing ? "Done" : "Edit"}
          </Button>
        ) : null,
      },
      {
        title: "Website",
        content: websiteContent,
        action: websiteEditable ? (
          <Button
            type="button"
            variant="ghost"
            size="1"
            color="gray"
            disabled={editActionDisabled}
            onClick={() => togglePreviewEditMode("website")}
          >
            {websiteIsEditing ? "Done" : "Edit"}
          </Button>
        ) : null,
      },
    ];

    const [brandProfileSection, ...otherSections] = sections;
    const leftSections = otherSections.filter((_, index) => index % 2 === 0);
    const rightSections = otherSections.filter((_, index) => index % 2 === 1);

    return (
      <Card className={`${glassPanelClassName} w-full max-w-none`} style={glassPanelStyle}>
        <Flex direction="column" gap="4" p="4">
          <Flex align="center" justify="between">
            <Heading size="4">Preview & Approve</Heading>
            <Flex gap="2">
              <Button variant="ghost" color="gray" onClick={handleExitPreview} disabled={isPreviewRunning}>
                Review summary
              </Button>
              <Button
                variant="ghost"
                color="gray"
                onClick={isPreviewRunning ? stopPreview : startPreview}
                disabled={isCompleting}
              >
                {isPreviewRunning ? (
                  <>
                    <ReloadIcon className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Stop preview
                  </>
                ) : (
                  "Regenerate preview"
                )}
              </Button>
            </Flex>
          </Flex>

          {agentError ? (
            <Callout.Root color="red">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>{agentError}</Callout.Text>
            </Callout.Root>
          ) : (
            <Text color="gray">
              {isPreviewRunning
                ? "Streaming preview responses…"
                : previewReady
                  ? "Preview complete. Review the AI-generated sections and approve when ready."
                  : "Preview data is loading. Sections update as soon as each agent finishes."}
            </Text>
          )}

          {previewStatusBadges}

          <Card
            variant="surface"
            className={`${glassPanelClassName} w-full max-w-none`}
            style={glassPanelStyle}
          >
            <Flex direction="column" gap="3" p="3">
              {renderPreviewSection(brandProfileSection.title, brandProfileSection.content, brandProfileSection.action)}
              <Grid columns={{ initial: "1", md: "2" }} gap="4" className="items-start" style={{ alignItems: "flex-start" }}>
                <Flex direction="column" gap="3" className="min-w-0" style={{ minWidth: 0 }}>
                  {leftSections.map(section => renderPreviewSection(section.title, section.content, section.action))}
                </Flex>
                <Flex direction="column" gap="3" className="min-w-0" style={{ minWidth: 0 }}>
                  {rightSections.map(section => renderPreviewSection(section.title, section.content, section.action))}
                </Flex>
              </Grid>
            </Flex>
          </Card>

          <Flex justify="between" align="center">
            <Button
              type="button"
              variant="ghost"
              color="gray"
              onClick={handleClear}
              disabled={isCompleting || isPreviewRunning}
            >
              Clear
            </Button>
            <Flex gap="2">
              <Button
                variant="soft"
                onClick={handleBack}
                disabled={isCompleting || isPreviewRunning}
              >
                Back
              </Button>
              <Button onClick={completeOnboarding} disabled={approveDisabled}>
                {isCompleting ? (
                  <>
                    <ReloadIcon className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Finalizing
                  </>
                ) : (
                  "Approve & complete"
                )}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Card>
    );
  };

  return (
    <>
      <StrategicAnalysisRealtimeListener brandId={brandId} />
      <Container size="4" className="max-w-7xl w-full">
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between" gap="3" className="w-full">
            <Box>
              <Heading size="6">Welcome to Continuum</Heading>
              <Text color="gray">Set up your workspace so Continuum can produce on-brand creative from day one.</Text>
            </Box>
            {hasAdditionalBrands ? <div className="ml-auto"><BrandSwitcherMenu /></div> : null}
          </Flex>

          <Tabs.Root baseId={`radix-onboarding-tabs-${brandId}`} value={`step-${step}`} onValueChange={() => {}}>
          <Tabs.List className="grid grid-cols-3 gap-3 md:flex md:gap-4 md:justify-start">
            <Tabs.Trigger value="step-0" className="flex-1 rounded-full px-4 py-2">Brand profile</Tabs.Trigger>
            <Tabs.Trigger value="step-1" className="flex-1 rounded-full px-4 py-2">Integrations</Tabs.Trigger>
            <Tabs.Trigger value="step-2" className="flex-1 rounded-full px-4 py-2">Review</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="step-0">
            <Card className={glassPanelClassName} style={glassPanelStyle}>
              <form
                onSubmit={handleSubmit(data => {
                  handleBrandSubmit(data);
                })}
              >
                <Flex direction="column" gap="4" p="4">
                  <Heading size="4">Tell us about your brand</Heading>
                  <Box>
                    <Text size="2" weight="medium">
                      Brand name
                    </Text>
                  <TextField.Root
                    placeholder="e.g. Continuum Collective"
                    {...register("name", {
                      onChange: () => {
                        userEditedRef.current.name = true;
                      },
                    })}
                  />
                    {errors.name?.message && <Text color="red" size="1">{errors.name.message}</Text>}
                  </Box>
                  <Box>
                    <Text size="2" weight="medium">
                      Website
                    </Text>
                    <TextField.Root
                      placeholder="https://example.com"
                      {...register("website", {
                        required: "Website is required",
                        onChange: () => {
                          websiteTouchedRef.current = true;
                          userEditedRef.current.website = true;
                        },
                      })}
                      onFocus={() => {
                        websiteTouchedRef.current = true;
                      }}
                      onPaste={(event) => {
                        websiteTouchedRef.current = true;
                        userEditedRef.current.website = true;
                        const pasted = event.clipboardData.getData("text");
                        const resolved = resolveWebsiteDraftUrl(pasted);
                        const target = event.currentTarget as HTMLInputElement;
                        window.setTimeout(() => {
                          const fallback = resolveWebsiteDraftUrl(target.value ?? "");
                          const url = resolved ?? fallback;
                          if (url) {
                            maybeStartDraftingFromWebsite(url);
                          }
                        }, 0);
                      }}
                      onBlur={() => {
                        maybeStartDraftingFromWebsite(websiteValue ?? "");
                      }}
                    />
                    {errors.website?.message && <Text color="red" size="1">{errors.website.message}</Text>}
                  </Box>
                  <Box>
                    <Text size="2" weight="medium">
                      Industry
                    </Text>
                    <Select.Root
                      value={industryValue || industries[0]}
                      onValueChange={value => setValue("industry", value, { shouldDirty: true })}
                    >
                      <Select.Trigger placeholder="Select industry" />
                      <Select.Content>
                        {industries.map(industry => (
                          <Select.Item key={industry} value={industry}>
                            {industry}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                    {industryValue === "Other" && (
                      <div className="mt-2">
                        <Text size="2" weight="medium">Custom industry</Text>
                        <TextField.Root placeholder="Type your industry" {...register("otherIndustry")} />
                        {errors.otherIndustry?.message && <Text color="red" size="1">{errors.otherIndustry.message}</Text>}
                      </div>
                    )}
                    {errors.industry?.message && <Text color="red" size="1">{errors.industry.message}</Text>}
                  </Box>
                  <Flex direction="column" gap="2">
                    <Text size="2" weight="medium">
                      Brand voice (optional)
                    </Text>
                    <TextArea
                      placeholder="Describe your brand tone and style"
                      rows={10}
                      style={{ height: 260, minHeight: 260 }}
                      {...register("brandVoice", {
                        onChange: () => (userEditedRef.current.brandVoice = true),
                      })}
                    />
                    <Text size="1" color="gray">
                      Use keywords to guide the AI, or choose from our preset tags.
                    </Text>
                    {renderBrandTags()}
                  </Flex>
                  <Box>
                    <Text size="2" weight="medium">
                      Target audience (optional)
                    </Text>
                    <TextArea
                      placeholder="Who are you speaking to?"
                      rows={10}
                      style={{ height: 260, minHeight: 260 }}
                      {...register("targetAudience", {
                        onChange: () => (userEditedRef.current.targetAudience = true),
                      })}
                    />
                  </Box>
                  <Box>
                    <Text size="2" weight="medium">
                      Timezone
                    </Text>
                    <Select.Root
                      value={timezoneValue || "GMT+00:00"}
                      onValueChange={value => setValue("timezone", value, { shouldDirty: true })}
                    >
                      <Select.Trigger placeholder="Select timezone" />
                      <Select.Content>
                        {TIMEZONE_OPTIONS.map(tz => (
                          <Select.Item key={tz.value} value={tz.value}>
                            {tz.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                    {errors.timezone?.message && <Text color="red" size="1">{errors.timezone.message}</Text>}
                  </Box>
                  <Flex direction="column" gap="2">
                    <Text size="2" weight="medium">Brand logo (optional)</Text>
                    {(isDraftingVoice || isDraftingAudience) && (
                      <Text size="1" color="gray">Drafting suggestions… <Button variant="ghost" size="1" onClick={stopDrafting}>Stop</Button></Text>
                    )}
                    {logoPreviewUrl ? (
                      <Image
                        src={logoPreviewUrl}
                        alt="Brand logo preview"
                        width={64}
                        height={64}
                        unoptimized
                        className="h-16 w-16 rounded object-contain p-1 border"
                        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
                      />
                    ) : (
                      <Text size="1" color="gray">No logo uploaded.</Text>
                    )}
                    <Flex gap="2">
                      <Button
                        type="button"
                        variant="outline"
                        color="gray"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={isPending || isAgentRunning}
                      >
                        Upload logo
                      </Button>
                      {state.brand.logoPath && (
                        <Button
                          type="button"
                          variant="soft"
                          color="red"
                          disabled={isPending || isAgentRunning}
                          onClick={() => {
                            setState(prev => ({
                              ...prev,
                              brand: {
                                ...prev.brand,
                                logoPath: null,
                              },
                            }));
                            setLogoPreviewUrl(null);
                            show({ title: "Removed", description: "Logo removed from brand profile.", variant: "success" });
                          }}
                        >
                          Remove logo
                        </Button>
                      )}
                    </Flex>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      hidden
                      onChange={event => {
                        void handleLogoUpload(event.target.files);
                        if (event.target) event.target.value = "";
                      }}
                    />
                  </Flex>
                  <Flex direction="column" gap="3">
                    <Text size="2" weight="medium">
                      Brand documents
                    </Text>
                    <Flex gap="2" wrap="wrap">
                      <Button
                        type="button"
                        variant="solid"
                        color="violet"
                        onClick={() => {
                          fileInputRef.current?.click();
                        }}
                        disabled={isPending || isAgentRunning}
                      >
                        <Flex align="center" gap="2">
                          <DocumentSourceIcon source="upload" />
                          <span>Upload files</span>
                        </Flex>
                      </Button>
                      {CONNECTOR_SOURCES.map(source => {
                        const isGoogleDriveBusy =
                          source.key === "google-drive" && (isGoogleDrivePickerPending || isGoogleDriveLinking);
                    const isComingSoon = source.status === "soon";
                    const disabled =
                      isComingSoon || isPending || isAgentRunning || isGoogleDriveBusy;
                    const label = isComingSoon ? `${source.label} (coming soon)` : source.label;
                        const variant = isComingSoon ? "soft" : "outline";
                        return (
                          <Button
                            key={source.key}
                            type="button"
                            variant={variant}
                            color="gray"
                            onClick={() => {
                              if (!isComingSoon) {
                                void handleConnectorLaunch(source.key);
                              }
                            }}
                            disabled={disabled}
                            title={isComingSoon ? "Coming soon" : undefined}
                          >
                            <Flex align="center" gap="2">
                              {source.key === "google-drive" && isGoogleDriveBusy && (
                                <ReloadIcon className="h-3.5 w-3.5 animate-spin" />
                              )}
                              <DocumentSourceIcon source={source.key} />
                              <span>{label}</span>
                            </Flex>
                          </Button>
                        );
                      })}
                    </Flex>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={event => {
                        void handleUploadDocuments(event.target.files);
                        if (event.target) {
                          event.target.value = "";
                        }
                      }}
                    />
                    {renderDocumentsList()}
                  </Flex>
                  <Flex justify="between" align="center">
                    <Button
                      type="button"
                      variant="ghost"
                      color="gray"
                      onClick={handleClear}
                      disabled={isPending || isAgentRunning}
                    >
                      Clear
                    </Button>
                    <Flex gap="3">
                      <Button type="button" variant="soft" disabled>
                        Back
                      </Button>
                      <Button type="submit" disabled={!canContinueFrom(0) || isPending || isAgentRunning}>
                        Continue
                      </Button>
                    </Flex>
                  </Flex>
                </Flex>
              </form>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-1">
            <IntegrationsStep
              state={state}
              selectableAssets={selectableAssetsFlatList}
              selectableAssetsData={selectableAssetsQuery.data ?? null}
              selectedAccountIdsByKey={selectedAccountIdsByKey}
              isHydrated={hasSelectableAssetsHydrated}
              isPending={isPending}
              isAgentRunning={isAgentRunning}
              onConnectGroup={connectGroup}
              onDisconnectGroup={disconnectGroup}
              onResyncGroup={resyncGroup}
              onRefreshAll={refreshAllIntegrations}
              onToggleAccount={handleToggleAccount}
              onToggleAssets={handleToggleSelectableAssets}
              onClear={handleClear}
              onBack={handleBack}
              onNext={handleNext}
              canContinue={canContinueFrom(1)}
              cardClassName={glassPanelClassName}
              cardStyle={glassPanelStyle}
            />
          </Tabs.Content>

          <Tabs.Content value="step-2">
            {shouldShowPreview ? renderPreviewScreen() : renderReviewSummary()}
          </Tabs.Content>
          </Tabs.Root>

          <Flex justify="center">
            <Text color="gray" size="1">
              Need to pause? Your progress saves automatically.
            </Text>
          </Flex>
        </Flex>
      </Container>
    </>
  );
}
