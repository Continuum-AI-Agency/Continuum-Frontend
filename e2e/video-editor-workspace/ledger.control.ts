// The storage ledger's $0 hosted positive control, by id, with the service-role key only (what a
// GCP client VM holds; never the management token). RED: a ledger whose listing sees nothing
// grades its zero FAIL, never PASS, and the real listing then finds the control it missed.
// GREEN: one tiny owned object planted on the bench brand is seen, taken back, and proven gone.
// It also reads, never writes, the two other service-role hops the benches lean on: whether a
// kept transcript exists, and get_job by id.
//   bun e2e/video-editor-workspace/ledger.control.ts
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Recorder } from '../../../Continuum-Backend/scripts/_bench/recorder';
import { loadProdSupabaseEnv } from '../support/prodEnv';
import {
  AI_STUDIO_BUCKET,
  jobRows,
  keptTranscript,
  presentObjects,
  proveNetZero,
  removeObjects,
  type StorageLedger,
  unkeptTranscripts,
} from './ledger';

const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const RUN = `control-${randomUUID().slice(0, 8)}`;
const { url, serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const rec = new Recorder('videoeditor:ledger:control');

/** The same client, except its storage listing sees nothing. */
const blind = {
  schema: (name: string) => admin.schema(name),
  storage: {
    from: (bucket: string) => {
      const api = admin.storage.from(bucket);
      return {
        upload: api.upload.bind(api),
        remove: api.remove.bind(api),
        list: async () => ({ data: [], error: null }),
      };
    },
  },
} as unknown as SupabaseClient;

const redLedger: StorageLedger = { objects: [], folders: [] };
const red = await proveNetZero(blind, BRAND, {
  id: `${RUN}-blind`,
  ledger: redLedger,
  assets: [],
  settleMs: 0,
});
const redGrades = red.steps.map((step) => step.grade).join(',');
rec.check(
  'RED: a blind ledger never PASSes its zero',
  redGrades === 'FAIL,FAIL,FAIL,SKIP',
  `${redGrades} · ${red.steps[2]?.detail}`,
);
const control = redLedger.objects.at(-1);
const missed = await presentObjects(admin, redLedger);
rec.check(
  'RED: the real listing finds, by path, the planted control the blind ledger missed',
  missed.length === 1 && missed[0]?.path === control?.path,
  `${control?.bucket}/${control?.path}`,
);
await removeObjects(admin, missed);
const strays = (await presentObjects(admin, redLedger)).length;
rec.check('RED cleanup: the missed control is removed and gone', strays === 0, `left ${strays}`);

const green = await proveNetZero(admin, BRAND, {
  id: RUN,
  ledger: { objects: [], folders: [] },
  assets: [],
  settleMs: 0,
});
for (const step of green.steps) rec.record(`GREEN: ${step.step}`, step.grade, step.detail);

const { data: kept, error: keptError } = await admin.storage
  .from(AI_STUDIO_BUCKET)
  .list(`${BRAND}/video-editor/transcripts`, { limit: 1 });
const keptVersion = kept?.[0]?.name.replace(/\.json$/, '');
const fresh = randomUUID();
const unkept = await unkeptTranscripts(admin, BRAND, keptVersion ? [keptVersion, fresh] : [fresh]);
rec.check(
  'transcripts: one kept before is never owned, one not kept yet is',
  !keptError && unkept.length === 1 && unkept[0]?.path === keptTranscript(BRAND, fresh).path,
  `${keptVersion ? `kept ${keptVersion} not owned; ` : 'no kept transcript on the brand to read; '}unkept ${fresh} owned`,
);

const job = await jobRows(admin, randomUUID(), [`job_${'0'.repeat(32)}`]);
rec.check(
  'job rows: get_job answers the service role by id (a missing id reads as gone)',
  job.detail.includes('left by job id: none (0 of 1'),
  job.detail,
);

rec.finish();
