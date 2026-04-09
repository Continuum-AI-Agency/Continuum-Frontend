import { describe, expect, it, afterEach, mock } from "bun:test"
import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ReactNode } from "react"

import type { CalendarToolbar as CalendarToolbarType } from "./CalendarToolbar"

type CalendarToolbarProps = Parameters<typeof CalendarToolbarType>[0]

// Patch happy-dom window with missing globals that SelectorParser needs
Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
})

mock.module("@radix-ui/react-icons", () => ({
  CheckIcon: () => <span data-testid="check-icon" />,
  Cross2Icon: () => <span data-testid="cross-icon" />,
  ExclamationTriangleIcon: () => <span data-testid="warning-icon" />,
  LightningBoltIcon: () => <span data-testid="lightning-icon" />,
  PlusIcon: () => <span data-testid="plus-icon" />,
  RocketIcon: () => <span data-testid="rocket-icon" />,
  TrashIcon: () => <span data-testid="trash-icon" />,
}))

mock.module("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    "aria-label": ariaLabel,
    "aria-pressed": ariaPressed,
  }: {
    children?: ReactNode
    disabled?: boolean
    onClick?: () => void
    "aria-label"?: string
    "aria-pressed"?: boolean
  }) => (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  ),
}))

mock.module("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

mock.module("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ show: mock() }),
  useToastContext: () => ({ show: mock() }),
}))

mock.module("@/components/ui/progress", () => ({
  Progress: ({ value }: { value?: number }) => (
    <div data-testid="progress" data-value={value} />
  ),
}))

mock.module("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({
    children,
    onSelect,
    disabled,
    className,
  }: {
    children: ReactNode
    onSelect?: () => void
    disabled?: boolean
    className?: string
  }) => (
    <button className={className} disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))

const { CalendarToolbar } = await import("./CalendarToolbar")

function defaultProps(
  overrides?: Partial<CalendarToolbarProps>,
): CalendarToolbarProps {
  return {
    viewMode: "week",
    onViewModeChange: mock(),
    selectedTrendCount: 2,
    maxTrendSelections: 5,
    seededDraftCount: 3,
    isGenerating: false,
    onOpenTrends: mock(),
    onAddPlaceholder: mock(),
    onGenerate: mock(),
    onClear: mock(),
    draftsCount: 5,
    slotProgress: null,
    gridProgress: { percent: 0 },
    gridStatus: "idle",
    gridError: null,
    ...overrides,
  }
}

afterEach(() => cleanup())

describe("CalendarToolbar", () => {
  it("renders view mode buttons for Week, Month, and List", () => {
    const { container } = render(<CalendarToolbar {...defaultProps()} />)

    const buttons = container.querySelectorAll("button")
    const labels = Array.from(buttons).map((b) => b.textContent?.trim())

    expect(labels).toContain("Week")
    expect(labels).toContain("Month")
    expect(labels).toContain("List")
  })

  it("sets aria-pressed on the active view mode button", () => {
    const { container } = render(
      <CalendarToolbar {...defaultProps({ viewMode: "month" })} />,
    )

    const buttons = Array.from(container.querySelectorAll("button[aria-pressed]"))
    const weekButton = buttons.find((b) => b.textContent?.trim() === "Week")!
    const monthButton = buttons.find((b) => b.textContent?.trim() === "Month")!
    const listButton = buttons.find((b) => b.textContent?.trim() === "List")!

    expect(monthButton.getAttribute("aria-pressed")).toBe("true")
    expect(weekButton.getAttribute("aria-pressed")).toBe("false")
    expect(listButton.getAttribute("aria-pressed")).toBe("false")
  })

  it("calls onViewModeChange when a view mode button is clicked", () => {
    const onViewModeChange = mock()
    const { container } = render(
      <CalendarToolbar {...defaultProps({ onViewModeChange })} />,
    )

    const buttons = Array.from(container.querySelectorAll("button[aria-pressed]"))
    const monthButton = buttons.find((b) => b.textContent?.trim() === "Month")!
    fireEvent.click(monthButton)

    expect(onViewModeChange).toHaveBeenCalledWith("month")
  })

  it("renders progress bar when slotProgress is provided", () => {
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          slotProgress: { completed: 3, total: 10, failed: 0 },
          gridProgress: { percent: 30 },
        })}
      />,
    )

    expect(container.querySelector("[data-testid='progress']")).toBeTruthy()
    expect(container.textContent).toContain("3/10 completed")
  })

  it("renders status banner for gridStatus=complete", () => {
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          gridStatus: "complete",
          slotProgress: { completed: 7, total: 7, failed: 0 },
        })}
      />,
    )

    expect(container.textContent).toContain("All 7 posts generated")
  })

  it("renders status banner for gridStatus=error with retry text", () => {
    const onRetryGeneration = mock()
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          gridStatus: "error",
          gridError: "Network timeout",
          onRetryGeneration,
        })}
      />,
    )

    expect(container.textContent).toContain("Generation failed: Network timeout")
    expect(container.textContent).toContain("retry")
  })

  it("disables the generate button when seededDraftCount is 0", () => {
    const { container } = render(
      <CalendarToolbar {...defaultProps({ seededDraftCount: 0 })} />,
    )

    const buttons = Array.from(container.querySelectorAll("button"))
    const generateButton = buttons.find(
      (b) => b.textContent?.trim() === "Generate",
    )

    expect(generateButton).toBeTruthy()
    expect(generateButton!.disabled).toBe(true)
  })
})
