// A modal lock left behind after its dialog is gone.
//
// A modal makes the rest of the page unreachable while it is open: `pointer-events: none` on
// body (Radix-style) or `inert` on everything outside it (Base UI's focus manager). If the
// dialog unmounts on a path that skips its cleanup, the lock stays and EVERY control on the page
// stops answering — no hover, no spinner, nothing — until a reload. This lifts such a lock, and
// only when no modal surface is actually open.

const OPEN_SURFACES = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  'dialog[open]',
].join(',');

function isOpen(surface: Element): boolean {
  if (surface.hasAttribute('data-closed') || surface.hasAttribute('hidden')) return false;
  if (surface.getAttribute('aria-hidden') === 'true') return false;
  return true;
}

function describe(element: Element): string {
  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`;
}

/** Lifts a stranded body pointer lock and stranded `inert`; returns what it lifted. */
export function releaseStrandedLocks(doc: Document): string[] {
  if ([...doc.querySelectorAll(OPEN_SURFACES)].some(isOpen)) return [];
  const released: string[] = [];
  const body = doc.body;
  if (body.style.pointerEvents === 'none') {
    body.style.removeProperty('pointer-events');
    released.push('body pointer-events');
  }
  if (body.hasAttribute('inert')) {
    body.removeAttribute('inert');
    released.push('body inert');
  }
  for (const element of body.querySelectorAll('[inert]')) {
    element.removeAttribute('inert');
    released.push(`inert on ${describe(element)}`);
  }
  return released;
}
