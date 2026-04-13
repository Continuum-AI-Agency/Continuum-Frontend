import { describe, expect, test } from "bun:test";
import { formatValue } from "./formatValue";

describe("formatValue", () => {
  test("currency formats with dollar sign", () => {
    expect(formatValue(12450, "currency")).toBe("$12,450.00");
  });

  test("currency respects custom currency code", () => {
    expect(formatValue(1000, "currency", { currency: "EUR" })).toBe("€1,000.00");
  });

  test("percent formats values >= 1 as already-percentage", () => {
    expect(formatValue(8.2, "percent")).toBe("8.2%");
  });

  test("percent formats values < 1 as decimal ratio", () => {
    expect(formatValue(0.082, "percent")).toBe("8.2%");
  });

  test("multiplier appends x suffix", () => {
    expect(formatValue(3.8, "multiplier")).toBe("3.8x");
  });

  test("number formats with commas and 2 decimals max", () => {
    expect(formatValue(12450.567, "number")).toBe("12,450.57");
  });

  test("integer drops fractional digits", () => {
    expect(formatValue(12450.9, "integer")).toBe("12,451");
  });

  test("compact abbreviates large numbers", () => {
    expect(formatValue(1200000, "compact")).toBe("1.2M");
  });

  test("text returns string representation", () => {
    expect(formatValue(42, "text")).toBe("42");
    expect(formatValue("hello", "text")).toBe("hello");
  });

  test("string value without format returns as-is", () => {
    expect(formatValue("Brand Awareness Q1")).toBe("Brand Awareness Q1");
  });

  test("numeric string with format parses and formats", () => {
    expect(formatValue("12450", "currency")).toBe("$12,450.00");
  });

  test("NaN input returns string representation", () => {
    expect(formatValue("not-a-number", "currency")).toBe("not-a-number");
  });

  test("default format for numbers uses locale formatting", () => {
    expect(formatValue(12450)).toBe("12,450");
  });
});
