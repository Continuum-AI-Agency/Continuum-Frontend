import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

;(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError = SyntaxError

// Stub the dropdown menu so items become plain clickable buttons (portals/
// animation don't run; onSelect is reachable by visible text).
mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect, disabled }: { children: ReactNode; onSelect?: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))

afterAll(() => mock.restore())

import { PostCommandMenu } from "./PostCommandMenu"

describe("PostCommandMenu", () => {
  beforeEach(() => cleanup())

  it("fires the editor-open callbacks", () => {
    const onEditCreativeDirection = mock()
    const onEditHashtags = mock()
    render(
      <PostCommandMenu
        onEditCreativeDirection={onEditCreativeDirection}
        onEditHashtags={onEditHashtags}
        onDelete={mock()}
      />,
    )
    fireEvent.click(screen.getByText("Creative direction"))
    expect(onEditCreativeDirection).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText("Hashtags"))
    expect(onEditHashtags).toHaveBeenCalledTimes(1)
  })

  it("fires delete", () => {
    const onDelete = mock()
    render(<PostCommandMenu onEditCreativeDirection={mock()} onEditHashtags={mock()} onDelete={onDelete} />)
    fireEvent.click(screen.getByText("Delete draft"))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it("disables Approve & schedule when not schedulable", () => {
    render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onApproveSchedule={mock()}
        canSchedule={false}
        onDelete={mock()}
      />,
    )
    const approve = screen.getByText("Approve & schedule").closest("button") as HTMLButtonElement
    expect(approve.disabled).toBe(true)
  })

  it("hides Publish unless canPublish", () => {
    const { rerender } = render(
      <PostCommandMenu onEditCreativeDirection={mock()} onEditHashtags={mock()} onDelete={mock()} />,
    )
    expect(screen.queryByText("Publish to Instagram")).toBeNull()

    const onPublish = mock()
    rerender(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onDelete={mock()}
        canPublish
        onPublish={onPublish}
      />,
    )
    fireEvent.click(screen.getByText("Publish to Instagram"))
    expect(onPublish).toHaveBeenCalledTimes(1)
  })
})
