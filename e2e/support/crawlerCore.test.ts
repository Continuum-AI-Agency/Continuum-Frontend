import { describe, expect, test } from 'bun:test';
import {
  createRng,
  elementSignature,
  type FenceSubject,
  fenceVerdict,
  formatFailRow,
  hashSeed,
  isJainaComposer,
  l1Signature,
  normalizeSelector,
  parseBaselineSignatures,
  pickByNovelty,
  visualSignature,
} from './crawlerCore';

const ORIGIN = 'http://localhost:3116';

const subject = (overrides: Partial<FenceSubject> = {}): FenceSubject => ({
  tag: 'button',
  role: null,
  type: null,
  name: 'Open detail',
  testId: null,
  href: null,
  target: null,
  download: false,
  inForm: false,
  inDialog: false,
  placeholder: null,
  ...overrides,
});

describe('seeded randomness', () => {
  test('hashSeed is stable for the same parts and distinct across traversals', () => {
    expect(hashSeed(20261009, 'Approvals', 3)).toBe(hashSeed(20261009, 'Approvals', 3));
    expect(hashSeed(20261009, 'Approvals', 3)).not.toBe(hashSeed(20261009, 'Approvals', 4));
    expect(hashSeed(20261009, 'Approvals', 3)).not.toBe(hashSeed(20261009, 'Billing', 3));
  });

  test('createRng replays the same sequence and stays in range', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const ints = Array.from({ length: 200 }, () => createRng(7).int(3));
    expect(new Set(ints).size).toBe(1);
    expect(createRng(9).int(5)).toBeLessThan(5);
    expect(['x', 'y']).toContain(createRng(1).pick(['x', 'y']));
  });
});

describe('the write-safety fence', () => {
  test.each([
    ['Approve', 'approve'],
    ['Apply changes', 'apply'],
    ['Run cycle now', 'run'],
    ['Create portfolio', 'create portfolio'],
    ['Sign out', 'sign out'],
    ['Switch brand', 'switch brand'],
    ['Top up with credit packs', 'top up'],
    ['Export CSV', 'export'],
    ['Send', 'send'],
    ['Unenroll ad set', 'unenroll'],
    ['New conversation', 'new conversation'],
  ])('fences "%s" by name', (name) => {
    const verdict = fenceVerdict(subject({ name }), ORIGIN);
    expect(verdict.fenced).toBe(true);
    if (verdict.fenced) expect(verdict.reason).toContain('name matches the fence');
  });

  test.each([
    ['Choose Performance Plus', 'the plan picker that opened a live Stripe checkout on 2026-10-09'],
    ['Choose Trends+', 'the second plan picker'],
    ['Mark done', 'optimizer_set_renewal_task_status(done) on 2026-10-09'],
    ['Add campaign', 'add'],
    ['Validate', 'validate'],
    ['Generate', 'generate'],
    ['Enable auto-billing', 'enable'],
    ['Edit tags for conversation x', 'edit tags'],
    [
      'Stop',
      'POST /api/agents/jaina/chat/runs/<id>/cancel on a streaming conversation (2026-10-09)',
    ],
    ['Email Continuum Report', 'opens the send dialog'],
  ])('fences "%s" (%s)', (name) => {
    expect(fenceVerdict(subject({ name }), ORIGIN).fenced).toBe(true);
  });

  test('fences an option that commits a role, plan or status', () => {
    const option = (name: string) => subject({ tag: 'div', role: 'option', name });
    expect(fenceVerdict(option('Viewer'), ORIGIN).fenced).toBe(true);
    expect(fenceVerdict(option('admin'), ORIGIN).fenced).toBe(true);
    expect(fenceVerdict(option('Custom range'), ORIGIN).fenced).toBe(false);
    expect(fenceVerdict(option('Last 30 days'), ORIGIN).fenced).toBe(false);
  });

  test('fences switches, checkboxes, radios, selects and options on /settings only', () => {
    const toggle = subject({ tag: 'button', role: 'switch', name: 'Weekly digest' });
    expect(fenceVerdict(toggle, ORIGIN, '/settings?section=notifications').fenced).toBe(true);
    expect(fenceVerdict(toggle, ORIGIN, '/settings').fenced).toBe(true);
    expect(fenceVerdict(toggle, ORIGIN, '/scale/approvals').fenced).toBe(false);
    const box = subject({ tag: 'input', type: 'checkbox', name: 'Select row' });
    expect(fenceVerdict(box, ORIGIN, '/scale/approvals').fenced).toBe(false);
    expect(fenceVerdict(box, ORIGIN, '/settings?section=billing').fenced).toBe(true);
    const select = subject({ tag: 'select', name: 'Language' });
    expect(fenceVerdict(select, ORIGIN, '/settings').fenced).toBe(true);
    const plain = subject({ name: 'Show detail' });
    expect(fenceVerdict(plain, ORIGIN, '/settings').fenced).toBe(false);
  });

  test('fences by test id too, so an icon button with no name is still caught', () => {
    const verdict = fenceVerdict(subject({ name: '', testId: 'approve-action-btn' }), ORIGIN);
    expect(verdict.fenced).toBe(true);
  });

  test('fences a submit button inside a form, even with a harmless name', () => {
    expect(fenceVerdict(subject({ name: 'Go', type: 'submit', inForm: true }), ORIGIN).fenced).toBe(
      true,
    );
    expect(fenceVerdict(subject({ name: 'Go', inForm: true }), ORIGIN).fenced).toBe(true);
    expect(fenceVerdict(subject({ name: 'Go', type: 'button', inForm: true }), ORIGIN).fenced).toBe(
      false,
    );
  });

  test('fences confirmation buttons inside a dialog but lets Cancel and Close through', () => {
    expect(fenceVerdict(subject({ name: 'Continue', inDialog: true }), ORIGIN).fenced).toBe(true);
    expect(fenceVerdict(subject({ name: 'Got it', inDialog: true }), ORIGIN).fenced).toBe(true);
    expect(fenceVerdict(subject({ name: 'Yes, do it', inDialog: true }), ORIGIN).fenced).toBe(true);
    // Cancel is name-fenced since the Jaina Stop/cancel finding; Escape still closes dialogs.
    expect(fenceVerdict(subject({ name: 'Cancel', inDialog: true }), ORIGIN).fenced).toBe(true);
    expect(fenceVerdict(subject({ name: 'Close', inDialog: true }), ORIGIN).fenced).toBe(false);
    expect(fenceVerdict(subject({ name: 'Continue' }), ORIGIN).fenced).toBe(false);
  });

  test('fences native file and color pickers and download links', () => {
    expect(fenceVerdict(subject({ tag: 'input', type: 'file', name: '' }), ORIGIN).fenced).toBe(
      true,
    );
    expect(fenceVerdict(subject({ tag: 'input', type: 'color', name: '' }), ORIGIN).fenced).toBe(
      true,
    );
    expect(fenceVerdict(subject({ tag: 'a', href: '/x.csv', download: true }), ORIGIN).fenced).toBe(
      true,
    );
  });

  test('fences links that leave the origin, the surface, or the session', () => {
    const link = (href: string, target: string | null = null) =>
      fenceVerdict(subject({ tag: 'a', name: 'Go', href, target }), ORIGIN);
    expect(link('https://stripe.com/x').fenced).toBe(true);
    expect(link('/scale', '_blank').fenced).toBe(true);
    expect(link('mailto:x@y.z').fenced).toBe(true);
    expect(link('/forge').fenced).toBe(true);
    expect(link('/organic/planner').fenced).toBe(true);
    expect(link('/logout').fenced).toBe(true);
    expect(link('/api/auth/signout').fenced).toBe(true);
    expect(link('/scale?tab=jaina').fenced).toBe(false);
    expect(link('/settings?section=billing#credits').fenced).toBe(false);
    expect(link('/dashboard').fenced).toBe(false);
    expect(link(`${ORIGIN}/scale/approvals`).fenced).toBe(false);
    expect(link('#').fenced).toBe(false);
  });

  test('a plain control on the surface is not fenced', () => {
    expect(fenceVerdict(subject({ name: 'Show detail' }), ORIGIN)).toEqual({ fenced: false });
    expect(fenceVerdict(subject({ tag: 'input', type: 'text', name: 'Search' }), ORIGIN)).toEqual({
      fenced: false,
    });
  });

  test('recognises the Jaina composer by its placeholder', () => {
    expect(isJainaComposer('Ask Jaina anything…')).toBe(true);
    expect(isJainaComposer("Reply to Jaina's question…")).toBe(true);
    expect(isJainaComposer('Search campaigns')).toBe(false);
    expect(isJainaComposer(null)).toBe(false);
  });
});

describe('signatures', () => {
  test('normalizeSelector strips React useId ids, positions and digits in test ids', () => {
    expect(normalizeSelector('button#base-ui-_r_7_')).toBe('button#base-ui-_r_*_');
    expect(normalizeSelector('button#base-ui-_r_1a_')).toBe('button#base-ui-_r_*_');
    expect(normalizeSelector('p#_r_m_')).toBe('p#_r_*_');
    expect(
      normalizeSelector('ul.mt-2 > li.flex:nth-of-type(2) > span.min-w-0:nth-of-type(2)'),
    ).toBe('ul.mt-2 > li.flex:nth-of-type(n) > span.min-w-0:nth-of-type(n)');
    expect(normalizeSelector('div[data-testid="portfolio-row-3"]')).toBe(
      'div[data-testid="portfolio-row-*"]',
    );
    expect(normalizeSelector('p[data-figure="tiles.spend"]')).toBe('p[data-figure="tiles.spend"]');
  });

  test('visualSignature joins the rule and the normalised selector', () => {
    expect(visualSignature('tap-target', 'button#base-ui-_r_9_')).toBe(
      'tap-target|button#base-ui-_r_*_',
    );
    expect(visualSignature('tap-target', 'button#base-ui-_r_9_')).toBe(
      visualSignature('tap-target', 'button#base-ui-_r_a_'),
    );
  });

  test('a contrast violation keys on its colour pair, whatever selector axe chose', () => {
    const detail = 'color-contrast: 4.23:1 < 4.5:1 (#747881 on #0B1220, 8.2pt (10.875px) normal)';
    expect(visualSignature('contrast', '.mt-3.pt-3.p-1:nth-child(2) > .x', detail)).toBe(
      'contrast|#747881 on #0b1220',
    );
    expect(visualSignature('contrast', '.mt-3[data-sidebar="group"] > .y', detail)).toBe(
      visualSignature('contrast', '.mt-3.pt-3.p-1:nth-child(2) > .x', detail),
    );
    expect(visualSignature('contrast', '#base-ui-_r_7_', 'link-in-text-block: no underline')).toBe(
      'contrast|#base-ui-_r_*_',
    );
  });

  test('l1Signature folds counts, ids and query strings so one class is one key', () => {
    const a = l1Signature(
      'console-errors',
      'console.error Hydration failed because the server rendered HTML did not match (localhost:3116/_next/static/chunks/abc123.js:42) (+51 more)',
    );
    const b = l1Signature(
      'console-errors',
      'console.error Hydration failed because the server rendered HTML did not match (localhost:3116/_next/static/chunks/def456.js:7) (+3 more)',
    );
    expect(a).toBe(b);
    expect(
      l1Signature(
        'server-errors',
        '500 POST nkejqgyushulohxwtytl.supabase.co/functions/v1/rule-actions?x=1',
      ),
    ).toBe(
      l1Signature(
        'server-errors',
        '500 POST nkejqgyushulohxwtytl.supabase.co/functions/v1/rule-actions?x=2',
      ),
    );
    expect(l1Signature('a', 'x')).not.toBe(l1Signature('b', 'x'));
  });

  test('elementSignature names a control by what the user sees, not where it sits', () => {
    expect(
      elementSignature({
        tag: 'button',
        role: null,
        type: null,
        name: 'Open Q4 Leads 2',
        testId: null,
      }),
    ).toBe('button:Open Q# Leads #');
    expect(
      elementSignature({ tag: 'div', role: 'tab', type: null, name: 'Actions', testId: null }),
    ).toBe('tab:Actions');
    expect(
      elementSignature({ tag: 'input', role: null, type: 'search', name: '', testId: null }),
    ).toBe('input:search:(unnamed)');
    expect(
      elementSignature({
        tag: 'button',
        role: null,
        type: null,
        name: 'x',
        testId: 'portfolio-row-12',
      }),
    ).toBe('button:[portfolio-row-*]');
  });
});

describe('the P1.3 baseline', () => {
  const block = [
    '[perfplus-l1v] FINDINGS by rule (surface × viewport × theme × state × selector):',
    '  clipped-text: 2',
    '    - Optimizer/Overview @375 light loaded p[data-figure="tiles.spend"]: "28,972 MXN" scrollHeight 25 > clientHeight 22, clipped (overflow: hidden), no ellipsis [optimizer-overview-375-light-loaded.png]',
    '    - Optimizer/Overview @375 dark loaded p[data-figure="tiles.spend"]: "28,972 MXN" scrollHeight 25 > clientHeight 22 [optimizer-overview-375-dark-loaded.png]',
    '  tap-target: 2',
    '    - Optimizer/Overview @375 light loaded button#base-ui-_r_7_: height 22px < 24px [x.png]',
    '    - Jaina @1280 dark empty button#base-ui-_r_2k_: height 22px < 24px [y.png]',
    '  contrast: 1',
    '    - Optimizer/Overview @375 light loaded #base-ui-_r_7_: color-contrast: 4.41:1 < 4.5:1 (#6c6c7e on #eeecfc, 8.2pt (10.875px) normal) [x.png]',
    '  layout-shift: 1',
    '    - Optimizer/Overview @375 light loaded section[data-testid="portfolio-rows"]: CLS 0.865 > 0.1; largest shifts: section[data-testid="portfolio-rows"] 0.409 [x.png]',
    '{"bench":"perfplus:visual:bench","counts":{"pass":1}}',
  ].join('\n');

  test('parseBaselineSignatures reads rule and selector from each finding line', () => {
    const known = parseBaselineSignatures(block);
    expect(known).toEqual(
      new Set([
        'clipped-text|p[data-figure="tiles.spend"]',
        'tap-target|button#base-ui-_r_*_',
        'contrast|#6c6c7e on #eeecfc',
        'layout-shift|section[data-testid="portfolio-rows"]',
      ]),
    );
  });

  test('a signature the baseline never saw is not in the set', () => {
    const known = parseBaselineSignatures(block);
    expect(known.has(visualSignature('overlap', 'p[data-figure="tiles.spend"]'))).toBe(false);
    expect(known.has(visualSignature('tap-target', 'a.brand-new'))).toBe(false);
  });

  test('an empty or unrelated file yields no signatures', () => {
    expect(parseBaselineSignatures('').size).toBe(0);
    expect(parseBaselineSignatures('[WebServer] ready\nRunning 1 test').size).toBe(0);
  });
});

describe('pickByNovelty', () => {
  const candidates = [
    { signature: 'seen-a', item: 1 },
    { signature: 'seen-b', item: 2 },
    { signature: 'new-c', item: 3 },
  ];

  test('prefers signatures that were never clicked', () => {
    const rng = createRng(123);
    const clicked = new Set(['seen-a', 'seen-b']);
    let novel = 0;
    for (let i = 0; i < 400; i += 1) {
      if (pickByNovelty(rng, candidates, clicked)?.signature === 'new-c') novel += 1;
    }
    // Weight 8 against 1 + 1: ~80% of picks, never all of them.
    expect(novel).toBeGreaterThan(280);
    expect(novel).toBeLessThan(400);
  });

  test('still reaches already-clicked controls and is deterministic per seed', () => {
    const picks = (seed: number) =>
      Array.from(
        { length: 20 },
        () => pickByNovelty(createRng(seed), candidates, new Set())?.signature,
      );
    expect(picks(5)).toEqual(picks(5));
    const rng = createRng(77);
    const seen = new Set(
      Array.from(
        { length: 200 },
        () => pickByNovelty(rng, candidates, new Set(['new-c']))?.signature,
      ),
    );
    expect(seen.has('new-c')).toBe(true);
  });

  test('returns null with nothing to pick', () => {
    expect(pickByNovelty(createRng(1), [], new Set())).toBeNull();
  });
});

describe('formatFailRow', () => {
  test('names every coordinate of the row and the path that led there', () => {
    const line = formatFailRow({
      surface: 'Approvals',
      viewport: 375,
      theme: 'dark',
      seed: 20261009,
      run: 4,
      step: 2,
      invariant: 'console-errors',
      signature: 'console-errors|console.error boom',
      detail: 'console.error boom (x.js:1)',
      path: ['tab:Queue', 'button:Show detail'],
      screenshot: '20261009-3.png',
    });
    expect(line).toBe(
      'Approvals @375 dark seed=20261009 run=4 step=2 console-errors console-errors|console.error boom: console.error boom (x.js:1) — path: tab:Queue → button:Show detail [20261009-3.png]',
    );
  });
});
