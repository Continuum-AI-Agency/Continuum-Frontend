"use server";

import { randomUUID } from "node:crypto";
import type { PlatformKey } from "@/components/onboarding/platforms";
import {
  appendDocument,
  applyOnboardingPatch,
  fetchOnboardingState,
  removeDocument,
  updateConnectionAccounts,
} from "@/lib/onboarding/storage";
import type {
  OnboardingDocument,
  OnboardingPatch,
  OnboardingState,
  OnboardingConnectionAccount,
} from "@/lib/onboarding/state";

const MOCK_ACCOUNT_NAMES = [
  "Primary Brand Account",
  "Performance Ads Account",
  "Global Presence",
  "Creative Studio",
];

function createMockAccounts(accountId?: string | null): OnboardingConnectionAccount[] {
  const sourceId = accountId ?? randomUUID();
  return [
    {
      id: sourceId,
      name: MOCK_ACCOUNT_NAMES[Math.floor(Math.random() * MOCK_ACCOUNT_NAMES.length)],
      status: "active",
    },
  ];
}

export async function fetchOnboardingStateAction(brandId: string): Promise<OnboardingState> {
  return fetchOnboardingState(brandId);
}

export async function mutateOnboardingStateAction(
  brandId: string,
  patch: OnboardingPatch
): Promise<OnboardingState> {
  return applyOnboardingPatch(brandId, patch);
}

export async function markPlatformConnectionAction(props: {
  brandId: string;
  key: PlatformKey;
  accountId?: string | null;
}): Promise<OnboardingState> {
  const accounts = createMockAccounts(props.accountId);
  return updateConnectionAccounts(props.brandId, props.key, {
    connected: true,
    accountId: accounts[0]?.id ?? props.accountId ?? null,
    accounts,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function refreshPlatformConnectionAction(
  brandId: string,
  provider: PlatformKey
): Promise<OnboardingState> {
  const accounts = createMockAccounts();
  return updateConnectionAccounts(brandId, provider, {
    connected: true,
    accountId: accounts[0]?.id ?? null,
    accounts,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function clearPlatformConnectionAction(
  brandId: string,
  key: PlatformKey
): Promise<OnboardingState> {
  return updateConnectionAccounts(brandId, key, {
    connected: false,
    accountId: null,
    accounts: [],
    lastSyncedAt: null,
  });
}

export async function completeOnboardingAction(brandId: string): Promise<OnboardingState> {
  return applyOnboardingPatch(brandId, {
    completedAt: new Date().toISOString(),
    step: 2,
  });
}

export async function registerDocumentMetadataAction(
  brandId: string,
  document: Omit<OnboardingDocument, "id" | "createdAt" | "status"> & {
  id?: string;
  status?: OnboardingDocument["status"];
}): Promise<OnboardingState> {
  const payload: OnboardingDocument = {
    id: document.id ?? randomUUID(),
    name: document.name,
    source: document.source,
    createdAt: new Date().toISOString(),
    status: document.status ?? "ready",
    size: document.size,
    externalUrl: document.externalUrl,
  };

  return appendDocument(brandId, payload);
}

export async function removeDocumentAction(
  brandId: string,
  documentId: string
): Promise<OnboardingState> {
  return removeDocument(brandId, documentId);
}
