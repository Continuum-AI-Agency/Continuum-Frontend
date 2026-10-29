import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Skeleton, SkeletonText } from './skeleton';
import { MAX_STAGGERED_ROWS, observeRowResolve, ROW_STAGGER_MS } from './use-row-resolve';

// The engine is driven on plain DOM. happy-dom 20 does not deliver mutation records for nodes
// React commits, nor for nodes inserted after observe(), so every tree here is built before the
// engine starts. The skeleton markup is the real component's, and the swap is the
// removeChild + appendChild React performs.
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

type AnimateCall = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
let calls: AnimateCall[] = [];
let teardown: () => void = () => {};
const originalAnimate = HTMLElement.prototype.animate;
const originalMatchMedia = window.matchMedia;

function stubReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

function html(markup: string): Element {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.firstElementChild as Element;
}

const skeletonBar = () => html(renderToStaticMarkup(<Skeleton className="h-4" />));
const skeletonText = () => html(renderToStaticMarkup(<SkeletonText>Spend 4,210</SkeletonText>));

function row(id: string): HTMLElement {
  const el = document.createElement('p');
  el.dataset.testid = id;
  return el;
}

/** A shell root holding one card whose body is a wrapper of skeletons, observed. */
function mountCard({ skip = false, header = false, bones = () => [skeletonBar(), skeletonBar()] } = {}) {
  const root = document.createElement('main');
  const card = document.createElement('section');
  if (skip) card.dataset.rowResolve = 'skip';
  if (header) card.append(skeletonText());
  const body = document.createElement('div');
  body.append(...bones());
  card.append(body);
  root.append(card);
  document.body.append(root);
  teardown = observeRowResolve(root);
  return { root, card, body };
}

function load(body: Element, rows: number) {
  for (const child of [...body.children]) body.removeChild(child);
  for (let i = 0; i < rows; i++) body.appendChild(row(`row-${i}`));
}

const fades = () => calls.filter((call) => 'opacity' in (call.keyframes[0] ?? {}));
const rises = () => calls.filter((call) => 'translate' in (call.keyframes[0] ?? {}));
const ids = (list: AnimateCall[]) => list.map((call) => call.el.getAttribute('data-testid'));

beforeEach(() => {
  calls = [];
  HTMLElement.prototype.animate = function (this: Element, keyframes, options) {
    calls.push({ el: this, keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions });
    return {} as Animation;
  };
  stubReducedMotion(false);
});

afterEach(() => {
  teardown();
  document.body.innerHTML = '';
  HTMLElement.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
});

describe('observeRowResolve', () => {
  it('brings the rows that replaced a skeleton in one after another', async () => {
    const { body } = mountCard();
    load(body, 3);
    await settle();

    expect(ids(fades())).toEqual(['row-0', 'row-1', 'row-2']);
    expect(fades().map((call) => call.options.delay)).toEqual([0, ROW_STAGGER_MS, 2 * ROW_STAGGER_MS]);
    expect(fades()[0].keyframes).toEqual([{ opacity: 0 }, {}]);
    expect(fades().every((call) => call.options.fill === 'backwards')).toBe(true);
  });

  it('rises each row by adding to its own translate, so a positioned row keeps its place', async () => {
    const { body } = mountCard();
    load(body, 3);
    await settle();

    expect(ids(rises())).toEqual(['row-0', 'row-1', 'row-2']);
    expect(rises()[0].keyframes).toEqual([{ translate: '0 4px' }, { translate: '0 0' }]);
    expect(rises().every((call) => call.options.composite === 'add')).toBe(true);
  });

  it('looks through a single-child wrapper to the rows inside it', async () => {
    const { body } = mountCard();
    for (const child of [...body.children]) body.removeChild(child);
    const list = document.createElement('ul');
    list.append(row('row-0'), row('row-1'));
    body.appendChild(list);
    await settle();

    expect(ids(fades())).toEqual(['row-0', 'row-1']);
  });

  it('holds the last delay for rows past the cap, so a long list never waits on its tail', async () => {
    const { body } = mountCard();
    load(body, MAX_STAGGERED_ROWS + 4);
    await settle();

    const delays = fades().map((call) => call.options.delay as number);
    expect(delays).toHaveLength(MAX_STAGGERED_ROWS + 4);
    expect(Math.max(...delays)).toBe((MAX_STAGGERED_ROWS - 1) * ROW_STAGGER_MS);
  });

  it('resolves only the outermost region when nested regions lose skeletons in one frame', async () => {
    const { card, body } = mountCard({ header: true });

    card.removeChild(card.firstElementChild as Element);
    card.prepend(row('title'));
    load(body, 2);
    await settle();

    // The card and its body both lost skeletons: the card's rows resolve, the body's do not.
    expect(ids(fades())).toEqual(['title', null]);
    expect(fades()[1].el).toBe(body);
  });

  it('counts SkeletonText as a skeleton', async () => {
    const { body } = mountCard({ bones: () => [skeletonText()] });
    load(body, 2);
    await settle();
    expect(ids(fades())).toEqual(['row-0', 'row-1']);
  });

  it('ignores removals that are not skeletons', async () => {
    const { body } = mountCard();
    body.appendChild(row('status'));
    body.removeChild(body.lastElementChild as Element);
    await settle();
    expect(calls).toHaveLength(0);
  });

  it('leaves a data-row-resolve="skip" subtree alone', async () => {
    const { body } = mountCard({ skip: true });
    load(body, 3);
    await settle();
    expect(calls).toHaveLength(0);
  });

  it('fades without moving or staggering under reduced motion', async () => {
    stubReducedMotion(true);
    const { body } = mountCard();
    load(body, 3);
    await settle();

    expect(rises()).toHaveLength(0);
    expect(fades().map((call) => call.options.delay)).toEqual([undefined, undefined, undefined]);
  });

  it('stops watching once torn down', async () => {
    const { body } = mountCard();
    teardown();
    load(body, 3);
    await settle();
    expect(calls).toHaveLength(0);
  });
});
