import { beforeEach, expect, test, vi } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type CapturedItem = {
  label: string;
  props: Record<string, unknown>;
};

const captured = {
  buttons: [] as Array<Record<string, unknown>>,
  switches: [] as Array<Record<string, unknown>>,
  items: [] as CapturedItem[],
};

function extractText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (React.isValidElement(node)) return extractText(node.props.children);
  return "";
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

let routerPushSpy = vi.fn<(path: string) => void>();
let logoutSpy = vi.fn<() => void>();
let selectBrandSpy = vi.fn<(brandId: string) => void>();
let toggleSpy = vi.fn<(checked: boolean) => void>();
let createBrandProfileActionSpy = vi.fn<() => Promise<void>>();

let sessionUser: unknown = { app_metadata: { roles: [] } };
let themeAppearance: "light" | "dark" = "light";
let activeBrandId = "brand-1";
let brandSummaries = [
  { id: "brand-1", name: "First ever", completed: true },
  { id: "brand-2", name: "Pizza Test", completed: true },
];

vi.mock("@radix-ui/react-icons", () => {
  const Icon = () => React.createElement("span", { "data-icon": "icon" });
  return {
    CheckCircledIcon: Icon,
    ExitIcon: Icon,
    GearIcon: Icon,
    LayersIcon: Icon,
    MixerHorizontalIcon: Icon,
    MoonIcon: Icon,
    PlusCircledIcon: Icon,
  };
});

vi.mock("@radix-ui/themes", () => {
  function Button(props: Record<string, unknown>) {
    captured.buttons.push(props);
    return React.createElement("button", props, props.children);
  }

  function Avatar(props: Record<string, unknown>) {
    return React.createElement("span", { "data-avatar": true }, props.fallback ?? null);
  }

  function Switch(props: Record<string, unknown>) {
    captured.switches.push(props);
    return React.createElement("button", { "data-switch": true });
  }

  function Text(props: Record<string, unknown>) {
    return React.createElement("span", props, props.children);
  }

  function Root(props: Record<string, unknown>) {
    return React.createElement("div", { "data-dropdown-root": true }, props.children);
  }

  function Trigger(props: Record<string, unknown>) {
    return React.createElement(React.Fragment, null, props.children);
  }

  function Content(props: Record<string, unknown>) {
    return React.createElement("div", { "data-dropdown-content": true }, props.children);
  }

  function Item(props: Record<string, unknown>) {
    captured.items.push({
      label: normalizeLabel(extractText(props.children)),
      props,
    });
    return React.createElement("div", { "data-dropdown-item": true }, props.children);
  }

  function Separator() {
    return React.createElement("hr", { "data-dropdown-separator": true });
  }

  return {
    Avatar,
    Button,
    DropdownMenu: {
      Root,
      Trigger,
      Content,
      Item,
      Separator,
    },
    Switch,
    Text,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushSpy }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ logout: logoutSpy, isPending: false }),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ user: sessionUser }),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ appearance: themeAppearance, toggle: toggleSpy }),
}));

vi.mock("@/components/providers/ActiveBrandProvider", () => ({
  useActiveBrandContext: () => ({
    activeBrandId,
    brandSummaries,
    isSwitching: false,
    selectBrand: selectBrandSpy,
  }),
}));

vi.mock("@/app/(post-auth)/settings/actions", () => ({
  createBrandProfileAction: () => createBrandProfileActionSpy(),
}));

async function renderBrandSwitcherMenu(props?: { triggerId?: string }) {
  const { BrandSwitcherMenu } = await import("@/components/navigation/BrandSwitcherMenu");
  return renderToStaticMarkup(<BrandSwitcherMenu {...props} />);
}

beforeEach(() => {
  captured.buttons.length = 0;
  captured.switches.length = 0;
  captured.items.length = 0;

  routerPushSpy.mockReset();
  logoutSpy.mockReset();
  selectBrandSpy.mockReset();
  toggleSpy.mockReset();
  createBrandProfileActionSpy.mockReset();

  sessionUser = { app_metadata: { roles: [] } };
  themeAppearance = "light";
  activeBrandId = "brand-1";
  brandSummaries = [
    { id: "brand-1", name: "First ever", completed: true },
    { id: "brand-2", name: "Pizza Test", completed: true },
  ];
});

test("renders trigger id and active brand label", async () => {
  const html = await renderBrandSwitcherMenu({ triggerId: "test-trigger" });

  expect(html).toContain("First ever");
  expect(captured.buttons[0]?.id).toBe("test-trigger");
});

test("selectBrand is called when a brand menu item is selected", async () => {
  await renderBrandSwitcherMenu();

  const target = captured.items.find((item) => item.label === "Pizza Test");
  expect(target).toBeTruthy();

  (target!.props.onSelect as (e: { preventDefault: () => void }) => void)({
    preventDefault: vi.fn(),
  });

  expect(selectBrandSpy).toHaveBeenCalledTimes(1);
  expect(selectBrandSpy).toHaveBeenCalledWith("brand-2");
});

test("routes to settings and integrations", async () => {
  await renderBrandSwitcherMenu();

  const settings = captured.items.find((item) => item.label === "Settings");
  const integrations = captured.items.find((item) => item.label === "Integrations");
  expect(settings).toBeTruthy();
  expect(integrations).toBeTruthy();

  (settings!.props.onSelect as (e: { preventDefault: () => void }) => void)({
    preventDefault: vi.fn(),
  });
  (integrations!.props.onSelect as (e: { preventDefault: () => void }) => void)({
    preventDefault: vi.fn(),
  });

  expect(routerPushSpy).toHaveBeenCalledWith("/settings");
  expect(routerPushSpy).toHaveBeenCalledWith("/settings/integrations");
});

test("shows admin link only for admin users", async () => {
  const nonAdminHtml = await renderBrandSwitcherMenu();
  expect(nonAdminHtml).not.toContain("Admin");

  sessionUser = { app_metadata: { roles: ["admin"] } };
  const adminHtml = await renderBrandSwitcherMenu();
  expect(adminHtml).toContain("Admin");
});

test("toggles theme via switch handler", async () => {
  themeAppearance = "dark";
  await renderBrandSwitcherMenu();

  const switchProps = captured.switches[0];
  expect(switchProps?.checked).toBe(true);

  (switchProps.onCheckedChange as (checked: boolean) => void)(false);
  expect(toggleSpy).toHaveBeenCalledTimes(1);
  expect(toggleSpy).toHaveBeenCalledWith(false);
});

test("logs out when sign out is selected", async () => {
  await renderBrandSwitcherMenu();

  const signOut = captured.items.find((item) => item.label === "Sign out");
  expect(signOut).toBeTruthy();

  (signOut!.props.onSelect as (e: { preventDefault: () => void }) => void)({
    preventDefault: vi.fn(),
  });

  expect(logoutSpy).toHaveBeenCalledTimes(1);
});
