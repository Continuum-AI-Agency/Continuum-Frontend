import { randomUUID } from "node:crypto";

import type {
  AiStudioArtifact,
  AiStudioGenerationRequest,
  AiStudioJob,
  AiStudioMedium,
  AiStudioProvider,
  AiStudioTemplate,
} from "@/lib/schemas/aiStudio";

type TemplateFilter = {
  provider?: AiStudioProvider;
  medium?: AiStudioMedium;
};

type JobsQuery = {
  brandProfileId: string;
  limit?: number;
  after?: string;
};

const FALLBACK_TEMPLATES: AiStudioTemplate[] = [
  {
    id: "nano-hero-product",
    name: "Hero Product Spotlight",
    description: "Cinematic light-beam setup highlighting your flagship product on branded gradients.",
    provider: "nano-banana",
    medium: "image",
    aspectRatio: "4:5",
    defaultPrompt:
      "Photoreal hero product shot of {brand} flagship item floating above a glass podium, volumetric lighting, branded gradients, crisp focus, studio reflections.",
    defaultNegativePrompt:
      "blurry, low resolution, distorted, watermarks, text overlay, extra limbs, disfigured",
    metadata: {
      tone: "premium",
      lighting: "volumetric",
      recommendedColors: ["#7DD3FC", "#1E293B", "#F8FAFC"],
    },
    tags: ["Product", "Launch", "Paid"],
  },
  {
    id: "nano-campaign-flatlay",
    name: "Campaign Flatlay",
    description: "Editorial flatlay arrangement with props that telegraph campaign story and palette.",
    provider: "nano-banana",
    medium: "image",
    aspectRatio: "16:9",
    defaultPrompt:
      "Flatlay scene showing {brand} kit with supporting props, top-down camera, soft afternoon light, styled typography card, clean shadows.",
    defaultNegativePrompt: "messy, harsh light, cluttered, text errors, extra hands",
    metadata: {
      tone: "lifestyle",
      props: ["notebook", "ceramic mug", "tablet display"],
      surfaces: ["linen", "stone"],
    },
    tags: ["Organic", "Lifestyle"],
  },
  {
    id: "veo-motion-anthem",
    name: "Motion Anthem Loop",
    description: "High-energy b-roll with macro details, parallax moves, and bold typography transitions.",
    provider: "veo-3-1",
    medium: "video",
    aspectRatio: "9:16",
    defaultPrompt:
      "Cinematic montage of {brand} team collaborating in a luminous studio, macro product details, smooth gimbal shots, motivational energy, vibrant lighting transitions.",
    metadata: {
      tone: "energetic",
      durationHint: 12,
      musicCue: "uplifting electronic",
    },
    tags: ["B-Roll", "Brand Story"],
  },
  {
    id: "sora-storyboard",
    name: "Storyboard Narrative",
    description: "Long-form narrative shot list for launch storytelling across hero, context, and CTA beats.",
    provider: "sora-2",
    medium: "video",
    aspectRatio: "16:9",
    defaultPrompt:
      "Three-act story of a founder using {brand} platform to orchestrate a product launch. Act 1: ideation in dawn light. Act 2: team collaboration with dashboards. Act 3: product reveal event with cheering audience.",
    metadata: {
      tone: "inspirational",
      durationHint: 45,
      chapters: ["Ideation", "Collaboration", "Reveal"],
    },
    tags: ["Narrative", "Hero"],
  },
];

const SAMPLE_ARTIFACTS: Record<AiStudioProvider, AiStudioArtifact> = {
  "nano-banana": {
    id: "sample-nano-artifact",
    uri: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    previewUri: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=60",
    mimeType: "image/jpeg",
    medium: "image",
    fileName: "continuum-concept.jpg",
    sizeBytes: 820_000,
    metadata: { source: "fallback" },
    createdAt: new Date().toISOString(),
  },
  "veo-3-1": {
    id: "sample-veo-artifact",
    uri: "https://storage.googleapis.com/continuum-fallback-assets/veo-demo.mp4",
    previewUri: "https://storage.googleapis.com/continuum-fallback-assets/veo-demo.mp4",
    mimeType: "video/mp4",
    medium: "video",
    fileName: "continuum-veo-demo.mp4",
    sizeBytes: 6_200_000,
    metadata: { source: "fallback" },
    createdAt: new Date().toISOString(),
  },
  "sora-2": {
    id: "sample-sora-artifact",
    uri: "https://storage.googleapis.com/continuum-fallback-assets/sora-demo.mp4",
    previewUri: "https://storage.googleapis.com/continuum-fallback-assets/sora-demo.mp4",
    mimeType: "video/mp4",
    medium: "video",
    fileName: "continuum-sora-demo.mp4",
    sizeBytes: 14_400_000,
    metadata: { source: "fallback" },
    createdAt: new Date().toISOString(),
  },
};

const fallbackJobsStore = new Map<string, AiStudioJob[]>();

function ensureSeedJobs(brandProfileId: string): AiStudioJob[] {
  const existing = fallbackJobsStore.get(brandProfileId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const seeded: AiStudioJob[] = [
    {
      id: randomUUID(),
      brandProfileId,
      provider: "nano-banana",
      medium: "image",
      templateId: "nano-hero-product",
      prompt: "Hero product spotlight for Continuum, volumetric lighting, gradient backdrop, glass podium.",
      negativePrompt: "low quality, watermark, disfigured, text overlay",
      aspectRatio: "4:5",
      durationSeconds: undefined,
      status: "completed",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      artifacts: [SAMPLE_ARTIFACTS["nano-banana"]],
      failure: undefined,
      metadata: {
        fallback: true,
        note: "Seeded preview render",
      },
    },
    {
      id: randomUUID(),
      brandProfileId,
      provider: "veo-3-1",
      medium: "video",
      templateId: "veo-motion-anthem",
      prompt: "Energetic montage of Continuum team collaborating with glowing dashboards and macro product shots.",
      negativePrompt: "blurry, jittery camera, text errors",
      aspectRatio: "9:16",
      durationSeconds: 12,
      status: "completed",
      createdAt: new Date(now.getTime() - 1000 * 60 * 20).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 60 * 18).toISOString(),
      artifacts: [SAMPLE_ARTIFACTS["veo-3-1"]],
      failure: undefined,
      metadata: {
        fallback: true,
        note: "Sample Veo motion loop",
      },
    },
  ];

  fallbackJobsStore.set(brandProfileId, seeded);
  return seeded;
}

function promoteCompletedJobs(jobs: AiStudioJob[]): AiStudioJob[] {
  const now = Date.now();
  let mutated = false;

  const nextJobs: AiStudioJob[] = jobs.map((job): AiStudioJob => {
    if ((job.status === "queued" || job.status === "processing") && now - Date.parse(job.createdAt) > 4_000) {
      mutated = true;
      const nextArtifacts =
        job.artifacts.length > 0
          ? job.artifacts
          : [SAMPLE_ARTIFACTS[job.provider] ?? SAMPLE_ARTIFACTS["nano-banana"]];

      return {
        ...job,
        status: "completed",
        artifacts: nextArtifacts,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...job.metadata,
          fallback: true,
          autoCompleted: true,
        },
      };
    }
    return job;
  });

  return mutated ? nextJobs : jobs;
}

export function getFallbackTemplates(filter: TemplateFilter): AiStudioTemplate[] {
  return FALLBACK_TEMPLATES.filter((template) => {
    if (filter.provider && template.provider !== filter.provider) return false;
    if (filter.medium && template.medium !== filter.medium) return false;
    return true;
  });
}

export function getFallbackJobs(query: JobsQuery): AiStudioJob[] {
  const seeded = promoteCompletedJobs(ensureSeedJobs(query.brandProfileId));
  fallbackJobsStore.set(query.brandProfileId, seeded);

  if (!query.limit) {
    return seeded;
  }
  return seeded.slice(0, query.limit);
}

export function recordFallbackJob(job: AiStudioJob): void {
  const existing = fallbackJobsStore.get(job.brandProfileId) ?? ensureSeedJobs(job.brandProfileId);
  fallbackJobsStore.set(job.brandProfileId, [job, ...existing]);
}

export function createFallbackJobFromRequest(payload: AiStudioGenerationRequest): AiStudioJob {
  const now = new Date();
  return {
    id: randomUUID(),
    brandProfileId: payload.brandProfileId,
    provider: payload.provider,
    medium: payload.medium,
    templateId: payload.templateId ?? undefined,
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt ?? undefined,
    aspectRatio: payload.aspectRatio ?? undefined,
    durationSeconds: payload.durationSeconds ?? undefined,
    status: "processing",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    artifacts: [],
    failure: undefined,
    metadata: {
      fallback: true,
      note: "Stub job enqueued while upstream generation service is unavailable.",
    },
  };
}

export function markFallbackJobErrored(
  brandProfileId: string,
  jobId: string,
  message: string
): void {
  const jobs = fallbackJobsStore.get(brandProfileId);
  if (!jobs) return;

  const nextJobs: AiStudioJob[] = jobs.map((job): AiStudioJob =>
    job.id === jobId
      ? {
          ...job,
          status: "failed",
          failure: {
            message,
            code: "fallback-error",
            retryable: true,
          },
          updatedAt: new Date().toISOString(),
        }
      : job
  );

  fallbackJobsStore.set(brandProfileId, nextJobs);
}
