import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { WEEKLY_REPORT_FIXTURE } from '@/components/paid-media/jaina/export/__fixtures__/weeklyReport';
import { JainaWeeklyReportPreview, type WeeklyReportSource } from './JainaWeeklyReportPreview';

// The report the Backend's live bench wrote, when it has written one; otherwise the fixture.
// Read on the server so the harness renders exactly the bytes the Backend produced — the
// client parses them through the real report schema, the same way a persisted turn is.
const LIVE_ARTIFACT = path.resolve(process.cwd(), '..', 'artifacts', 'jaina', 'weekly-report-live.json');

async function loadReport(): Promise<{ json: unknown; source: WeeklyReportSource }> {
  const artifact = process.env.JAINA_WEEKLY_REPORT_JSON || LIVE_ARTIFACT;
  try {
    const text = await readFile(artifact, 'utf8');
    return { json: JSON.parse(text), source: { kind: 'live', path: artifact } };
  } catch {
    return { json: WEEKLY_REPORT_FIXTURE, source: { kind: 'fixture', path: artifact } };
  }
}

async function Preview() {
  await connection();
  const { json, source } = await loadReport();
  return <JainaWeeklyReportPreview json={json} source={source} />;
}

export default function JainaWeeklyReportPreviewPage() {
  return (
    <Suspense fallback={null}>
      <Preview />
    </Suspense>
  );
}
