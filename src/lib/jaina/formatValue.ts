export type ValueFormat =
  | "currency"
  | "percent"
  | "multiplier"
  | "number"
  | "integer"
  | "compact"
  | "text"
  | (string & {});

type FormatOptions = {
  currency?: string;
  locale?: string;
};

export function formatValue(
  value: string | number,
  format?: ValueFormat | string,
  options?: FormatOptions,
): string {
  const locale = options?.locale ?? "en-US";

  if (typeof value === "string" && !format) return value;

  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return String(value);

  switch (format) {
    case "currency":
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: options?.currency ?? "USD",
        maximumFractionDigits: 2,
      }).format(num);

    case "percent":
      return new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(num < 1 && num > -1 ? num : num / 100);

    case "multiplier":
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(num)}x`;

    case "number":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(num);

    case "integer":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(num);

    case "compact":
      return new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(num);

    case "text":
      return String(value);

    default:
      return typeof value === "number"
        ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(num)
        : String(value);
  }
}
