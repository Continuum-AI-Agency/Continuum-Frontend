import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { TextareaHTMLAttributes } from "react"

;(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError = SyntaxError

mock.module("@/components/ui/textarea", () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}))

afterAll(() => mock.restore())

import { EditableCaption } from "./EditableCaption"

describe("EditableCaption", () => {
  beforeEach(() => cleanup())

  it("renders read-only text and switches to an editable field on click", () => {
    render(<EditableCaption value="Hello world" onChange={mock()} platform="instagram" />)
    const read = screen.getByLabelText("Edit caption")
    expect(read.tagName).toBe("BUTTON")
    expect(read.textContent).toContain("Hello world")
    fireEvent.click(read)
    expect(screen.getByLabelText("Caption").tagName).toBe("TEXTAREA")
  })

  it("shows the placeholder + an add affordance when empty", () => {
    render(<EditableCaption value="" onChange={mock()} platform="instagram" placeholder="Write a caption…" />)
    const read = screen.getByLabelText("Add a caption")
    expect(read.textContent).toContain("Write a caption…")
  })

  it("emits onChange as the user edits in place", () => {
    const onChange = mock()
    render(<EditableCaption value="Hi" onChange={onChange} platform="instagram" />)
    fireEvent.click(screen.getByLabelText("Edit caption"))
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Hi there" } })
    expect(onChange).toHaveBeenCalledWith("Hi there")
  })

  it("returns to read mode on blur", () => {
    render(<EditableCaption value="Hi" onChange={mock()} platform="instagram" />)
    fireEvent.click(screen.getByLabelText("Edit caption"))
    const field = screen.getByLabelText("Caption")
    fireEvent.blur(field)
    expect(screen.getByLabelText("Edit caption").tagName).toBe("BUTTON")
  })
})
