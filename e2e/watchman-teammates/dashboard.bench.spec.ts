import { WATCHMAN_DASHBOARD_ROUTE, watchmanDashboardSchema } from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import labels from '../../messages/automations/en.json';
import { experienceUrl, freshExperienceJson, withExperienceBrowser } from './experienceBrowser';
import {
  assertExperienceRoster,
  loadExperiencePlan,
  requireExperienceCase,
  requireExperienceScope,
} from './experiencePlan';
import { watchmanBrowserPreflight } from './preflight';

const config = watchmanBrowserPreflight();
const plan = loadExperiencePlan(config.runId, config.owner);
requireExperienceScope(plan, 'dashboard');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.describe.configure({ mode: 'serial', retries: 0 });

test('real dashboard roster, counts, all roles/status filters and search retain current brand binding', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const fixture = requireExperienceCase(plan, 'dashboard');
  await withExperienceBrowser(
    { browser, info, config, plan, pin: fixture.context },
    async ({ page, dashboard }) => {
      assertExperienceRoster(dashboard, fixture);
      const team = page.locator('[data-watchman-pane="team"]');
      const buttons = team.locator('button[aria-pressed]');
      await expect(buttons).toHaveCount(fixture.teammates.length);
      await expect(
        page.locator('[data-watchman-pane="attention"] button[aria-expanded]'),
      ).toHaveCount(fixture.attention_count);
      await expect(team.locator(':scope > div').first().locator(':scope > div').last()).toHaveText(
        String(fixture.teammates.length),
      );
      for (const row of fixture.teammates) {
        const button = buttons.filter({ has: page.getByText(row.name, { exact: true }) });
        await expect(button).toHaveCount(1);
        await expect(button).toContainText(labels.team[`${row.role}Role`]);
        await expect(button).toContainText(labels.team.lifecycle[row.lifecycle]);
        await expect(button).toContainText(
          `${row.active_work_count} active assignment${row.active_work_count === 1 ? '' : 's'}`,
        );
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-watchman-pane="conversation"]')).toHaveAttribute(
          'aria-label',
          row.name,
        );
        const work = page
          .locator('[data-watchman-pane="attention"] > section')
          .filter({ has: page.getByText(labels.team.work, { exact: true }) });
        const owned = dashboard.work.filter((item) => item.owner_watchman_id === row.id);
        if (owned.length) await expect(work.getByRole('button')).toHaveCount(owned.length);
        else await expect(work.getByText(labels.team.noWork, { exact: true })).toBeVisible();
      }
      for (const role of ['content', 'performance', 'gtm', 'lead'] as const) {
        await team.getByRole('combobox', { name: labels.team.filterRole, exact: true }).click();
        await page.getByRole('option', { name: labels.team[`${role}Role`], exact: true }).click();
        await expect(buttons).toHaveCount(
          fixture.teammates.filter((row) => row.role === role).length,
        );
      }
      await team.getByRole('combobox', { name: labels.team.filterRole, exact: true }).click();
      await page.getByRole('option', { name: labels.team.allRoles, exact: true }).click();
      for (const status of [
        'ready',
        'working',
        'waiting',
        'blocked',
        'paused',
        'failed',
      ] as const) {
        await team.getByRole('combobox', { name: labels.team.filterStatus, exact: true }).click();
        await page
          .getByRole('option', { name: labels.team.lifecycle[status], exact: true })
          .click();
        await expect(buttons).toHaveCount(
          fixture.teammates.filter((row) => row.lifecycle === status).length,
        );
      }
      await team.getByRole('combobox', { name: labels.team.filterStatus, exact: true }).click();
      await page.getByRole('option', { name: labels.team.allStates, exact: true }).click();
      await page
        .getByLabel(labels.team.searchTeammates, { exact: true })
        .fill(`no-native-match:${plan.run_id}`);
      await expect(buttons).toHaveCount(0);
      await expect(team.getByText(labels.team.noMatches, { exact: true })).toBeVisible();
      await page
        .getByLabel(labels.team.searchTeammates, { exact: true })
        .fill(fixture.teammates[0]!.name);
      await expect(buttons).toHaveCount(
        fixture.teammates.filter((row) =>
          `${row.name} ${dashboard.teammates.find((native) => native.profile.id === row.id)?.profile.instructions}`
            .toLocaleLowerCase('en')
            .includes(fixture.teammates[0]!.name.toLocaleLowerCase('en')),
        ).length,
      );
      const restored = watchmanDashboardSchema.parse(
        (
          await freshExperienceJson(
            page,
            config,
            fixture.context,
            experienceUrl(),
            WATCHMAN_DASHBOARD_ROUTE,
          )
        ).body,
      );
      assertExperienceRoster(restored, fixture);
      await expect(team.locator('button[aria-pressed]')).toHaveCount(fixture.teammates.length);
      info.annotations.push({
        type: 'coverage',
        description:
          'Roster/count/filter/search and authenticated response brand binding; no cross-brand authorization or full U2 claim.',
      });
    },
  );
});

test('genuine empty brand shows read-only empty state or guided role/form preview without creating work', async ({
  browser,
}, info) => {
  test.setTimeout(90_000);
  const fixture = requireExperienceCase(plan, 'empty');
  await withExperienceBrowser(
    { browser, info, config, plan, pin: fixture.context },
    async ({ page, dashboard }) => {
      expect(dashboard.teammates).toHaveLength(0);
      expect(dashboard.work).toHaveLength(0);
      expect(dashboard.needs_you).toHaveLength(0);
      expect(dashboard.partial).toBe(false);
      expect(dashboard.can_manage).toBe(fixture.can_manage);
      if (!fixture.can_manage) {
        await expect(page.getByText(labels.team.noTeammates, { exact: true })).toBeVisible();
        await expect(
          page.getByText(labels.team.noTeammatesReadOnly, { exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.getByText(labels.team.chooseRole, { exact: true })).toBeVisible();
        for (const role of ['content', 'performance', 'gtm', 'lead'] as const)
          await expect(
            page
              .getByRole('button')
              .filter({ has: page.getByText(labels.team[`${role}Role`], { exact: true }) }),
          ).toBeVisible();
        await page
          .getByRole('button')
          .filter({ has: page.getByText(labels.team.contentRole, { exact: true }) })
          .click();
        await page.getByRole('button', { name: labels.team.continue, exact: true }).click();
        await expect(page.locator('#teammate-name')).toBeVisible();
        await expect(page.locator('#teammate-brief')).toBeVisible();
        await expect(page.locator('#teammate-first-work')).toBeVisible();
        await expect(
          page.getByRole('button', { name: labels.team.createTeammate, exact: true }),
        ).toBeVisible();
      }
      info.annotations.push({
        type: 'coverage',
        description:
          'PARTIAL onboarding preview only; create/activation/first value/OAuth/human usability UNRUN.',
      });
    },
  );
});

test('real partial dashboard retains genuine rows and exposes the exact unavailable sources', async ({
  browser,
}, info) => {
  test.setTimeout(90_000);
  const fixture = requireExperienceCase(plan, 'partial');
  await withExperienceBrowser(
    { browser, info, config, plan, pin: fixture.context },
    async ({ page, dashboard }) => {
      assertExperienceRoster(dashboard, fixture, true);
      expect([...dashboard.issues].sort((a, b) => a.source.localeCompare(b.source))).toEqual(
        [...fixture.issues].sort((a, b) => a.source.localeCompare(b.source)),
      );
      const banner = page.getByRole('status').filter({ hasText: labels.team.partial });
      await expect(banner).toBeVisible();
      for (const issue of fixture.issues) await expect(banner).toContainText(issue.message);
      await expect(page.locator('[data-watchman-pane="team"] button[aria-pressed]')).toHaveCount(
        fixture.teammates.length,
      );
      info.annotations.push({
        type: 'coverage',
        description:
          'Requires a real dependency/store partial response prepared by the phase owner; no aborted or mocked response creates this fixture.',
      });
    },
  );
});
