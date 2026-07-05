// DOM spec: run with the shared happy-dom setup, e.g.
//   bun test --preload ./bun-test-setup.ts <this file>
// (mirrors AdminUserList.test.tsx / OrganicWorkspaceTabs.test.tsx; the focused
// agent-validate runner does not apply this preload, so run it in the batch).
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render } from "@testing-library/react"

// Mutable route + navigation spy, controlled per test.
let pathnameState = "/scale"
const pushMock = mock((_href: string) => {})

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    prefetch: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  usePathname: () => pathnameState,
  useSearchParams: () => new URLSearchParams(),
}))

mock.module("./CommandPaletteProvider", () => ({
  useCommandPalette: () => ({ open: true, setOpen: () => {} }),
}))

mock.module("@/components/providers/ActiveBrandProvider", () => ({
  useActiveBrandContext: () => ({
    user: null,
    brandSummaries: [],
    permissions: [],
    activeBrandId: "",
    selectBrand: async () => ({}),
    updateBrandName: () => {},
    isSwitching: false,
    switchingToBrandId: null,
  }),
}))

mock.module("@/lib/brands/brand-switcher-utils", () => ({
  isAdminUser: () => false,
}))

// Stub the cmdk/Radix command primitives so happy-dom renders plain elements
// (the real CommandDialog mounts a portal + focus trap we do not need here).
mock.module("@/components/ui/command", () => ({
  CommandDialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  CommandInput: (props: any) => <input {...props} />,
  CommandList: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ heading, children }: any) => (
    <div data-testid="command-group">
      <div>{heading}</div>
      {children}
    </div>
  ),
  CommandItem: ({ children, onSelect }: any) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  CommandSeparator: () => <hr />,
  CommandShortcut: ({ children }: any) => <span>{children}</span>,
}))

mock.module("motion/react", () => ({
  motion: new Proxy(
    {},
    { get: () => ({ children }: any) => <>{children}</> },
  ),
}))

import { CommandPalette } from "./CommandPalette"

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  )
  if (!match) throw new Error(`No command item labeled "${text}"`)
  return match as HTMLButtonElement
}

describe("CommandPalette contextual suggestions", () => {
  beforeEach(() => {
    pushMock.mockReset()
    pathnameState = "/scale"
  })

  afterEach(() => {
    cleanup()
  })

  it("surfaces the Scale action set on the Scale page", () => {
    pathnameState = "/scale"
    const { container } = render(<CommandPalette />)

    expect(container.textContent).toContain("Suggested for this page")
    expect(container.textContent).toContain("Ask Jaina")
    expect(container.textContent).toContain("Analyze ROAS drop")
    expect(container.textContent).toContain("Optimize campaigns")
  })

  it("surfaces the Organic action set on the Organic page", () => {
    pathnameState = "/organic"
    const { container } = render(<CommandPalette />)

    expect(container.textContent).toContain("Suggested for this page")
    expect(container.textContent).toContain("Create reel plan")
    expect(container.textContent).not.toContain("Ask Jaina")
  })

  it("navigates to a suggestion's deep link when selected", () => {
    pathnameState = "/scale"
    const { container } = render(<CommandPalette />)

    fireEvent.click(buttonByText(container, "Ask Jaina"))

    expect(pushMock).toHaveBeenCalledWith("/scale?tab=jaina")
  })

  it("omits the suggestions group on a route with no curated actions", () => {
    pathnameState = "/nowhere"
    const { container } = render(<CommandPalette />)

    expect(container.textContent).not.toContain("Suggested for this page")
    // Baseline groups still render so the palette is never empty.
    expect(container.textContent).toContain("Navigation")
  })
})
