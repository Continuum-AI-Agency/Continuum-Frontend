import { mock } from 'bun:test';
import { Window } from 'happy-dom';

// Mock server-only to allow testing components that import server files
mock.module('server-only', () => {
  return {};
});

const window = new Window({
  url: 'http://localhost:3000',
  width: 1024,
  height: 768,
});

global.window = window as any;
global.document = window.document as any;
global.navigator = window.navigator as any;
// Base Element/SVGElement globals: motion-dom does `instanceof Element` during
// animation measurement, so without these a `ReferenceError: Element is not
// defined` leaks out of the frameloop and fails unrelated specs.
global.Element = window.Element as any;
global.SVGElement = window.SVGElement as any;
global.HTMLElement = window.HTMLElement as any;
global.HTMLFormElement = window.HTMLFormElement as any;
global.HTMLInputElement = window.HTMLInputElement as any;
global.HTMLTextAreaElement = window.HTMLTextAreaElement as any;
global.FileReader = window.FileReader as any;
// Add DocumentFragment which was missing
global.DocumentFragment = window.DocumentFragment as any;
global.Node = window.Node as any;
// Radix focus-scopes (Popover, Dialog, DropdownMenu) walk the DOM with a
// TreeWalker on open, so NodeFilter must be global or opening one throws.
global.NodeFilter = window.NodeFilter as any;
// Base UI's open/close transitions wait for `[data-starting-style]` to be removed, which
// they watch with a MutationObserver. happy-dom ships a real one; it simply was never
// lifted onto the global, so the first component to reach that step threw.
global.MutationObserver = window.MutationObserver as any;
global.Event = window.Event as any;
global.CustomEvent = window.CustomEvent as any;
global.MouseEvent = window.MouseEvent as any;
global.KeyboardEvent = window.KeyboardEvent as any;
global.FocusEvent = window.FocusEvent as any;
global.DOMRect = (window as any).DOMRect;
global.sessionStorage = window.sessionStorage as any;
global.localStorage = window.localStorage as any;

// happy-dom rejects a cancelled animation's `finished` promise, and motion-dom cancels one
// for every element that unmounts mid-animation without ever reading `finished`. The rejection
// surfaces as an unhandled AbortError and fails whichever spec did the unmounting — the toast
// specs, where dismissing a toast IS the assertion. Marking it handled changes no behaviour:
// nothing in the app awaits `finished` either.
{
  const animation = (window as unknown as { Animation?: { prototype: Animation } }).Animation;
  const cancel = animation?.prototype?.cancel;
  if (animation && cancel) {
    animation.prototype.cancel = function cancelWithHandledFinished(this: Animation): void {
      this.finished?.catch(() => undefined);
      cancel.call(this);
    };
  }
}

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (handle: number): void => {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  };
}

if (typeof globalThis.getComputedStyle !== 'function') {
  globalThis.getComputedStyle = ((): CSSStyleDeclaration => {
    return { getPropertyValue: () => '' } as unknown as CSSStyleDeclaration;
  }) as typeof globalThis.getComputedStyle;
}

// happy-dom ships no ResizeObserver, and anything that measures itself on mount — cmdk
// (the command palette), the shadcn chart container, Base UI's positioner — constructs one
// during render. Without it the component throws before a single assertion runs, which
// reads as a broken component rather than a missing browser API. Inert on purpose: these
// suites assert behaviour, never layout, so a recording no-op is the whole contract.
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// The rest of what happy-dom does not ship, for the same reason ResizeObserver is above.
//
// These used to arrive by ACCIDENT. Bun ran every file in ONE process, so whichever test
// installed `IntersectionObserver` or `scrollIntoView` first handed it to every file after
// it. Running the files isolated removed that leak, and ~27 tests that had never installed
// them went red at once — not defects, just a suite that had been leaning on its own file
// ordering. They belong here, in the preload every file gets in every worker.
//
// Each answers the way an absent feature truthfully would: no observations, no animations,
// no media match, no scrolling. A suite that needs real behaviour still stubs its own.
if (typeof globalThis.IntersectionObserver !== 'function') {
  globalThis.IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  } as unknown as typeof globalThis.IntersectionObserver;
}

const defineOnElement = (key: string, value: unknown): void => {
  if (typeof Element === 'undefined' || key in Element.prototype) return;
  Object.defineProperty(Element.prototype, key, { configurable: true, writable: true, value });
};

// Scrolling is a no-op in a document with no viewport; callers use it only for effect.
defineOnElement('scrollIntoView', () => {});
// Base UI's scroll area settles its thumb by awaiting subtree animations.
defineOnElement('getAnimations', () => []);

if (typeof globalThis.window !== 'undefined' && !('matchMedia' in globalThis.window)) {
  Object.defineProperty(globalThis.window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

mock.module('next/navigation', () => {
  return {
    useRouter: () => ({
      push: () => {},
      replace: () => {},
      prefetch: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
    }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '',
    useSelectedLayoutSegment: () => null,
    useSelectedLayoutSegments: () => [],
    redirect: (url: string) => {
      console.log(`Redirecting to ${url}`);
    },
    notFound: () => {
      console.log('Not found');
    },
  };
});

mock.module('@/components/theme-provider', () => {
  return {
    useTheme: () => ({
      mode: 'light',
      appearance: 'light',
      setMode: () => {},
      toggle: () => {},
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});
