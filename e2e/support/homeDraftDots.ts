// Independent authenticated reads -> the same pure domain models -> expected rendered dots.
// No expectation is read from a dot's own attributes or from the browser's response body.
import {
  accountCandidateSchema,
  brandBookResponseSchema,
  type HomeBrandReading,
  type HomeProfileRow,
  type HomeReadEnvelope,
  type HomeTileId,
  homeAccountHygieneReadSchema,
  homeCreativeSpotlightReadSchema,
  homeGoalTargetsReadSchema,
  homeOvernightLogReadSchema,
  PortfolioListItemSchema,
  paidAccountOverviewSchema,
  paidCreativeReportSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTranslator } from 'next-intl';
import { z } from 'zod';
import dashboardMessages from '../../messages/dashboard/en.json';
import { deriveDashboardSetup } from '../../src/components/dashboard/first-run/setupState';
import type { HomeDot } from '../../src/components/dashboard/home-board/HomeDots';
import {
  checklistDotItems,
  creativeDotItems,
  goalDotItems,
  healthDotItems,
  opportunityDotItems,
  organicDotItems,
  overnightDotItems,
  spotlightDotItems,
} from '../../src/components/dashboard/home-board/homeDotItems';
import {
  type HomeReadLoad,
  homeReadLoadOf,
} from '../../src/components/dashboard/home-board/homeRead';
import {
  accountRefsOf,
  actionsInWindow,
  needsOlderPage,
  overnightRowsOf,
} from '../../src/components/dashboard/home-board/modules/autopilot/overnightModel';
import { overnightRowsOfRead } from '../../src/components/dashboard/home-board/modules/autopilot/overnightRead';
import { checklistViewOf } from '../../src/components/dashboard/home-board/modules/checklist/checklistModel';
import { creativeTileState } from '../../src/components/dashboard/home-board/modules/creative/creativeModel';
import {
  type GoalLoad,
  type GoalWindow,
  goalActiveTarget,
  goalPeriodReadWindow,
  goalTileView,
  monthToDateWindow,
} from '../../src/components/dashboard/home-board/modules/goals/goalModel';
import type { GoalTargetsLoad } from '../../src/components/dashboard/home-board/modules/goals/goalTargetModel';
import {
  type DoctorInputs,
  doctorView,
} from '../../src/components/dashboard/home-board/modules/health/doctorModel';
import { oppsViewOf } from '../../src/components/dashboard/home-board/modules/opps/oppsModel';
import {
  buildOrganicWeek,
  organicWeekStart,
} from '../../src/components/dashboard/home-board/modules/organic/organicWeekModel';
import { draftsResponseSchema } from '../../src/components/dashboard/home-board/modules/organic/useOrganicWeek';
import { PLATFORM_KEYS } from '../../src/components/onboarding/platforms';
import {
  AccountReadEnvelopeSchema,
  OptimizerActionFeedPageSchema,
  type OptimizerActionFeedRow,
} from '../../src/components/paid-media/optimizer/useOptimizerData';
import type { HomeAdAccount } from '../../src/lib/home/homeAccounts';
import { googleOverviewForHome } from '../../src/lib/home/homeOverviewModel';
import type { SnapshotAccountRef } from '../../src/lib/organic/brandOrganicSnapshot';
import {
  type CalendarPostAccountsByPlatform,
  calendarPostsResponseSchema,
  getWeekRange,
} from '../../src/lib/organic/calendar-posts';

/** The bench signs in with an English session, so the expected dots are said in English. */
const uiText = createTranslator({
  locale: 'en',
  messages: { dashboard: dashboardMessages },
  namespace: 'dashboard',
});

type Facts = {
  brandId: string;
  adAccounts: HomeAdAccount[];
  organicAccounts: SnapshotAccountRef[];
  profileRows: HomeProfileRow[];
  reading: HomeBrandReading;
};
type Source = {
  facts: Facts;
  userId: string;
  client: SupabaseClient;
  apiBase: string;
  now: Date;
  get: (url: string) => Promise<{ status: number; body: unknown }>;
  calendar: (body: Record<string, unknown>) => Promise<unknown>;
};

export async function expectedHomeDraftDots(
  ids: readonly HomeTileId[],
  source: Source,
): Promise<Map<HomeTileId, HomeDot[]>> {
  const { facts, client, apiBase, now } = source;
  const result = new Map<HomeTileId, HomeDot[]>();
  let portfolioPromise: Promise<z.infer<typeof PortfolioListItemSchema>[]> | undefined;
  const portfolios = () =>
    (portfolioPromise ??= (async () => {
      const { data, error } = await client.rpc('optimizer_list_portfolios', {
        p_brand_id: facts.brandId,
      });
      if (error) throw new Error(`dot oracle portfolios: ${error.message}`);
      const rows = z.array(z.unknown()).parse(data ?? []);
      const valid = rows.flatMap((row) => {
        const parsed = PortfolioListItemSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      });
      if (rows.length > 0 && valid.length === 0)
        throw new Error('No portfolio row passed the source schema');
      return valid;
    })());

  async function homeRead<T>(
    path: string,
    schema: z.ZodType<HomeReadEnvelope<T>>,
  ): Promise<HomeReadLoad<T>> {
    const response = await source.get(
      `${apiBase}/api/home/${path}?${new URLSearchParams({ brandId: facts.brandId })}`,
    );
    if (response.status === 404) return { status: 'unavailable' };
    if (response.status !== 200)
      throw new Error(`dot oracle ${path}: HTTP ${response.status}; live source un-exercised`);
    return homeReadLoadOf(schema.parse(response.body));
  }

  async function goalLoad(window: GoalWindow | null): Promise<GoalLoad> {
    if (!window || facts.adAccounts.length === 0) return { status: 'idle' };
    const readings = await Promise.allSettled(
      facts.adAccounts.map(async (account) => {
        const read = async (resultBucket?: 'leads' | 'purchases') => {
          const google = account.platform === 'google_ads';
          const { data, error } = await client.functions.invoke(
            google
              ? 'paid-media-reporting/metrics?platform=google-ads'
              : 'paid-media-reporting/metrics',
            {
              body: {
                platform: google ? 'google-ads' : 'meta',
                brandId: facts.brandId,
                adAccountId: account.id,
                scope: 'account_overview',
                range: { preset: 'custom', ...window },
                ...(resultBucket ? { resultBucket } : {}),
              },
            },
          );
          if (error) throw new Error(`dot oracle overview ${account.id}: ${error.message}`);
          return paidAccountOverviewSchema.parse(data);
        };
        const overview =
          account.platform === 'meta'
            ? await read()
            : await Promise.all([read('leads'), read('purchases')]).then(([leads, purchases]) =>
                googleOverviewForHome({ leads, purchases }),
              );
        return { account, overview };
      }),
    );
    const reads = readings.flatMap((reading) =>
      reading.status === 'fulfilled' ? [reading.value] : [],
    );
    const failures = readings.flatMap((reading, index) =>
      reading.status === 'rejected' && facts.adAccounts[index]
        ? [{ account: facts.adAccounts[index] as HomeAdAccount, error: reading.reason as unknown }]
        : [],
    );
    return reads.length === 0
      ? { status: 'error', failures }
      : { status: 'ready', reads, failures };
  }

  for (const id of ids) {
    if (id === 'goals') {
      const window = monthToDateWindow(now, 'America/Mexico_City');
      const load = await goalLoad(window);
      const response = await source.get(
        `${apiBase}/api/home/goal-targets?${new URLSearchParams({ brandId: facts.brandId })}`,
      );
      let targets: GoalTargetsLoad = {
        status: response.status === 404 ? 'unavailable' : 'unreadable',
      };
      if (response.status === 200) {
        const read = homeGoalTargetsReadSchema.parse(response.body);
        targets =
          read.state === 'ready'
            ? { status: 'ready', targets: read.data.targets }
            : read.missing.reason === 'not_deployed'
              ? { status: 'unavailable' }
              : { status: 'ready', targets: [] };
      }
      const active = goalActiveTarget({
        targets,
        load,
        rows: facts.profileRows,
        suggested: facts.reading.goal.suggested,
        now,
      });
      const periodLoad = await goalLoad(goalPeriodReadWindow(active, window));
      const view = goalTileView({
        accounts: facts.adAccounts,
        window,
        load,
        rows: facts.profileRows,
        suggested: facts.reading.goal.suggested,
        targets,
        active,
        periodLoad,
      });
      if (view.state === 'error' || view.state === 'loading')
        throw new Error('Independent goal source did not settle; dot values un-exercised');
      result.set(id, view.state === 'ready' ? goalDotItems(view, uiText) : []);
    } else if (id === 'opps' || id === 'checklist') {
      const rows = await portfolios();
      if (id === 'opps') {
        const view = oppsViewOf(rows);
        result.set(id, view.state === 'ready' ? opportunityDotItems(view.portfolios, uiText) : []);
      } else {
        const view = checklistViewOf(rows);
        result.set(id, view.state === 'ready' ? checklistDotItems(view.portfolios, uiText) : []);
      }
    } else if (id === 'health') {
      const [rows, accounts, hygiene, book, integrations] = await Promise.all([
        portfolios(),
        Promise.all(
          facts.adAccounts.map(async (account) => {
            const { data, error } = await client.rpc('optimizer_get_account_read', {
              p_brand_id: facts.brandId,
              p_ad_account_id: account.id,
            });
            return {
              account,
              status: error ? ('error' as const) : ('success' as const),
              data: AccountReadEnvelopeSchema.catch(null).parse(data ?? null),
            };
          }),
        ),
        homeRead('reads/account-hygiene', homeAccountHygieneReadSchema),
        client.functions.invoke('get-brand-book', { body: { brandId: facts.brandId } }),
        client
          .schema('brand_profiles')
          .rpc('get_user_integration_summary', { p_user_id: source.userId }),
      ]);
      if (integrations.error) throw new Error(`dot oracle setup: ${integrations.error.message}`);
      const userRows = z
        .array(z.object({ platform_key: z.string().nullable() }))
        .parse(integrations.data ?? []);
      const hasConnectedProviders = userRows.some((row) =>
        PLATFORM_KEYS.some((key) => key === row.platform_key),
      );
      const parsedBook = brandBookResponseSchema.safeParse(book.data);
      const setup = deriveDashboardSetup({
        hasConnectedProviders,
        hasAssignedAccounts: facts.adAccounts.length + facts.organicAccounts.length > 0,
        brandBook: parsedBook.success ? parsedBook.data : null,
      });
      let googleCards: DoctorInputs['googleCards'] = null;
      if (facts.adAccounts.some((account) => account.platform === 'google_ads')) {
        const { data, error } = await client.rpc('optimizer_get_platform_cards', {
          p_brand_id: facts.brandId,
          p_platform: 'google_ads',
        });
        if (error) throw new Error(`dot oracle Google checks: ${error.message}`);
        googleCards = {
          status: 'ready' as const,
          cards: z.array(accountCandidateSchema).parse(data ?? []),
        };
      }
      const view = doctorView({
        issues: facts.reading.issues,
        portfolios: { status: 'ready', rows },
        adAccounts: facts.adAccounts,
        accountReads: accounts,
        googleCards,
        setup,
        hygiene,
      });
      if (view.state === 'error' || view.state === 'loading')
        throw new Error('Independent health source did not settle');
      result.set(id, view.state === 'ready' ? healthDotItems(view.checks, uiText) : []);
    } else if (id === 'creative') {
      const spotlight = await homeRead('reads/creative-spotlight', homeCreativeSpotlightReadSchema);
      if (spotlight.status === 'ready') result.set(id, spotlightDotItems(spotlight.data, uiText));
      else {
        const { data, error } = await client
          .schema('paid_media')
          .from('creative_reports')
          .select('status, report, refreshed_at')
          .eq('brand_id', facts.brandId)
          .maybeSingle();
        if (error) throw new Error(`dot oracle creative: ${error.message}`);
        const report = paidCreativeReportSchema.safeParse(data?.report);
        const status = z
          .enum(['assembling', 'ready', 'empty', 'error'])
          .catch('assembling')
          .parse(data?.status);
        const view = creativeTileState(
          { status, report: report.success ? report.data : null, isLoading: false, isError: false },
          facts.adAccounts,
        );
        result.set(id, view.state === 'ready' ? creativeDotItems(view.spotlight, uiText) : []);
      }
    } else if (id === 'autopilot') {
      const log = await homeRead('reads/overnight-log', homeOvernightLogReadSchema);
      if (log.status === 'ready')
        result.set(id, overnightDotItems(overnightRowsOfRead(log.data.entries), uiText));
      else if (log.status === 'missing' && log.missing.reason === 'no_data') result.set(id, []);
      else {
        const actions: OptimizerActionFeedRow[] = [];
        let before: string | null = null;
        const cursors = new Set<string>();
        for (let page = 0; page < 100; page++) {
          const { data, error } = await client.functions.invoke('optimizer-status', {
            body: { view: 'actions', brand_id: facts.brandId, limit: 50, before, window_days: 7 },
          });
          if (error) throw new Error(`dot oracle actions: ${error.message}`);
          const parsed = OptimizerActionFeedPageSchema.parse(data);
          actions.push(...parsed.actions);
          before = parsed.next_before ?? null;
          if (!needsOlderPage(actions, now, !!before)) break;
          if (!before || cursors.has(before))
            throw new Error('Repeated action cursor; source window not proven');
          cursors.add(before);
          if (page === 99)
            throw new Error('Action-source page budget reached; source window not proven');
        }
        result.set(
          id,
          overnightDotItems(
            overnightRowsOf(
              actionsInWindow(actions, now),
              await portfolios(),
              accountRefsOf(facts.adAccounts),
            ),
            uiText,
          ),
        );
      }
    } else if (id === 'organic') {
      const accounts: CalendarPostAccountsByPlatform = {
        instagram: [],
        facebook: [],
        tiktok: [],
        youtube: [],
        linkedin: [],
      };
      for (const account of facts.organicAccounts) {
        if (account.platform !== 'x')
          accounts[account.platform].push({
            integrationAccountId: account.integrationAccountId,
            name: account.name,
          });
      }
      const range = getWeekRange(organicWeekStart(now));
      const posts = calendarPostsResponseSchema.parse(
        await source.calendar({
          brandId: facts.brandId,
          ...range,
          accountsByPlatform: accounts,
          includeExternal: false,
          forceRefreshExternal: false,
        }),
      ).posts;
      const drafts = await source.get(
        `${apiBase}/api/organic/calendar/drafts?${new URLSearchParams({ brandId: facts.brandId })}`,
      );
      if (drafts.status !== 200) throw new Error(`dot oracle drafts: HTTP ${drafts.status}`);
      result.set(
        id,
        organicDotItems(
          buildOrganicWeek({ now, posts, drafts: draftsResponseSchema.parse(drafts.body).drafts }),
          uiText,
        ),
      );
    }
  }
  return result;
}
