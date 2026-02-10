import { Window } from 'happy-dom';
import { mock } from "bun:test";

// Mock server-only to allow testing components that import server files
mock.module("server-only", () => {
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
global.HTMLElement = window.HTMLElement as any;
global.HTMLInputElement = window.HTMLInputElement as any;
global.HTMLTextAreaElement = window.HTMLTextAreaElement as any;
// Add DocumentFragment which was missing
global.DocumentFragment = window.DocumentFragment as any;
global.Node = window.Node as any;
global.Event = window.Event as any;
global.CustomEvent = window.CustomEvent as any;
global.MouseEvent = window.MouseEvent as any;
global.KeyboardEvent = window.KeyboardEvent as any;
global.FocusEvent = window.FocusEvent as any;
global.DOMRect = (window as any).DOMRect;
global.sessionStorage = window.sessionStorage as any;
global.localStorage = window.localStorage as any;

mock.module("next/navigation", () => {
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
    usePathname: () => "",
    useSelectedLayoutSegment: () => null,
    useSelectedLayoutSegments: () => [],
    redirect: (url: string) => {
      console.log(`Redirecting to ${url}`);
    },
    notFound: () => {
      console.log("Not found");
    },
  };
});

mock.module("@/components/theme-provider", () => {
  return {
    useTheme: () => ({
      mode: "light",
      appearance: "light",
      setMode: () => {},
      toggle: () => {},
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});
