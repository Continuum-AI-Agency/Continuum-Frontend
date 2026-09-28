'use client';

import type { NodeProps } from '@xyflow/react';
import type { ComponentType } from 'react';
import { LibraryNodeStatus } from './LibraryNodeStatus';

/**
 * Every node type that can hold Library media gets the Library strip drawn under it, in
 * one place instead of in each node. The strip renders nothing for a node with no Library
 * pointer. It is a sibling of the node's card inside React Flow's positioned node wrapper,
 * so it moves, scales and culls with the node.
 */
export function withLibraryStatus<P extends NodeProps>(
  Component: ComponentType<P>,
): ComponentType<P> {
  function WithLibraryStatus(props: P) {
    return (
      <>
        <Component {...props} />
        <LibraryNodeStatus nodeId={props.id} data={props.data} />
      </>
    );
  }
  WithLibraryStatus.displayName = `WithLibraryStatus(${Component.displayName ?? Component.name})`;
  return WithLibraryStatus;
}
