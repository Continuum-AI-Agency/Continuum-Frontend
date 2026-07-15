'use client';

import { prepareDailyDashboardResponseSchema } from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { http } from '@/lib/api/http';

const FAILURE_RETRY_MS = 10 * 60 * 1000;
const SUCCESS_LEASE_MS = 30 * 60 * 60 * 1000;

function leaseKey(brandId: string, localDate: string): string {
  return `continuum:daily-dashboard-warm:${brandId}:${localDate}`;
}

function claimLease(key: string, ttl: number): boolean {
  try {
    const existing = Number(window.sessionStorage.getItem(key));
    if (Number.isFinite(existing) && existing > Date.now()) return false;
    window.sessionStorage.setItem(key, String(Date.now() + ttl));
    return true;
  } catch {
    return true;
  }
}

function settleLease(key: string, ttl: number): void {
  try {
    window.sessionStorage.setItem(key, String(Date.now() + ttl));
  } catch {}
}

export function DailyDashboardWarmOnMount({
  brandId,
  localDate,
  shouldWarm,
}: {
  brandId: string;
  localDate: string;
  shouldWarm: boolean;
}) {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (!shouldWarm || fired.current) return;
    fired.current = true;
    const key = leaseKey(brandId, localDate);
    if (!claimLease(key, FAILURE_RETRY_MS)) return;
    void http
      .request({
        path: '/api/dashboard/daily/prepare',
        method: 'POST',
        body: { brandId },
        schema: prepareDailyDashboardResponseSchema,
      })
      .then(() => {
        settleLease(key, SUCCESS_LEASE_MS);
        router.refresh();
      })
      .catch(() => settleLease(key, FAILURE_RETRY_MS));
  }, [brandId, localDate, router, shouldWarm]);
  return null;
}
