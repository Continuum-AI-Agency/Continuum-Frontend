export const PURCHASE_ACTION_TYPES = new Set([
  "omni_purchase",
  "purchase",
  "offsite_conversion.purchase",
  "onsite_conversion.purchase",
  "onsite_web_purchase",
  "app_custom_event.fb_mobile_purchase",
]);

const PURCHASE_ROAS_ACTION_PRIORITY = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.purchase",
  "onsite_conversion.purchase",
  "onsite_web_purchase",
  "app_custom_event.fb_mobile_purchase",
];

export const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const extractActionMetric = (
  values: unknown,
  actionTypes: Set<string>
): number =>
  asArray(values)
    .map((item) => {
      if (!item || typeof item !== "object") return 0;
      const record = item as Record<string, unknown>;
      const actionType =
        typeof record.action_type === "string" ? record.action_type : "";
      if (!actionTypes.has(actionType)) return 0;
      return toNumber(record.value);
    })
    .reduce((sum, value) => sum + value, 0);

export const extractPurchaseRoas = (value: unknown): number => {
  const direct = toNumber(value);
  if (direct > 0) return direct;

  const rows = asArray(value)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const actionType =
        typeof record.action_type === "string" ? record.action_type : "";
      const numericValue = toNumber(record.value);
      if (numericValue <= 0) return null;
      return { actionType, numericValue };
    })
    .filter((item): item is { actionType: string; numericValue: number } =>
      Boolean(item)
    );

  for (const actionType of PURCHASE_ROAS_ACTION_PRIORITY) {
    const hit = rows.find((row) => row.actionType === actionType);
    if (hit) return hit.numericValue;
  }

  return rows[0]?.numericValue ?? 0;
};

