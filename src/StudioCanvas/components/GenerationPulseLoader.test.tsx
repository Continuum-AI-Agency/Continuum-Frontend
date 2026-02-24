import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { GenerationPulseLoader } from "./GenerationPulseLoader";

describe("GenerationPulseLoader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders pulsing circle status", () => {
    render(<GenerationPulseLoader />);
    expect(screen.getByRole("status", { name: "Generating media" })).toBeTruthy();
  });
});

