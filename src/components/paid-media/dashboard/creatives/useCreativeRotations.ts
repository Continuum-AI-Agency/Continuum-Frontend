"use client";

import * as React from "react";

import type { ActionLog, CreativeSwitchExternalPayload, ProductSwapProduct } from "@/lib/types/dco";

import {
  CREATIVE_SWAP_ACTION_TYPES,
  type RotationEvent,
  type RotationSummary,
  type UniqueCreative,
} from "./types";

type CurrentCreative = {
  id?: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
} | null | undefined;

type UseCreativeRotationsInput = {
  adId: string | null | undefined;
  logs: ActionLog[];
  currentCreative?: CurrentCreative;
};

function isCreativeSwapActionType(actionType: ActionLog["actionType"]): boolean {
  return CREATIVE_SWAP_ACTION_TYPES.includes(actionType);
}

function castPayload(actionPayload: unknown): CreativeSwitchExternalPayload | null {
  if (!actionPayload || typeof actionPayload !== "object") return null;
  return actionPayload as CreativeSwitchExternalPayload;
}

function toProduct(value: unknown): ProductSwapProduct | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProductSwapProduct>;
  if (typeof candidate.name !== "string" || typeof candidate.brand !== "string") return null;
  return candidate as ProductSwapProduct;
}

function buildRotationEvent(log: ActionLog): RotationEvent {
  const payload = castPayload(log.actionPayload);
  return {
    id: log.id,
    occurredAt: log.occurredAt,
    status: log.status,
    actionType: log.actionType,
    beforeUrl: payload?.original_creative_url ?? null,
    afterUrl: payload?.new_creative_url ?? null,
    outgoing: toProduct(payload?.outgoing_product),
    replacement: toProduct(payload?.replacement_product),
    decisionNote: log.decisionNote ?? null,
    error: log.error ?? null,
    payload,
    rawLog: log,
  };
}

export function summarizeCreativeRotations({
  adId,
  logs,
  currentCreative,
}: UseCreativeRotationsInput): RotationSummary {
  if (!adId) {
    return { rotations: [], uniqueCreatives: [], latestSwap: null };
  }

  const ascending = logs
    .filter((log) => log.metaAdId === adId && isCreativeSwapActionType(log.actionType))
    .slice()
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));

  const rotations = ascending.map(buildRotationEvent);

  const urlIndex = new Map<string, UniqueCreative>();
  rotations.forEach((event) => {
    if (event.afterUrl && !urlIndex.has(event.afterUrl)) {
      urlIndex.set(event.afterUrl, {
        url: event.afterUrl,
        firstSeenAt: event.occurredAt,
        replacedAt: null,
        product: event.replacement,
        isCurrent: false,
      });
    }
    if (event.beforeUrl) {
      const existing = urlIndex.get(event.beforeUrl);
      if (existing) {
        existing.replacedAt = event.occurredAt;
        if (!existing.product) existing.product = event.outgoing;
      } else {
        urlIndex.set(event.beforeUrl, {
          url: event.beforeUrl,
          firstSeenAt: event.occurredAt,
          replacedAt: event.occurredAt,
          product: event.outgoing,
          isCurrent: false,
        });
      }
    }
  });

  const currentImage = currentCreative?.imageUrl ?? currentCreative?.thumbnailUrl ?? null;
  if (currentImage) {
    const existing = urlIndex.get(currentImage);
    if (existing) {
      existing.isCurrent = true;
      existing.replacedAt = null;
    } else {
      urlIndex.set(currentImage, {
        url: currentImage,
        firstSeenAt: currentImage,
        replacedAt: null,
        product: null,
        isCurrent: true,
      });
    }
  }

  const uniqueCreatives = Array.from(urlIndex.values()).sort((left, right) => {
    if (left.isCurrent && !right.isCurrent) return -1;
    if (!left.isCurrent && right.isCurrent) return 1;
    return Date.parse(right.firstSeenAt) - Date.parse(left.firstSeenAt);
  });

  const latestSwap = rotations.length > 0 ? rotations[rotations.length - 1] : null;

  return { rotations, uniqueCreatives, latestSwap };
}

export function useCreativeRotations({
  adId,
  logs,
  currentCreative,
}: UseCreativeRotationsInput): RotationSummary {
  return React.useMemo(
    () => summarizeCreativeRotations({ adId, logs, currentCreative }),
    [adId, logs, currentCreative]
  );
}
