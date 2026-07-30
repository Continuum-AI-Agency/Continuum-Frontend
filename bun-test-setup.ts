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
global.Event = window.Event as any;
global.CustomEvent = window.CustomEvent as any;
global.MouseEvent = window.MouseEvent as any;
global.KeyboardEvent = window.KeyboardEvent as any;
global.FocusEvent = window.FocusEvent as any;
global.DOMRect = (window as any).DOMRect;
global.sessionStorage = window.sessionStorage as any;
global.localStorage = window.localStorage as any;

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
