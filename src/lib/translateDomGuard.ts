// Chrome's page translation (and extensions that rewrite text) swaps each text node for its
// own <font> elements. React still holds the original node, now detached, and the next
// insertBefore/removeChild against it throws NotFoundError — the route's error boundary then
// replaces the whole page. A Spanish-speaking user saving a skill, or watching the organic
// agent stream a reply, lost the screen this way. Our UI is English with `lang="en"`, so every
// non-English user who accepts Chrome's offer is one state change away from it.
//
// These guards turn React's miss into a no-op instead of a crash: a node React wants removed
// is already gone, and a node it wants placed before a vanished anchor goes at the end of the
// parent. The translated text React no longer tracks can linger until its parent re-renders,
// which beats a blank page. facebook/react#11538.

const GUARDED = Symbol.for('continuum.translateDomGuard');

export function guardAgainstTranslatedDom(proto: Node = Node.prototype) {
  const marked = proto as Node & { [GUARDED]?: true };
  if (marked[GUARDED]) return;
  marked[GUARDED] = true;

  const removeChild = proto.removeChild;
  proto.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function guardedInsertBefore<T extends Node>(
    this: Node,
    node: T,
    anchor: Node | null,
  ): T {
    if (anchor && anchor.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, anchor) as T;
  };
}
