import { Handle, type HandleType, Position } from '@xyflow/react';
import type { ComponentProps } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** `true` keeps the default side (target Top, source Bottom); an object moves or names it. */
export type NodeHandleSpec = boolean | { position?: Position; id?: string };

export type NodeExtraHandle = { type: HandleType; position: Position; id: string };

export type NodeProps = ComponentProps<typeof Card> & {
  handles: {
    target: NodeHandleSpec;
    source: NodeHandleSpec;
  };
  /**
   * Handles beyond the default pair. They render AFTER it, which matters: an edge with
   * no handle id attaches to the first handle of its type, so the default pair keeps
   * every id-less edge.
   */
  extraHandles?: readonly NodeExtraHandle[];
  selected?: boolean;
};

const handleClassName = '!h-3.5 !w-3.5';

const renderHandle = (spec: NodeHandleSpec, type: HandleType, defaultPosition: Position) => {
  if (!spec) return null;
  const { position = defaultPosition, id } = spec === true ? {} : spec;
  return <Handle className={handleClassName} position={position} type={type} id={id} />;
};

export const Node = ({ handles, extraHandles, className, selected, ...props }: NodeProps) => (
  <Card
    data-selected={selected ? 'true' : undefined}
    className={cn(
      'node-container relative size-full h-auto w-sm gap-0 overflow-visible rounded-md p-0',
      className,
    )}
    {...props}
  >
    {renderHandle(handles.target, 'target', Position.Top)}
    {renderHandle(handles.source, 'source', Position.Bottom)}
    {extraHandles?.map((handle) => (
      <Handle
        key={`${handle.type}:${handle.id}`}
        className={handleClassName}
        position={handle.position}
        type={handle.type}
        id={handle.id}
      />
    ))}
    {props.children}
  </Card>
);

export type NodeHeaderProps = ComponentProps<typeof CardHeader>;

export const NodeHeader = ({ className, ...props }: NodeHeaderProps) => (
  <CardHeader
    className={cn('gap-0.5 rounded-t-md border-b bg-secondary p-3!', className)}
    {...props}
  />
);

export type NodeTitleProps = ComponentProps<typeof CardTitle>;

export const NodeTitle = (props: NodeTitleProps) => <CardTitle {...props} />;

export type NodeDescriptionProps = ComponentProps<typeof CardDescription>;

export const NodeDescription = (props: NodeDescriptionProps) => <CardDescription {...props} />;

export type NodeActionProps = ComponentProps<typeof CardAction>;

export const NodeAction = (props: NodeActionProps) => <CardAction {...props} />;

export type NodeContentProps = ComponentProps<typeof CardContent>;

export const NodeContent = ({ className, ...props }: NodeContentProps) => (
  <CardContent className={cn('p-3', className)} {...props} />
);

export type NodeFooterProps = ComponentProps<typeof CardFooter>;

export const NodeFooter = ({ className, ...props }: NodeFooterProps) => (
  <CardFooter className={cn('rounded-b-md border-t bg-secondary p-3!', className)} {...props} />
);
