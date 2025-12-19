import { expect, test } from "bun:test";

import { createIntegrationSelectionToastOptions } from "@/lib/ui/integrationSelectionToast";

test("integration selection toast uses success for tagging and info for untagging", () => {
  expect(createIntegrationSelectionToastOptions({ checked: true }).variant).toBe("success");
  expect(createIntegrationSelectionToastOptions({ checked: false }).variant).toBe("info");
});

test("integration selection toast uses singular title and label description", () => {
  const toast = createIntegrationSelectionToastOptions({ checked: true, label: "Acme IG" });
  expect(toast.title).toBe("Tagged integration");
  expect(toast.description).toBe("Acme IG");
});

test("integration selection toast uses plural title without description", () => {
  const toast = createIntegrationSelectionToastOptions({ checked: false, count: 3, label: "Ignored" });
  expect(toast.title).toBe("Untagged 3 integrations");
  expect(toast.description).toBeUndefined();
});

