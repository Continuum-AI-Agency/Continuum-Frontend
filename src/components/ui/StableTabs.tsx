"use client";

import * as React from "react";
import { composeEventHandlers } from "@radix-ui/primitive";
import { createContextScope } from "@radix-ui/react-context";
import { useId as useRadixId } from "@radix-ui/react-id";
import { useDirection } from "@radix-ui/react-direction";
import { createRovingFocusGroupScope } from "@radix-ui/react-roving-focus";
import * as RovingFocusGroup from "@radix-ui/react-roving-focus";
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Primitive } from "@radix-ui/react-primitive";
import { Presence } from "@radix-ui/react-presence";

import type {
  TabsProps as RadixTabsProps,
  TabsListProps as RadixTabsListProps,
  TabsTriggerProps as RadixTabsTriggerProps,
  TabsContentProps as RadixTabsContentProps,
} from "@radix-ui/react-tabs";

type RovingFocusGroupProps = React.ComponentPropsWithoutRef<typeof RovingFocusGroup.Root>;
type PrimitiveDivProps = React.ComponentPropsWithoutRef<typeof Primitive.div>;
type PrimitiveButtonProps = React.ComponentPropsWithoutRef<typeof Primitive.button>;

type Orientation = NonNullable<RovingFocusGroupProps["orientation"]>;
type Direction = NonNullable<RovingFocusGroupProps["dir"]>;
type ActivationMode = "automatic" | "manual";

interface TabsContextValue {
  baseId: string;
  value: string;
  onValueChange(value: string): void;
  orientation: Orientation;
  dir: Direction;
  activationMode: ActivationMode;
}

const TABS_NAME = "Tabs";

const [createTabsContext, createTabsScope] = createContextScope(TABS_NAME, [createRovingFocusGroupScope]);
const useRovingFocusGroupScope = createRovingFocusGroupScope();
const [TabsProvider, useTabsContext] = createTabsContext<TabsContextValue>(TABS_NAME);

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type StableTabsProps = RadixTabsProps & {
  baseId?: string;
  className?: string;
};

const TabsRoot = React.forwardRef<HTMLDivElement, StableTabsProps>((props, forwardedRef) => {
  const {
    __scopeTabs,
    baseId: baseIdProp,
    value: valueProp,
    onValueChange,
    defaultValue,
    orientation = "horizontal",
    dir,
    activationMode = "automatic",
    className,
    ...tabsProps
  } = props;

  const direction = useDirection(dir);
  const [value, setValue] = useControllableState<string>({
    prop: valueProp,
    onChange: onValueChange,
    defaultProp: defaultValue ?? "",
    caller: TABS_NAME,
  });
  const generatedBaseId = useRadixId(baseIdProp ? baseIdProp.replace(/^radix-/, "") : undefined);
  const baseId = React.useMemo(() => (baseIdProp ? baseIdProp : generatedBaseId || "radix-tabs"), [baseIdProp, generatedBaseId]);

  return (
    <TabsProvider
      scope={__scopeTabs}
      baseId={baseId}
      value={value}
      onValueChange={setValue}
      orientation={orientation}
      dir={direction}
      activationMode={activationMode}
    >
      <Primitive.div
        dir={direction}
        data-orientation={orientation}
        {...(tabsProps as PrimitiveDivProps)}
        ref={forwardedRef}
        className={cn("rt-TabsRoot", className)}
      />
    </TabsProvider>
  );
});
TabsRoot.displayName = TABS_NAME;

type StableTabsListProps = RadixTabsListProps & {
  className?: string;
  color?: string;
};

const TAB_LIST_NAME = "TabsList";

const TabsList = React.forwardRef<HTMLDivElement, StableTabsListProps>((props, forwardedRef) => {
  const { __scopeTabs, loop = true, className, color, ...listProps } = props;
  const context = useTabsContext(TAB_LIST_NAME, __scopeTabs);
  const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeTabs);

  return (
    <RovingFocusGroup.Root
      asChild
      {...rovingFocusGroupScope}
      orientation={context.orientation}
      dir={context.dir}
      loop={loop}
    >
      <Primitive.div
        role="tablist"
        aria-orientation={context.orientation}
        data-accent-color={color}
        {...(listProps as PrimitiveDivProps)}
        ref={forwardedRef}
        className={cn("rt-BaseTabList", "rt-TabsList", className)}
      />
    </RovingFocusGroup.Root>
  );
});
TabsList.displayName = TAB_LIST_NAME;

type StableTabsTriggerProps = RadixTabsTriggerProps & {
  className?: string;
  children: React.ReactNode;
};

const TRIGGER_NAME = "TabsTrigger";

const TabsTrigger = React.forwardRef<HTMLButtonElement, StableTabsTriggerProps>((props, forwardedRef) => {
  const { __scopeTabs, value, disabled = false, className, children, ...triggerProps } = props;
  const context = useTabsContext(TRIGGER_NAME, __scopeTabs);
  const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeTabs);

  const triggerId = makeTriggerId(context.baseId, value);
  const contentId = makeContentId(context.baseId, value);
  const isSelected = value === context.value;

  const { onMouseDown, onKeyDown, onFocus, ...restTriggerProps } = triggerProps as PrimitiveButtonProps;

  return (
    <RovingFocusGroup.Item
      asChild
      {...rovingFocusGroupScope}
      focusable={!disabled}
      active={isSelected}
    >
      <Primitive.button
        type="button"
        role="tab"
        aria-selected={isSelected}
        aria-controls={contentId}
        data-state={isSelected ? "active" : "inactive"}
        data-disabled={disabled ? "" : undefined}
        disabled={disabled}
        id={triggerId}
        {...restTriggerProps}
        ref={forwardedRef}
        className={cn("rt-reset", "rt-BaseTabListTrigger", "rt-TabsTrigger", className)}
        onMouseDown={composeEventHandlers(onMouseDown, event => {
          if (!disabled && event.button === 0 && event.ctrlKey === false) {
            context.onValueChange(value);
          } else {
            event.preventDefault();
          }
        })}
        onKeyDown={composeEventHandlers(onKeyDown, event => {
          if ([" ", "Enter"].includes(event.key)) {
            context.onValueChange(value);
          }
        })}
        onFocus={composeEventHandlers(onFocus, () => {
          const isAutomaticActivation = context.activationMode !== "manual";
          if (!isSelected && !disabled && isAutomaticActivation) {
            context.onValueChange(value);
          }
        })}
      >
        <span className="rt-BaseTabListTriggerInner rt-TabsTriggerInner">{children}</span>
        <span className="rt-BaseTabListTriggerInnerHidden rt-TabsTriggerInnerHidden">{children}</span>
      </Primitive.button>
    </RovingFocusGroup.Item>
  );
});
TabsTrigger.displayName = TRIGGER_NAME;

type StableTabsContentProps = RadixTabsContentProps & {
  className?: string;
};

const CONTENT_NAME = "TabsContent";

const TabsContent = React.forwardRef<HTMLDivElement, StableTabsContentProps>((props, forwardedRef) => {
  const { __scopeTabs, value, forceMount, children, className, style, ...contentProps } = props;
  const context = useTabsContext(CONTENT_NAME, __scopeTabs);
  const triggerId = makeTriggerId(context.baseId, value);
  const contentId = makeContentId(context.baseId, value);
  const isSelected = value === context.value;
  const isMountAnimationPreventedRef = React.useRef(isSelected);

  React.useEffect(() => {
    const rAF = requestAnimationFrame(() => {
      isMountAnimationPreventedRef.current = false;
    });
    return () => cancelAnimationFrame(rAF);
  }, []);

  return (
    <Presence present={forceMount || isSelected}>
      {({ present }) => (
        <Primitive.div
          data-state={isSelected ? "active" : "inactive"}
          data-orientation={context.orientation}
          role="tabpanel"
          aria-labelledby={triggerId}
          hidden={!present}
          id={contentId}
          tabIndex={0}
          ref={forwardedRef}
          className={cn("rt-TabsContent", className)}
          style={{
            ...style,
            animationDuration: isMountAnimationPreventedRef.current ? "0s" : style?.animationDuration,
          }}
          {...(contentProps as PrimitiveDivProps)}
        >
          {present ? children : null}
        </Primitive.div>
      )}
    </Presence>
  );
});
TabsContent.displayName = CONTENT_NAME;

function makeTriggerId(baseId: string, value: string): string {
  return `${baseId}-trigger-${value}`;
}

function makeContentId(baseId: string, value: string): string {
  return `${baseId}-content-${value}`;
}

export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
};

export type { StableTabsProps, StableTabsListProps, StableTabsTriggerProps, StableTabsContentProps };

export { createTabsScope };


