import { describe, expect, it } from 'bun:test';

import {
  APP_NAVIGATION,
  APP_NAVIGATION_FOOTER,
  APP_NAVIGATION_GROUPS,
  getContextualSuggestions,
  isRouteActive,
} from './routes';

function params(query = ''): URLSearchParams {
  return new URLSearchParams(query);
}

describe('navigation structure', () => {
  it('keeps a flat list of navigable areas for breadcrumb + command palette', () => {
    expect(APP_NAVIGATION.map((i) => i.label)).toEqual([
      'Home',
      'Canvas',
      'Automations',
      'Organic +',
      'Performance +',
      'Library',
      'Brand Spy',
      'Forge',
    ]);
    expect(APP_NAVIGATION.map((i) => i.href)).toEqual([
      '/dashboard',
      '/ai-studio',
      '/automations',
      '/organic',
      '/scale',
      '/library',
      '/competitor-spy',
      '/forge',
    ]);
  });

  // The sidebar is the three PRODUCTS, named the way they are sold. "Scale",
  // "Intelligence" and "Storage" were internal words that appeared nowhere in a
  // customer's head, and every destination now belongs to exactly one product.
  it('groups the sidebar into the three products', () => {
    expect(APP_NAVIGATION_GROUPS.map((g) => g.label)).toEqual([
      null,
      'Organic +',
      'Performance +',
      'Creative +',
    ]);
  });

  it('gives every destination exactly one product, with nothing orphaned', () => {
    const grouped = APP_NAVIGATION_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const href of ['/ai-studio', '/library', '/competitor-spy', '/forge']) {
      expect(grouped).toContain(href);
    }
  });

  it('keeps Goals out of the global sidebar lead group', () => {
    const lead = APP_NAVIGATION_GROUPS[0];
    expect(lead.label).toBeNull();
    // Canvas moved into Creative +; the lead group is what is not a product.
    expect(lead.items.map((i) => i.href)).toEqual(['/dashboard', '/automations']);
    expect(
      APP_NAVIGATION_GROUPS.flatMap((group) => group.items).some((i) => i.href === '/goals'),
    ).toBe(false);
  });

  it('nests Organic sub-routes with area-qualified labels', () => {
    const organic = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Organic +');
    expect(organic?.items.map((i) => i.label)).toEqual([
      'Organic Agent',
      'Organic Analytics',
      'Calendar',
    ]);
    expect(organic?.items.map((i) => i.href)).toEqual([
      '/organic?tab=agent',
      '/organic?tab=metrics',
      '/organic?tab=planner',
    ]);
  });

  it('nests Scale sub-routes as Jaina / Paid Analytics / Paid Optimization', () => {
    const scale = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Performance +');
    expect(scale?.items.map((i) => i.label)).toEqual([
      'Jaina',
      'Paid Analytics',
      'Paid Optimization',
    ]);
    expect(scale?.items.map((i) => i.href)).toEqual([
      '/scale?tab=jaina',
      '/scale?tab=dashboard',
      '/scale?tab=performance',
    ]);
  });

  it('disambiguates the Agent and Analytics sub-labels across Organic and Scale', () => {
    const organic = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Organic');
    const scale = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Scale');
    const organicLabels = organic?.items.map((i) => i.label) ?? [];
    const scaleLabels = scale?.items.map((i) => i.label) ?? [];

    // No bare "Agent"/"Analytics" survives, and no label is shared across areas.
    for (const label of [...organicLabels, ...scaleLabels]) {
      expect(label).not.toBe('Agent');
      expect(label).not.toBe('Analytics');
    }
    expect(organicLabels.some((label) => scaleLabels.includes(label))).toBe(false);
  });

  // Library, Canvas, Brand Spy and Forge are ONE product now. Library was its own
  // "Storage" section and Brand Spy its own "Intelligence" one; both were internal
  // words, and neither is a thing a customer buys.
  it('gathers the creative surface under Creative +', () => {
    const creative = APP_NAVIGATION_GROUPS.find((g) => g.label === 'Creative +');
    expect(creative?.items.map((i) => i.label)).toEqual([
      'Canvas',
      'Library',
      'Brand Spy',
      'Forge',
    ]);
    expect(creative?.items.map((i) => i.href)).toEqual([
      '/ai-studio',
      '/library',
      '/competitor-spy',
      '/forge',
    ]);
  });

  it('has no section named after an internal area', () => {
    const labels = APP_NAVIGATION_GROUPS.map((g) => g.label);
    for (const internal of ['Scale', 'Intelligence', 'Storage', 'Organic']) {
      expect(labels).not.toContain(internal);
    }
  });

  it('exposes Forge as a real destination, not the old locked placeholder', () => {
    const forge = APP_NAVIGATION_GROUPS.flatMap((g) => g.items).find((i) => i.label === 'Forge');
    expect(forge).toBeDefined();
    expect(forge!.href).toBe('/forge');
    // It replaced the `Developers` placeholder, which was disabled+locked with no route behind
    // it. Forge has a route, so it must NOT be inert — a link that goes nowhere is the thing
    // BUG-009 was about.
    expect(forge!.disabled).toBeUndefined();
    expect(forge!.locked).toBeUndefined();
    // Tier 3 is enforced at the page (TierAccessRedirect) and on the server
    // (assertTemplateForgeTier), the same shape /ai-studio and /scale use.
    expect(
      APP_NAVIGATION_GROUPS.flatMap((g) => g.items).find((i) => i.label === 'Developers'),
    ).toBeUndefined();
  });

  it('footer is Settings + admin-gated Admin', () => {
    expect(APP_NAVIGATION_FOOTER.map((i) => i.label)).toEqual(['Settings', 'Admin']);
    expect(APP_NAVIGATION_FOOTER.find((i) => i.label === 'Admin')?.adminOnly).toBe(true);
  });

  it('carries no Beta badge anywhere', () => {
    expect(APP_NAVIGATION.every((i) => i.badge?.label !== 'Beta')).toBe(true);
  });
});

describe('isRouteActive', () => {
  it('matches Home only on exact /dashboard', () => {
    expect(isRouteActive('/dashboard', params(), { href: '/dashboard' })).toBe(true);
    expect(isRouteActive('/dashboard/x', params(), { href: '/dashboard' })).toBe(false);
  });

  it('matches /scale as a parent prefix', () => {
    expect(isRouteActive('/scale', params(), { href: '/scale' })).toBe(true);
    expect(isRouteActive('/scale/approvals', params(), { href: '/scale' })).toBe(true);
    expect(isRouteActive('/scaled', params(), { href: '/scale' })).toBe(false);
  });

  it('matches query-bearing sub-routes only when every param matches', () => {
    expect(
      isRouteActive('/scale', params('tab=performance'), { href: '/scale?tab=performance' }),
    ).toBe(true);
    expect(
      isRouteActive('/scale', params('tab=dashboard'), { href: '/scale?tab=performance' }),
    ).toBe(false);
    expect(isRouteActive('/organic', params('tab=metrics'), { href: '/organic?tab=metrics' })).toBe(
      true,
    );
    expect(isRouteActive('/scale', params(), { href: '/scale?tab=jaina' })).toBe(false);
  });
});

describe('getContextualSuggestions', () => {
  it('offers Scale-specific actions on /scale', () => {
    const labels = getContextualSuggestions('/scale').map((s) => s.label);
    expect(labels).toEqual(['Ask Jaina', 'Analyze ROAS drop', 'Optimize campaigns']);
  });

  it('offers Organic-specific actions on /organic', () => {
    const labels = getContextualSuggestions('/organic').map((s) => s.label);
    expect(labels).toContain('Create reel plan');
    expect(labels).toContain('Ask the Organic Agent');
  });

  it('inherits the area set on a nested sub-path via longest-prefix match', () => {
    expect(getContextualSuggestions('/scale/approvals').map((s) => s.label)).toEqual(
      getContextualSuggestions('/scale').map((s) => s.label),
    );
  });

  it('returns no suggestions for an unmapped route', () => {
    expect(getContextualSuggestions('/nowhere')).toEqual([]);
  });

  it('only points suggestions at real navigable hrefs', () => {
    const hrefs = getContextualSuggestions('/dashboard').map((s) => s.href);
    for (const href of hrefs) {
      expect(href.startsWith('/')).toBe(true);
    }
  });
});
