// A stored creative report shaped on Easy Fit's Meta brand (paid_media.creative_reports, read
// 2026-11-03): one account (act_521903353286118, MXN), conversations bought at the BOF, the four
// verdicts present, stored fbcdn thumbnails, two iteration briefs and a synopsis. Figures and
// reasons are the stored ones, trimmed to six ads.
import { type PaidCreativeReport, paidCreativeReportSchema } from '@continuum/contracts';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';

export const EASY_FIT_ACCOUNT: HomeAdAccount = {
  id: 'act_521903353286118',
  name: 'Easy Fit',
  currency: 'MXN',
  platform: 'meta',
};

export const SECOND_USD_ACCOUNT: HomeAdAccount = {
  id: 'act_900000000000001',
  name: 'Easy Fit US',
  currency: 'USD',
  platform: 'meta',
};

export const GOOGLE_ACCOUNT: HomeAdAccount = {
  id: '1234567890',
  name: 'Easy Fit Google',
  currency: 'USD',
  platform: 'google_ads',
};

const thumb = (id: string) => `https://scontent.ffsd3-1.fna.fbcdn.net/v/t15.5256-10/${id}_n.jpg`;

export const EASY_FIT_REPORT: PaidCreativeReport = paidCreativeReportSchema.parse({
  brandId: '148583e0-5538-462b-8d3a-acd25b80344e',
  adAccountId: 'act_521903353286118',
  generatedAt: '2026-10-29T09:46:21.904Z',
  verdicts: [
    {
      adId: '120252022440000236',
      adName: 'CAÑADAS // 50% ANUALIDAD (3) // AGOSTO',
      funnelStage: 'bof',
      verdict: 'kill',
      reason:
        'Cost per conversation $95.04 is 3.2x the BOF cohort median ($29.76) on d14 and 2.4x on d7 — persistently expensive, not a fluke window.',
      spend: 5668.34,
      cpa: 71.75113924050633,
      cpaVsCohortMedian: 3.1935260103076577,
      thumbnailUrl: thumb('764952979'),
      permalinkUrl: 'https://www.instagram.com/p/Dbv0ywNs0Z2/',
    },
    {
      adId: '120252021696220236',
      adName: 'ALEIRA // PRIMER MES $12 (3) // AGOSTO',
      funnelStage: 'bof',
      verdict: 'scale',
      reason:
        'Cost per conversation $23.72 beats the BOF cohort median ($29.76) by 20% over 14d on $3036.07 of spend.',
      spend: 7390.09,
      cpa: 20.7586797752809,
      cpaVsCohortMedian: 0.7969718713927262,
      thumbnailUrl: thumb('769536013'),
      permalinkUrl: 'https://www.instagram.com/p/Dbvw2jnMDIR/',
    },
    {
      adId: '120252021628830236',
      adName: 'AVILA CAMACHO // PRIMER MES $12 (3) // AGOSTO',
      funnelStage: 'bof',
      verdict: 'scale',
      reason:
        'Cost per conversation $20.28 beats the BOF cohort median ($29.76) by 32% over 14d on $2554.75 of spend.',
      spend: 6879.36,
      cpa: 17.730309278350514,
      cpaVsCohortMedian: 0.6814,
      thumbnailUrl: null,
      permalinkUrl: 'javascript:alert(1)',
    },
    {
      adId: '120252021900130236',
      adName: 'COYOACAN // 50% ANUALIDAD (2) // AGOSTO',
      funnelStage: 'bof',
      verdict: 'iterate',
      reason:
        'Cost per conversation $36.10 sits 1.2x the BOF cohort median ($29.76) — mid band: worth a new angle, not budget.',
      spend: 2210.5,
      cpa: 36.1,
      cpaVsCohortMedian: 1.213,
      thumbnailUrl: thumb('770011223'),
      optimizerRecommendationId: '6c3f7a52-1d1e-4a4b-9a43-6d7f1f2b9c11',
    },
    {
      adId: '120252021900140236',
      adName: 'TLALPAN // PRIMER MES $12 (1) // AGOSTO',
      funnelStage: 'mof',
      verdict: 'iterate',
      reason:
        'Hook rate 31% beats the MOF cohort median (24%) but cost per conversation $41.20 is 1.4x its median — strong hook, weak conversion.',
      spend: 3120.0,
      cpa: 41.2,
      cpaVsCohortMedian: 1.38,
      thumbnailUrl: 'data:image/png;base64,AAAA',
    },
    {
      adId: '120252021900150236',
      adName: 'NARVARTE // INSCRIPCION $0 // OCTUBRE',
      funnelStage: 'tof',
      verdict: 'watch',
      reason:
        'Only $38.20 spend and 2100 impressions in 14d — below the $50.00/3000 evidence floors, too early to call.',
      spend: 38.2,
      cpa: null,
      cpaVsCohortMedian: null,
      thumbnailUrl: thumb('771122334'),
    },
  ],
  iterationBriefs: [
    {
      adId: '120252021900130236',
      title: 'Low-Barrier Enrollment Offer for Gym Sign-ups',
      brief:
        'Shift from a pure discount focus to a low-barrier entry angle by highlighting ease of sign-up alongside the 50% discount value stack.',
      groundedOn: ['hook:value_stack + asset:video (lift 1.1)'],
    },
  ],
  synopsis: {
    themes: [
      'The value stack hook style underperforms in retargeting campaigns.',
      'Video assets struggle to convert when used for retargeting.',
    ],
    generatedAt: '2026-10-29T09:46:00.000Z',
  },
});
