import { vi } from "bun:test";
import React from "react";

export type CapturedItem = {
  label: string;
  props: Record<string, unknown>;
};

export const radixThemesCaptured = {
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

const createComponent = (tag: keyof JSX.IntrinsicElements) =>
  function MockComponent(props: Record<string, unknown>) {
    return React.createElement(tag, props, props.children);
  };

function Button(props: Record<string, unknown>) {
  radixThemesCaptured.buttons.push(props);
  return React.createElement("button", props, props.children);
}

function Avatar(props: Record<string, unknown>) {
  return React.createElement("span", { "data-avatar": true }, props.fallback ?? null);
}

function Switch(props: Record<string, unknown>) {
  radixThemesCaptured.switches.push(props);
  return React.createElement("button", { "data-switch": true });
}

function Text(props: Record<string, unknown>) {
  return React.createElement("span", props, props.children);
}

function Badge(props: Record<string, unknown>) {
  return React.createElement("span", props, props.children);
}

function Box(props: Record<string, unknown>) {
  return React.createElement("div", props, props.children);
}

function Card(props: Record<string, unknown>) {
  return React.createElement("div", props, props.children);
}

function Checkbox(props: Record<string, unknown>) {
  const { onCheckedChange, checked, ...rest } = props as {
    onCheckedChange?: (value: boolean) => void;
    checked?: boolean | "indeterminate";
  };
  const isIndeterminate = checked === "indeterminate";
  const onChange = onCheckedChange
    ? (event: React.ChangeEvent<HTMLInputElement>) => onCheckedChange(event.currentTarget.checked)
    : () => undefined;
  return React.createElement("input", {
    type: "checkbox",
    checked: isIndeterminate ? false : checked,
    "data-indeterminate": isIndeterminate ? true : undefined,
    onChange,
    ...rest,
  });
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
  radixThemesCaptured.items.push({
    label: normalizeLabel(extractText(props.children)),
    props,
  });
  return React.createElement("div", { "data-dropdown-item": true }, props.children);
}

function Separator() {
  return React.createElement("hr", { "data-dropdown-separator": true });
}

vi.mock("@radix-ui/themes", () => ({
  Avatar,
  Badge,
  Box,
  Button,
  Callout: {
    Root: createComponent("div"),
    Icon: createComponent("span"),
    Text: createComponent("p"),
  },
  Card,
  Checkbox,
  DropdownMenu: {
    Root,
    Trigger,
    Content,
    Item,
    Separator,
  },
  Flex: createComponent("div"),
  Grid: createComponent("div"),
  Heading: createComponent("h2"),
  IconButton: createComponent("button"),
  ScrollArea: createComponent("div"),
  Separator,
  TextField: {
    Root: createComponent("div"),
    Slot: createComponent("span"),
  },
  Switch,
  Text,
}));

export {};
