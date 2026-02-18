import * as React from "react";
import { describe, it, expect } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";

import { CardOverlayDemo } from "./card-07";

describe("CardOverlayDemo", () => {
  it("renders creative content and hover-reveal classes", () => {
    const { container } = render(
      <CardOverlayDemo
        title="Creative Catalyst"
        description="A dynamic overlay card"
        imageUrl="https://example.com/image.jpg"
      />
    );

    expect(screen.getByText("Creative Catalyst")).toBeTruthy();
    expect(screen.getByText("A dynamic overlay card")).toBeTruthy();

    const overlayContent = container.querySelector(".group-hover\\:opacity-100");
    expect(overlayContent).toBeTruthy();
  });

  it("updates max width from loaded creative dimensions", () => {
    const { container } = render(
      <CardOverlayDemo
        title="Creative"
        description="Body"
        imageUrl="https://example.com/image.jpg"
      />
    );

    const card = container.querySelector("[data-slot='card']") as HTMLDivElement;
    expect(card.style.maxWidth).toBe("620px");

    const image = screen.getByRole("img") as HTMLImageElement;

    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 360 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 180 });

    fireEvent.load(image);

    expect(card.style.maxWidth).toBe("360px");
  });
});
