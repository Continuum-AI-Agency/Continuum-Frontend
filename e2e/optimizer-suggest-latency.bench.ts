#!/usr/bin/env bun

// PP-L1-suggest-slower-than-read-timeout-reads-offline, against production.
//
// optimizer-suggest reads the account's ad sets from Meta live when the reporting cache is
// cold. Under the shared 8 s read bound that cold answer was thrown away and the wizard said
// "the optimizer service is offline" — the deep test saw a 200 `all_cbo` answer land after
// 13.0 s. This bench drives the browser's own read path — supabase-js with the app's socket
// policy (`supabaseTimeoutPolicy`) under a real member session, wrapped in the bound
// `useOptimizerSuggestions` applies — warm and cold, and grades:
//   - every read answers with a SuggestResult inside PLATFORM_READ_TIMEOUT_MS;
//   - how many of those answers the old READ_TIMEOUT_MS bound would have dropped.
//
// Read-only on the ad platforms: `forceRefresh` makes paid-media-metrics read Meta live
// (Graph GETs) and rewrite our own reporting cache, nothing else.
//
//   bun run optimizer:suggest:latency:bench            # 1 warm + 2 cold reads per account
//   SUGGEST_BENCH_COLD_READS=4 bun run optimizer:suggest:latency:bench

import { SuggestResultSchema } from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import {
  fetchWithTimeout,
  isRequestTimeout,
  PLATFORM_READ_TIMEOUT_MS,
  READ_TIMEOUT_MS,
  supabaseTimeoutPolicy,
  withTimeout,
} from '@/lib/api/timeout';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv } from './support/prodEnv';

const BENCH = 'optimizer:suggest:latency:bench';
const MEMBER_EMAIL = process.env.SUGGEST_BENCH_EMAIL ?? 'mercadotecniavivo@gmail.com';
const COLD_READS = Number(process.env.SUGGEST_BENCH_COLD_READS ?? 2);

// Two answers the wizard has to render: an account whose ad sets are all CBO (the deep
// test's 13 s read) and Easy Fit's Meta account, which also reads its Google account.
const ACCOUNTS = [
  {
    label: 'agency (all CBO)',
    brandId: '148583e0-5538-462b-8d3a-acd25b80344e',
    accountId: 'act_1296885445611472',
  },
  {
    label: 'Easy Fit (Meta + Google)',
    brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    accountId: 'act_521903353286118',
  },
];

const notes: string[] = [];
const recorder = createBenchRecorder(BENCH, notes);
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};
let failures = 0;
const grade = (step: string, ok: boolean, detail: string) => {
  if (!ok) failures += 1;
  recorder.record(step, ok ? 'PASS' : 'FAIL', detail);
  console.log(`${ok ? '✓' : '✗'} ${step} — ${detail}`);
};

async function main(): Promise<void> {
  const env = loadProdSupabaseEnv();
  const { accessToken } = await mintSessionBundleForEmail(MEMBER_EMAIL);
  const client = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: fetchWithTimeout(supabaseTimeoutPolicy),
    },
  });

  const coldMs: number[] = [];
  for (const account of ACCOUNTS) {
    const reads = [false, ...Array.from({ length: COLD_READS }, () => true)];
    for (const [index, forceRefresh] of reads.entries()) {
      const kind = forceRefresh ? 'cold' : 'warm';
      const step = `${account.label} — ${kind} read ${index}`;
      const started = performance.now();
      try {
        const { data, error } = await withTimeout(
          client.functions.invoke('optimizer-suggest', {
            body: { brandId: account.brandId, accountId: account.accountId, forceRefresh },
          }),
          PLATFORM_READ_TIMEOUT_MS,
          'optimizer read',
        );
        const ms = Math.round(performance.now() - started);
        if (forceRefresh) coldMs.push(ms);
        const parsed = SuggestResultSchema.safeParse(data);
        grade(
          step,
          !error && parsed.success,
          error
            ? `${ms} ms, error ${error.message}`
            : parsed.success
              ? `${ms} ms, reason ${parsed.data.reason ?? 'ok'}, ${parsed.data.suggestions.length} suggestion(s)` +
                (ms > READ_TIMEOUT_MS ? ` — past the old ${READ_TIMEOUT_MS / 1000} s bound` : '')
              : `${ms} ms, body is not a SuggestResult`,
        );
      } catch (error) {
        const ms = Math.round(performance.now() - started);
        grade(
          step,
          false,
          isRequestTimeout(error)
            ? `no answer within ${PLATFORM_READ_TIMEOUT_MS / 1000} s (${ms} ms)`
            : `${ms} ms, ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const dropped = coldMs.filter((ms) => ms > READ_TIMEOUT_MS).length;
  const slowest = coldMs.length > 0 ? Math.max(...coldMs) : 0;
  grade(
    'the slowest cold read fits the suggestions bound with room',
    slowest > 0 && slowest * 1.5 <= PLATFORM_READ_TIMEOUT_MS,
    `slowest cold ${slowest} ms, bound ${PLATFORM_READ_TIMEOUT_MS} ms`,
  );
  note(
    `${dropped} of ${coldMs.length} cold answers took longer than the old ${READ_TIMEOUT_MS / 1000} s ` +
      'bound: the wizard would have called the service offline for each of them.',
  );
  note(
    'Not exercised here: the rendered wizard. The slow / timeout / offline states are pinned by ' +
      'StepStart.failure.render.test.tsx; the live page by optimizer:e2e:bench "signal readiness".',
  );
}

main()
  .then(() => {
    recorder.print();
    process.exit(failures > 0 ? 1 : 0);
  })
  .catch((error) => {
    recorder.record('bench run', 'FAIL', error instanceof Error ? error.message : String(error));
    console.error(error);
    recorder.print();
    process.exit(1);
  });
