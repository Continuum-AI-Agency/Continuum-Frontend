import { z } from "zod";
import { PLATFORM_KEYS, type PlatformKey } from "@/components/onboarding/platforms";

export const BRAND_VOICE_TAGS = [
  "Playful",
  "Professional",
  "Bold",
  "Empathetic",
  "Technical",
  "Minimalist",
  "Story-driven",
  "Experimental",
] as const;

export const BRAND_ROLES = ["owner", "admin", "operator", "viewer"] as const;

// Note: keep schema definition available for future validation usage if needed
// const platformKeySchema = z.enum(PLATFORM_KEYS);
const brandVoiceTagSchema = z.enum(BRAND_VOICE_TAGS);
const brandRoleSchema = z.enum(BRAND_ROLES);

const platformAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "pending", "error"]),
});

const connectionStateSchema = z.object({
  connected: z.boolean(),
  accountId: z.union([z.string(), z.null()]).default(null),
  accounts: z.array(platformAccountSchema).default([]),
  lastSyncedAt: z.union([z.string().datetime(), z.null()]).default(null),
});

const connectionPatchSchema = connectionStateSchema.partial();

const connectionShape = PLATFORM_KEYS.reduce(
  (shape, key) => {
    shape[key] = connectionStateSchema;
    return shape;
  },
  {} as Record<PlatformKey, typeof connectionStateSchema>
);

const connectionPatchShape = PLATFORM_KEYS.reduce(
  (shape, key) => {
    shape[key] = connectionPatchSchema;
    return shape;
  },
  {} as Record<PlatformKey, typeof connectionPatchSchema>
);

const brandSchema = z.object({
  name: z.string(),
  industry: z.string(),
  brandVoice: z.union([z.string(), z.null()]),
  brandVoiceTags: z.array(brandVoiceTagSchema),
  targetAudience: z.union([z.string(), z.null()]),
  timezone: z.string(),
});

const documentSourceSchema = z.enum(["upload", "canva", "figma", "google-drive", "sharepoint"]);

const onboardingDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: documentSourceSchema,
  createdAt: z.string().datetime(),
  status: z.enum(["processing", "ready", "error"]).default("ready"),
  size: z.number().nonnegative().optional(),
  externalUrl: z.string().url().optional(),
});

const brandMemberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: brandRoleSchema,
});

const brandInviteSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: brandRoleSchema,
  token: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
});

const onboardingStateSchema = z.object({
  step: z.number().int().min(0).max(2),
  brand: brandSchema,
  documents: z.array(onboardingDocumentSchema),
  connections: z.object(connectionShape),
  members: z.array(brandMemberSchema),
  invites: z.array(brandInviteSchema),
  completedAt: z.union([z.string().datetime(), z.null()]).nullable(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onboardingPatchSchema = z.object({
  step: z.number().int().min(0).max(2).optional(),
  brand: brandSchema.partial().optional(),
  documents: z.array(onboardingDocumentSchema).optional(),
  connections: z.object(connectionPatchShape).partial().optional(),
  members: z.array(brandMemberSchema).optional(),
  invites: z.array(brandInviteSchema).optional(),
  completedAt: z.union([z.string().datetime(), z.null()]).nullable().optional(),
});

const onboardingMetadataSchema = z.object({
  activeBrandId: z.union([z.string(), z.null()]).default(null),
  brands: z.record(onboardingStateSchema).default({}),
});

export type BrandVoiceTag = z.infer<typeof brandVoiceTagSchema>;
export type BrandRole = z.infer<typeof brandRoleSchema>;
export type BrandMember = z.infer<typeof brandMemberSchema>;
export type BrandInvite = z.infer<typeof brandInviteSchema>;
export type OnboardingBrand = z.infer<typeof brandSchema>;
export type OnboardingConnectionAccount = z.infer<typeof platformAccountSchema>;
export type OnboardingConnectionState = z.infer<typeof connectionStateSchema>;
export type OnboardingDocument = z.infer<typeof onboardingDocumentSchema>;
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type OnboardingPatch = z.infer<typeof onboardingPatchSchema>;
export type OnboardingMetadata = z.infer<typeof onboardingMetadataSchema>;

function makeDefaultConnections(): Record<PlatformKey, OnboardingConnectionState> {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = {
      connected: false,
      accountId: null,
      accounts: [],
      lastSyncedAt: null,
    };
    return acc;
  }, {} as Record<PlatformKey, OnboardingConnectionState>);
}

export function createDefaultOnboardingState(owner?: BrandMember): OnboardingState {
  return {
    step: 0,
    brand: {
      name: owner ? `${owner.email.split("@")[0]}'s Brand` : "",
      industry: "",
      brandVoice: null,
      brandVoiceTags: [],
      targetAudience: null,
      timezone: "UTC",
    },
    documents: [],
    connections: makeDefaultConnections(),
    members: owner ? [owner] : [],
    invites: [],
    completedAt: null,
  };
}

export function createDefaultMetadata(brandId: string, owner?: BrandMember): OnboardingMetadata {
  return {
    activeBrandId: brandId,
    brands: {
      [brandId]: createDefaultOnboardingState(owner),
    },
  };
}

export function parseOnboardingMetadata(raw: unknown): OnboardingMetadata {
  if (!raw) return { activeBrandId: null, brands: {} };
  const parsed = onboardingMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    return { activeBrandId: null, brands: {} };
  }
  return parsed.data;
}

export function ensureBrandExists(
  metadata: OnboardingMetadata,
  brandId: string,
  owner?: BrandMember
): OnboardingMetadata {
  if (!metadata.brands[brandId]) {
    metadata.brands[brandId] = createDefaultOnboardingState(owner);
  }
  if (!metadata.activeBrandId) {
    metadata.activeBrandId = brandId;
  }
  return metadata;
}

export function createBrandId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function clampStep(step: number): number {
  if (Number.isNaN(step)) return 0;
  if (step < 0) return 0;
  if (step > 2) return 2;
  return step;
}

export function mergeOnboardingState(
  current: OnboardingState,
  patch: OnboardingPatch
): OnboardingState {
  const next: OnboardingState = {
    step: current.step,
    brand: { ...current.brand },
    documents: [...current.documents],
    connections: { ...current.connections },
    members: [...current.members],
    invites: [...current.invites],
    completedAt: current.completedAt ?? null,
  };

  if (patch.step !== undefined) {
    next.step = clampStep(patch.step);
  }

  if (patch.brand) {
    next.brand = {
      name: patch.brand.name ?? next.brand.name,
      industry: patch.brand.industry ?? next.brand.industry,
      brandVoice: patch.brand.brandVoice === undefined ? next.brand.brandVoice : patch.brand.brandVoice,
      brandVoiceTags: patch.brand.brandVoiceTags ?? next.brand.brandVoiceTags,
      targetAudience:
        patch.brand.targetAudience === undefined ? next.brand.targetAudience : patch.brand.targetAudience,
      timezone: patch.brand.timezone ?? next.brand.timezone,
    };
  }

  if (patch.documents) {
    next.documents = patch.documents;
  }

  if (patch.connections) {
    for (const key of PLATFORM_KEYS) {
      const update = patch.connections[key];
      if (!update) continue;
      const existing = next.connections[key] ?? {
        connected: false,
        accountId: null,
        accounts: [],
        lastSyncedAt: null,
      };
      next.connections[key] = {
        connected: update.connected ?? existing.connected,
        accountId:
          update.accountId !== undefined
            ? update.accountId ?? null
            : existing.accountId ?? null,
        accounts: update.accounts ?? existing.accounts,
        lastSyncedAt:
          update.lastSyncedAt !== undefined
            ? update.lastSyncedAt ?? null
            : existing.lastSyncedAt ?? null,
      };
    }
  }

  if (patch.members) {
    next.members = patch.members;
  }

  if (patch.invites) {
    next.invites = patch.invites;
  }

  if (patch.completedAt !== undefined) {
    next.completedAt = patch.completedAt ?? null;
  }

  return onboardingStateSchema.parse(next);
}

export function isOnboardingComplete(state: OnboardingState): boolean {
  return Boolean(state.completedAt);
}
