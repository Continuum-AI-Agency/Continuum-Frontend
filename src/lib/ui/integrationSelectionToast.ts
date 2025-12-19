import type { ToastOptions } from "@/components/ui/ToastProvider";

type IntegrationSelectionToastParams = {
  checked: boolean;
  label?: string | null;
  count?: number;
};

export function createIntegrationSelectionToastOptions(
  params: IntegrationSelectionToastParams
): ToastOptions {
  const { checked, label, count } = params;
  const verb = checked ? "Tagged" : "Untagged";
  const variant = checked ? "success" : "info";
  const hasCount = typeof count === "number" && count > 1;
  const title = hasCount ? `${verb} ${count} integrations` : `${verb} integration`;
  const description = !hasCount && label ? label : undefined;

  return { title, description, variant };
}

