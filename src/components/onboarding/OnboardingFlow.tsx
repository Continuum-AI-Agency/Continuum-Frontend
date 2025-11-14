"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  Tabs,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { CheckCircledIcon, ExclamationTriangleIcon, ReloadIcon, TrashIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PLATFORMS, PLATFORM_KEYS, type PlatformKey } from "./platforms";
import {
  clearPlatformConnectionAction,
  completeOnboardingAction,
  fetchOnboardingStateAction,
  mutateOnboardingStateAction,
  // New real integration actions
  syncIntegrationAccountsAction,
  associateIntegrationAccountsAction,
  registerDocumentMetadataAction,
  enqueueDocumentEmbedAction,
  removeDocumentAction,
} from "@/app/onboarding/actions";
import type { BrandVoiceTag, OnboardingDocument, OnboardingState } from "@/lib/onboarding/state";
import { BRAND_VOICE_TAGS } from "@/lib/onboarding/state";
import { openCenteredPopup, waitForPopupMessage, waitForPopupClosed } from "@/lib/popup";
import { useStartMetaSync, useStartGoogleSync } from "@/lib/api/integrations";
import { useToast } from "@/components/ui/ToastProvider";
import { PlatformIcon, ExtraIcon, DocumentSourceIcon } from "./PlatformIcons";
import { uploadCreativeAsset, createSignedAssetUrl } from "@/lib/creative-assets/storage";
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
  type IntegrationProvider,
} from "@/lib/onboarding/agentClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useContinuumServerEvents } from "@/lib/sse/useContinuumServerEvents";

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
    website: z.union([z.string().url("Enter a valid URL (e.g. https://example.com)"), z.literal("")]).optional(),
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
  { key: "google-drive", label: "Google Drive", status: "active" as const },
  { key: "canva", label: "Canva", status: "soon" as const },
  { key: "figma", label: "Figma", status: "soon" as const },
  { key: "sharepoint", label: "SharePoint", status: "soon" as const },
  { key: "notion", label: "Notion", status: "soon" as const },
] as const;

// OAuth groupings and coming-soon platforms for the Integrations step
const GOOGLE_OAUTH_KEYS: PlatformKey[] = ["youtube", "googleAds", "dv360"];
const FACEBOOK_OAUTH_KEYS: PlatformKey[] = ["instagram", "facebook", "threads"];
const COMING_SOON_KEYS: PlatformKey[] = ["amazonAds", "tiktok", "linkedin"];
const COMING_SOON_EXTRA = [{ key: "x", label: "X" }] as const;

const agentPhaseKeys = ["brand_profile", "voice", "audience"] as const;
type AgentPhase = (typeof agentPhaseKeys)[number];
type AgentPhaseStatus = "idle" | "pending" | "completed" | "error";

const phaseLabel: Record<AgentPhase, string> = {
  brand_profile: "Brand profile",
  voice: "Voice",
  audience: "Audience",
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
  url.searchParams.set("provider", group);
  url.searchParams.set("context", context);
  return url.toString();
}

function createAgentPhaseState(): Record<AgentPhase, AgentPhaseStatus> {
  return {
    brand_profile: "idle",
    voice: "idle",
    audience: "idle",
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
  const [agentVoice, setAgentVoice] = useState<AgentBrandVoice | null>(null);
  const [agentAudience, setAgentAudience] = useState<AgentTargetAudience | null>(null);
  const [agentBrandProfile, setAgentBrandProfile] = useState<AgentBrandProfile | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Track selected integration accounts per provider
  const [selectedAccountIdsByKey, setSelectedAccountIdsByKey] = useState<Record<PlatformKey, Set<string>>>(() => ({
    youtube: new Set(),
    googleAds: new Set(),
    dv360: new Set(),
    instagram: new Set(),
    facebook: new Set(),
    threads: new Set(),
    tiktok: new Set(),
    linkedin: new Set(),
    amazonAds: new Set(),
  }));
  const previewAbortRef = useRef<AbortController | null>(null);
  const startMetaSyncMutation = useStartMetaSync();
  const startGoogleSyncMutation = useStartGoogleSync();

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
    () => PLATFORM_KEYS.filter(key => state.connections[key]?.connected),
    [state.connections]
  );

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
          if (!isAgentPhase(event.phase)) break;
          const mapped = mapAgentStatus(event.status);
          if (mapped) {
            setAgentPhases(prev => ({
              ...prev,
              [event.phase]: mapped,
            }));
          }
          break;
        }
        case "voice":
          setAgentVoice(event.payload);
          break;
        case "audience":
          setAgentAudience(event.payload);
          break;
        case "brand_profile":
          setAgentBrandProfile(event.payload);
          break;
        case "complete":
          setAgentPhases(prev => ({
            brand_profile: prev.brand_profile === "completed" ? prev.brand_profile : "completed",
            voice: prev.voice === "completed" ? prev.voice : "completed",
            audience: prev.audience === "completed" ? prev.audience : "completed",
          }));
          break;
        case "error":
          setAgentError(event.message);
          setAgentPhases(prev => ({
            brand_profile: prev.brand_profile === "completed" ? prev.brand_profile : "error",
            voice: prev.voice === "completed" ? prev.voice : "error",
            audience: prev.audience === "completed" ? prev.audience : "error",
          }));
          break;
        default:
          break;
      }
    },
    []
  );

  // Live update from server events (optional; backend must emit this)
  useContinuumServerEvents({
    "onboarding.document.updated": event => {
      if ((event.data as any).brandId !== brandId) return;
      const { documentId, status, errorMessage } = event.data as any;
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

  useEffect(() => {
    setSelectedVoiceTags(state.brand.brandVoiceTags ?? []);
    const storedIndustry = state.brand.industry;
    const isCustom = Boolean(storedIndustry && !industries.includes(storedIndustry));
    reset({
      name: state.brand.name,
      industry: isCustom ? "Other" : storedIndustry || industries[0],
      brandVoice: state.brand.brandVoice ?? "",
      targetAudience: state.brand.targetAudience ?? "",
      timezone: normalizeTimezoneValue(state.brand.timezone || "UTC"),
      website: state.brand.website ?? "",
      otherIndustry: isCustom ? storedIndustry : "",
    });
    // Resolve logo URL for preview when path exists
    if (state.brand.logoPath) {
      void createSignedAssetUrl(state.brand.logoPath, 3600)
        .then(url => setLogoPreviewUrl(url))
        .catch(() => setLogoPreviewUrl(null));
    } else {
      setLogoPreviewUrl(null);
    }
  }, [reset, state.brand]);

  const industryValue = watch("industry");
  const timezoneValue = watch("timezone");
  const websiteValue = watch("website");

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

  const buildAgentPayload = useCallback((): AgentRequestPayload => {
    const userId = currentUserId ?? ownerId;
    if (!userId) {
      throw new Error("We could not identify your account. Refresh and try again.");
    }
    const brandName = (state.brand.name || "").trim();
    if (!brandName) {
      throw new Error("Add your brand name before completing onboarding.");
    }
    const brandVoice = state.brand.brandVoice?.trim();
    const targetAudience = state.brand.targetAudience?.trim();
    const website = state.brand.website?.trim();
    const providers = Array.from(
      new Set(
        connectedKeys
          .map(key => PLATFORM_TO_INTEGRATION_PROVIDER[key])
          .filter((value): value is IntegrationProvider => Boolean(value))
      )
    );
    const runContext = agentRunContextSchema.parse({
      user_id: userId,
      brand_id: brandId,
      brand_name: brandName,
      created_at: state.completedAt ?? new Date().toISOString(),
      platform_urls: [],
      integrated_platforms: providers,
      brand_voice_tags: state.brand.brandVoiceTags ?? [],
    });
    return {
      brandProfile: {
        id: brandId,
        brand_name: brandName,
        description: state.brand.industry || undefined,
        brand_voice: brandVoice ? { tone: brandVoice } : undefined,
        target_audience: targetAudience ? { summary: targetAudience } : undefined,
        website_url: website && website.length > 0 ? website : undefined,
      },
      runContext,
    };
  }, [
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
  ]);

  const refreshState = useCallback(() => {
    startTransition(() => {
      void fetchOnboardingStateAction(brandId)
        .then(next => setState(next))
        .catch(() => {
          show({ title: "Refresh failed", description: "Unable to load the latest onboarding state.", variant: "error" });
        });
    });
  }, [brandId, show]);

  const handleBrandSubmit = useCallback(
    (data: BrandForm) => {
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
      };

      startTransition(() => {
        void mutateOnboardingStateAction(brandId, {
          step: 1,
          brand: payload,
        })
          .then(next => {
            setState(next);
          })
          .catch(() => {
            show({ title: "Save failed", description: "Could not update brand details.", variant: "error" });
          });
      });
    },
    [brandId, selectedVoiceTags, show]
  );

  // --- Draft streaming from website on blur ---
  const streamingAbortRef = useRef<AbortController | null>(null);
  const [isDraftingVoice, setIsDraftingVoice] = useState(false);
  const [isDraftingAudience, setIsDraftingAudience] = useState(false);
  const lastWebsiteTriggeredRef = useRef<string | null>(null);
  const userEditedRef = useRef<{ brandVoice: boolean; targetAudience: boolean }>({ brandVoice: false, targetAudience: false });

  const stopDrafting = useCallback(() => {
    try {
      streamingAbortRef.current?.abort();
    } catch {}
    streamingAbortRef.current = null;
    setIsDraftingVoice(false);
    setIsDraftingAudience(false);
  }, []);

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
      const response = await fetch(`/api/onboarding/brand-draft?brand=${encodeURIComponent(brandId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: url.trim() }),
        signal: ctrl.signal,
      });

      if (!response.ok || !response.body) {
        show({ title: "Draft failed", description: "Could not start drafting.", variant: "error" });
        stopDrafting();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let voiceBuffer = "";
      let audienceBuffer = "";
      let voiceDone = false;
      let audienceDone = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith("event:")) {
            const event = line.slice(6).trim();
            const dataLine = lines[++i] || ""; // next line should be data
            if (!dataLine.startsWith("data:")) continue;
            const data = dataLine.slice(5).trim();

            if (event === "brandVoice") {
              try {
                const { delta } = JSON.parse(data);
                voiceBuffer += String(delta);
                if (!userEditedRef.current.brandVoice) {
                  setValue("brandVoice", voiceBuffer, { shouldDirty: false });
                }
              } catch {}
            } else if (event === "targetAudience") {
              try {
                const { delta } = JSON.parse(data);
                audienceBuffer += String(delta);
                if (!userEditedRef.current.targetAudience) {
                  setValue("targetAudience", audienceBuffer, { shouldDirty: false });
                }
              } catch {}
            } else if (event === "brandVoiceDone") {
              voiceDone = true;
              setIsDraftingVoice(false);
            } else if (event === "targetAudienceDone") {
              audienceDone = true;
              setIsDraftingAudience(false);
            } else if (event === "error") {
              show({ title: "Draft error", description: "Upstream error.", variant: "error" });
            } else if (event === "done") {
              // overall done
              voiceDone = true;
              audienceDone = true;
              setIsDraftingVoice(false);
              setIsDraftingAudience(false);
            }
          }
        }

        if (voiceDone && audienceDone) break;
      }
    } catch {
      // swallow; user may have aborted
    } finally {
      setIsDraftingVoice(false);
      setIsDraftingAudience(false);
      streamingAbortRef.current = null;
    }
  }, [brandId, setValue, show, stopDrafting]);

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
      if (!validTypes.includes(file.type as any)) {
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
          const next = await mutateOnboardingStateAction(brandId, { brand: { logoPath: asset.fullPath } });
          setState(next);
          const url = await createSignedAssetUrl(asset.fullPath, 3600);
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
          const action = source === "google-drive"
            ? enqueueDocumentEmbedAction(brandId, {
                name: payload.name,
                source: "google-drive",
                externalUrl: payload.externalUrl,
              })
            : registerDocumentMetadataAction(brandId, {
                name: payload.name,
                source,
                externalUrl: payload.externalUrl,
                status: "ready",
              });

          void action
            .then(next => {
              setState(next);
              const desc = source === "google-drive" ? `${payload.name} queued for embedding.` : payload.name;
              show({ title: `${source} library linked`, description: desc, variant: "success" });
            })
            .catch(() => {
              show({ title: "Integration failed", description: "Unable to capture the selected document.", variant: "error" });
            });
        });
      } catch {
        show({ title: "Integration cancelled", description: `We didn't receive a document from ${source}.`, variant: "error" });
      }
    },
    [brandId, show]
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

  // Group operations: single Google/Meta button that populates sub-lists after auth
  const isAnyConnected = useCallback(
    (keys: PlatformKey[]) => keys.some(key => state.connections[key]?.connected),
    [state.connections]
  );

  const connectGroup = useCallback(
    async (group: "google" | "facebook") => {
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

        const predicate = (message: IntegrationSuccess | IntegrationError) =>
          message.provider === group &&
          message.context === "onboarding" &&
          (!expectedState || message.state === expectedState);

        const successPromise = waitForPopupMessage<IntegrationSuccess>("oauth:success", {
          predicate,
          signal: abortCtrl.signal,
        });

        const errorPromise = waitForPopupMessage<IntegrationError>("oauth:error", {
          predicate,
          signal: abortCtrl.signal,
        }).then(payload => {
          throw new Error(payload.message ?? "Connection cancelled.");
        });

        const closedPromise = waitForPopupClosed(popup, { signal: abortCtrl.signal }).then(() => {
          throw new Error("Connection cancelled.");
        });

        const result = await Promise.race([successPromise, errorPromise, closedPromise]);
        if (!result.provider || result.provider !== group) {
          show({ title: "Connection incomplete", description: "We could not verify the provider.", variant: "error" });
          cleanup();
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
            show({ title: "Connected", description: `Accounts synced for ${group}.`, variant: "success" });
          })().catch(() => {
            show({ title: "Connection failed", description: "Please try again.", variant: "error" });
          });
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Please try again.";
        show({ title: "Connection failed", description: message, variant: "error" });
      } finally {
        // Ensure timers/listeners are cleared if they exist in scope
        try {
          // no-op if not defined in failure branches
          // @ts-expect-error scoped cleanup may not exist if popup was blocked
          cleanup?.();
        } catch {}
      }
    },
    [brandId, show, startMetaSyncMutation, startGoogleSyncMutation]
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
          show({ title: "Synced", description: `Pulled the latest accounts for ${group}.`, variant: "success" });
        })().catch(() => {
          show({ title: "Sync failed", description: "Unable to refresh this integration.", variant: "error" });
        });
      });
    },
    [brandId, show]
  );

  const handleToggleAccount = useCallback((provider: PlatformKey, accountId: string, checked: boolean) => {
    setSelectedAccountIdsByKey(prev => {
      const next = { ...prev };
      const set = new Set(next[provider]);
      if (checked) set.add(accountId);
      else set.delete(accountId);
      next[provider] = set;
      return next;
    });
  }, []);

  const getAllSelectedIds = useCallback((): string[] => {
    const all: string[] = [];
    (Object.keys(selectedAccountIdsByKey) as PlatformKey[]).forEach(k => {
      selectedAccountIdsByKey[k].forEach(id => all.push(id));
    });
    return all;
  }, [selectedAccountIdsByKey]);

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
          if (selectedIds.length > 0) {
            await associateIntegrationAccountsAction(brandId, selectedIds);
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
  }, [brandId, getValues, handleBrandSubmit, isAgentRunning, setError, show, step, getAllSelectedIds]);

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

  const completeOnboarding = useCallback(async () => {
    if (isAgentRunning) return;
    // Persist any remaining selections before finalizing
    const selectedIds = getAllSelectedIds();
    if (selectedIds.length > 0) {
      try {
        await associateIntegrationAccountsAction(brandId, selectedIds);
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

    setAgentError(null);
    setAgentVoice(null);
    setAgentAudience(null);
    setAgentBrandProfile(null);
    setAgentPhases(createAgentPhaseState());

    const controller = new AbortController();
    previewAbortRef.current = controller;
    const finishAgents = () => {
      setIsAgentRunning(false);
      previewAbortRef.current = null;
    };

    setIsAgentRunning(true);

    try {
      await checkOnboardingAgentHealth({ signal: controller.signal });
      await runOnboardingPreview({
        payload,
        signal: controller.signal,
        onEvent: handleAgentPreviewEvent,
      });
      const approval = await approveOnboardingBrandProfile({ payload, signal: controller.signal });
      setAgentBrandProfile(approval.brand_profile);
    } catch (error) {
      if (controller.signal.aborted) {
        finishAgents();
        return;
      }
      const message =
        error instanceof Error ? error.message : "Unable to complete the onboarding preview. Please try again.";
      setAgentError(message);
      setAgentPhases(prev => ({
        brand_profile: prev.brand_profile === "completed" ? prev.brand_profile : "error",
        voice: prev.voice === "completed" ? prev.voice : "error",
        audience: prev.audience === "completed" ? prev.audience : "error",
      }));
      show({ title: "Preview failed", description: message, variant: "error" });
      finishAgents();
      return;
    }

    finishAgents();

    startTransition(() => {
      void completeOnboardingAction(brandId)
        .then(next => {
          setState(next);
          show({ title: "Onboarding complete", description: "Redirecting to your dashboard.", variant: "success" });
          router.replace("/dashboard");
        })
        .catch(() => {
          show({ title: "Completion failed", description: "Please try again.", variant: "error" });
        });
    });
  }, [brandId, buildAgentPayload, handleAgentPreviewEvent, isAgentRunning, router, show, startTransition, getAllSelectedIds]);

  const isCompleting = isPending || isAgentRunning;

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

  const renderDocumentsList = () => {
    if (brandDocuments.length === 0) {
      return <Text color="gray">No documents added yet. Bring your brand voice and visual libraries to kick-start personalization.</Text>;
    }

    return (
      <Flex direction="column" gap="2">
        {brandDocuments.map(doc => (
          <Card key={doc.id} className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
            <Flex align="center" justify="between" p="3" gap="3">
              <Flex direction="column" gap="1">
                <Text weight="medium">{doc.name}</Text>
                <Flex gap="2" align="center">
                  <Badge color="gray">
                    <Flex align="center" gap="1">
                      <DocumentSourceIcon source={doc.source as any} />
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

  const renderConnections = () => {
    const getLabel = (key: PlatformKey): string =>
      PLATFORMS.find(p => p.key === key)?.label ?? key;

    const ProviderDetails = ({ provider }: { provider: PlatformKey }) => {
      const label = getLabel(provider);
      const connection = state.connections[provider];
      const isConnected = Boolean(connection?.connected);
      return (
        <Card key={provider} className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
          <Flex direction="column" gap="3" p="4">
            <Flex align="center" justify="between">
              <Flex align="center" gap="2">
                <PlatformIcon platform={provider} />
                <Text weight="medium">{label}</Text>
              </Flex>
              <Badge color={isConnected ? "green" : "gray"}>
                {isConnected ? "Connected" : "Not connected"}
              </Badge>
            </Flex>
            {isConnected && (
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">
                  Synced accounts
                </Text>
                {connection?.accounts?.length ? (
                  <Flex direction="column" gap="1">
                    {connection.accounts.map(account => {
                      const selected = selectedAccountIdsByKey[provider]?.has(account.id) ?? false;
                      return (
                        <Card key={account.id} variant="surface">
                          <Flex justify="between" align="center" p="2" gap="2">
                            <Flex align="center" gap="2">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => handleToggleAccount(provider, account.id, e.target.checked)}
                                aria-label={`Select ${account.name}`}
                              />
                              <Text size="2">{account.name}</Text>
                            </Flex>
                            <Badge color={account.status === "active" ? "green" : account.status === "pending" ? "amber" : "red"}>
                              {account.status}
                            </Badge>
                          </Flex>
                        </Card>
                      );
                    })}
                  </Flex>
                ) : (
                  <Text size="1" color="gray">
                    No accounts returned yet. Try syncing again.
                  </Text>
                )}
                <Text size="1" color="gray">
                  Last synced {connection?.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "—"}
                </Text>
              </Flex>
            )}
          </Flex>
        </Card>
      );
    };

    const ComingSoonProviderCard = ({ provider }: { provider: PlatformKey }) => (
      <Card key={provider} className="bg-slate-950/60 backdrop-blur-xl border border-white/10 opacity-60">
        <Flex direction="column" gap="3" p="4">
          <Flex align="center" justify="between">
            <Flex align="center" gap="2">
              <PlatformIcon platform={provider} />
              <Text weight="medium">{getLabel(provider)}</Text>
            </Flex>
            <Badge color="gray">Coming soon</Badge>
          </Flex>
          <Flex>
            <Button disabled variant="soft" color="gray">
              Connect
            </Button>
          </Flex>
        </Flex>
      </Card>
    );

    const ComingSoonExtraCard = ({ id, label }: { id: "x"; label: string }) => (
      <Card key={id} className="bg-slate-950/60 backdrop-blur-xl border border-white/10 opacity-60">
        <Flex direction="column" gap="3" p="4">
          <Flex align="center" justify="between">
            <Flex align="center" gap="2">
              <ExtraIcon id={id} />
              <Text weight="medium">{label}</Text>
            </Flex>
            <Badge color="gray">Coming soon</Badge>
          </Flex>
          <Flex>
            <Button disabled variant="soft" color="gray">
              Connect
            </Button>
          </Flex>
        </Flex>
      </Card>
    );

    const renderGroup = (
      title: string,
      keys: PlatformKey[],
      group: "google" | "facebook"
    ) => {
      const connected = isAnyConnected(keys);
      return (
        <Flex direction="column" gap="2">
          <Flex align="center" justify="between">
            <Text size="2" weight="medium">{title}</Text>
            <Flex gap="2">
              <Button
                onClick={() => (connected ? disconnectGroup(group) : connectGroup(group))}
                variant={connected ? "soft" : "solid"}
                color={connected ? "gray" : "violet"}
                disabled={isPending || isAgentRunning}
              >
                {connected ? "Disconnect" : "Connect"}
              </Button>
              {connected && (
                <Button
                  variant="outline"
                  color="gray"
                  onClick={() => resyncGroup(group)}
                  disabled={isPending || isAgentRunning}
                  aria-label={`Refresh ${title} accounts`}
                >
                  <ReloadIcon />
                </Button>
              )}
            </Flex>
          </Flex>
          <Grid columns={{ initial: "1", sm: "2" }} gap="3">
            {keys.map(key => (
              <ProviderDetails key={key} provider={key} />
            ))}
          </Grid>
        </Flex>
      );
    };

    const renderComingSoon = () => (
      <Flex direction="column" gap="2">
        <Text size="2" weight="medium">Coming soon</Text>
        <Grid columns={{ initial: "1", sm: "2" }} gap="3">
          {COMING_SOON_KEYS.map(key => (
            <ComingSoonProviderCard key={key} provider={key} />
          ))}
          {COMING_SOON_EXTRA.map(item => (
            <ComingSoonExtraCard key={item.key} id={item.key} label={item.label} />
          ))}
        </Grid>
      </Flex>
    );

    return (
      <Flex direction="column" gap="4">
        {renderGroup("Google OAuth", GOOGLE_OAUTH_KEYS, "google")}
        {renderGroup("Facebook OAuth", FACEBOOK_OAUTH_KEYS, "facebook")}
        {renderComingSoon()}
      </Flex>
    );
  };

  return (
    <Container size="3">
      <Flex direction="column" gap="4">
        <Heading size="6" className="text-white">Welcome to Continuum</Heading>
        <Text color="gray">Set up your workspace so Continuum can produce on-brand creative from day one.</Text>

        <Tabs.Root value={`step-${step}`} onValueChange={() => {}}>
          <Tabs.List>
            <Tabs.Trigger value="step-0">Brand profile</Tabs.Trigger>
            <Tabs.Trigger value="step-1">Integrations</Tabs.Trigger>
            <Tabs.Trigger value="step-2">Review</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="step-0">
            <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
              <form
                onSubmit={handleSubmit(data => {
                  handleBrandSubmit(data);
                })}
              >
                <Flex direction="column" gap="4" p="4">
                  <Heading size="4" className="text-white">Tell us about your brand</Heading>
                  <Box>
                    <Text size="2" weight="medium">
                      Brand name
                    </Text>
                    <TextField.Root placeholder="e.g. Continuum Collective" {...register("name")} />
                    {errors.name?.message && <Text color="red" size="1">{errors.name.message}</Text>}
                  </Box>
                  <Box>
                    <Text size="2" weight="medium">
                      Website (optional)
                    </Text>
                    <TextField.Root
                      placeholder="https://example.com"
                      {...register("website")}
                      onBlur={() => {
                        const val = websiteValue?.trim() || "";
                        // Must be >= 5 chars and parse as URL
                        if (val.length >= 5) {
                          const parsed = z.string().url().safeParse(val);
                          if (parsed.success) {
                            void startDraftingFromWebsite(parsed.data);
                          }
                        }
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
                      <img
                        src={logoPreviewUrl}
                        alt="Brand logo preview"
                        className="h-16 w-16 rounded bg-white object-contain p-1 border border-white/10"
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
                            startTransition(() => {
                              void mutateOnboardingStateAction(brandId, { brand: { logoPath: null } })
                                .then(next => {
                                  setState(next);
                                  setLogoPreviewUrl(null);
                                  show({ title: "Removed", description: "Logo removed from brand profile.", variant: "success" });
                                })
                                .catch(() => show({ title: "Remove failed", description: "Try again.", variant: "error" }));
                            });
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
                        const disabled = source.status !== "active" || isPending || isAgentRunning;
                        const label = source.status === "soon" ? `${source.label} (coming soon)` : source.label;
                        return (
                          <Button
                            key={source.key}
                            type="button"
                            variant={source.status === "active" ? "outline" : "soft"}
                            color="gray"
                            onClick={() => {
                              if (source.status === "active") {
                                void handleConnectorLaunch(source.key as any);
                              }
                            }}
                            disabled={disabled}
                            title={source.status === "soon" ? "Coming soon" : undefined}
                          >
                            <Flex align="center" gap="2">
                              <DocumentSourceIcon source={source.key as any} />
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
                  <Flex justify="end" gap="3">
                    <Button type="button" variant="soft" disabled>
                      Back
                    </Button>
                    <Button type="submit" disabled={!canContinueFrom(0) || isPending || isAgentRunning}>
                      Continue
                    </Button>
                  </Flex>
                </Flex>
              </form>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-1">
            <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
              <Flex direction="column" gap="4" p="4">
                <Flex align="center" justify="between">
                  <Heading size="4" className="text-white">Connect your channels</Heading>
                  <Button
                    variant="ghost"
                    size="1"
                    onClick={() => {
                      startTransition(() => {
                        void (async () => {
                          const groups: ("google" | "meta")[] = ["google", "meta"];
                          const next = await syncIntegrationAccountsAction(brandId, groups);
                          setState(next);
                        })().catch(() => {
                          show({ title: "Refresh failed", description: "Unable to sync accounts.", variant: "error" });
                        });
                      });
                    }}
                    disabled={isPending || isAgentRunning}
                  >
                    Refresh
                  </Button>
                </Flex>
                <Text color="gray">
                  Secure popups handle authentication for each network. We’ll show live account data as soon as the provider confirms access.
                </Text>
                {renderConnections()}
                <Callout.Root color="indigo">
                  <Callout.Icon>
                    <ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    Popups talk to the Continuum integrations service. We cache the callback URL you pass in, exchange tokens with Google or Meta, then stream the connected accounts back into this brand automatically.
                  </Callout.Text>
                </Callout.Root>
                <Flex justify="between">
                  <Button variant="soft" onClick={handleBack} disabled={isPending || isAgentRunning}>
                    Back
                  </Button>
                  <Button onClick={handleNext} disabled={!canContinueFrom(1) || isPending || isAgentRunning}>
                    Continue
                  </Button>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-2">
            <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
              <Flex direction="column" gap="4" p="4">
                <Heading size="4" className="text-white">Review</Heading>
                <Card variant="surface" className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
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
                        <img
                          src={logoPreviewUrl}
                          alt="Brand logo"
                          className="h-10 w-10 rounded bg-white object-contain p-1 border border-white/10"
                        />
                      </Flex>
                    )}
                    {state.brand.brandVoice && (
                      <Text color="gray" size="2">Voice: {state.brand.brandVoice}</Text>
                    )}
                    {state.brand.brandVoiceTags.length > 0 && (
                      <Flex gap="1" wrap="wrap">
                        {state.brand.brandVoiceTags.map(tag => (
                          <Badge key={tag} color="green">{tag}</Badge>
                        ))}
                      </Flex>
                    )}
                    {state.brand.targetAudience && (
                      <Text color="gray" size="2">Target audience: {state.brand.targetAudience}</Text>
                    )}
                  </Flex>
                </Card>

                <Card variant="surface" className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
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

                <Card variant="surface" className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
                  <Flex direction="column" gap="2" p="3">
                    <Text size="2" weight="medium">Connected platforms</Text>
                    {connectedKeys.length ? (
                      <Flex direction="column" gap="2">
                        {connectedKeys.map(provider => {
                          const connection = state.connections[provider];
                          const label = PLATFORMS.find(p => p.key === provider)?.label ?? provider;
                          return (
                            <Card key={provider} variant="ghost" className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
                              <Flex direction="column" gap="1" p="2">
                                <Flex justify="between">
                                  <Text>{label}</Text>
                                  <Badge color="green">Connected</Badge>
                                </Flex>
                                {connection?.accounts?.length ? (
                                  <Flex wrap="wrap" gap="2">
                                    {connection.accounts.map(account => (
                                      <Badge key={account.id} color="violet">
                                        {account.name}
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

                {(agentBrandProfile || agentVoice || agentAudience || agentError || isAgentRunning) && (
                  <Card variant="surface" className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
                    <Flex direction="column" gap="2" p="3">
                      <Flex align="center" justify="between">
                        <Text size="2" weight="medium">AI onboarding preview</Text>
                        <Badge color={agentError ? "red" : isAgentRunning ? "indigo" : "green"}>
                          {agentError ? "Error" : isAgentRunning ? "Running" : "Ready"}
                        </Badge>
                      </Flex>
                      <Flex wrap="wrap" gap="2">
                        {agentPhaseKeys.map(phase => (
                          <Badge key={phase} color={phaseStatusColor[agentPhases[phase]]}>
                            {phaseLabel[phase]} · {phaseStatusCopy[agentPhases[phase]]}
                          </Badge>
                        ))}
                      </Flex>
                      {agentBrandProfile?.description && (
                        <Text size="2" color="gray">{agentBrandProfile.description}</Text>
                      )}
                      {agentVoice?.tone && (
                        <Text size="2" color="gray">Voice tone: {agentVoice.tone}</Text>
                      )}
                      {agentAudience?.summary && (
                        <Text size="2" color="gray">Audience summary: {agentAudience.summary}</Text>
                      )}
                      {agentError && (
                        <Text size="2" color="red">{agentError}</Text>
                      )}
                      {!isAgentRunning && isPending && !agentError && (
                        <Text size="2" color="gray">Finalizing onboarding…</Text>
                      )}
                    </Flex>
                  </Card>
                )}

                <Callout.Root color="green">
                  <Callout.Icon>
                    <CheckCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    You can manage integrations and brand assets anytime from Settings.
                  </Callout.Text>
                </Callout.Root>
                <Flex justify="between">
                  <Button variant="soft" onClick={handleBack} disabled={isCompleting}>
                    Back
                  </Button>
                  <Button onClick={completeOnboarding} disabled={isCompleting}>
                    {isCompleting ? (
                      <>
                        <ReloadIcon className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Finalizing
                      </>
                    ) : (
                      "Complete setup"
                    )}
                  </Button>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>
        </Tabs.Root>

        <Flex justify="center">
          <Text color="gray" size="1">
            Need to pause? Your progress saves automatically.
          </Text>
        </Flex>
      </Flex>
    </Container>
  );
}
