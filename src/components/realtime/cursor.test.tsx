import { describe, it, expect } from "bun:test";
import { render } from "@testing-library/react";
import { Cursor } from "./cursor";

describe("Cursor Component", () => {
  it("renders without glow when isLocal is false", () => {
    const { container } = render(
      <Cursor x={100} y={200} color="#FF0000" name="Test User" isLocal={false} />
    );
    
    const wrapper = container.firstChild as HTMLElement;
    const style = wrapper.style.cssText;
    
    expect(style).not.toContain("drop-shadow");
    expect(style).not.toContain("filter");
  });

  it("renders without glow when isLocal is omitted", () => {
    const { container } = render(
      <Cursor x={100} y={200} color="#FF0000" name="Test User" />
    );
    
    const wrapper = container.firstChild as HTMLElement;
    const style = wrapper.style.cssText;
    
    expect(style).not.toContain("drop-shadow");
    expect(style).not.toContain("filter");
  });

  it("renders with glow animation when isLocal is true", () => {
    const { container } = render(
      <Cursor x={100} y={200} color="#FF0000" name="Test User" isLocal={true} />
    );
    
    const wrapper = container.firstChild as HTMLElement;
    const classList = wrapper.className;
    
    expect(classList).toContain("animate-pulse-glow");
  });
});
