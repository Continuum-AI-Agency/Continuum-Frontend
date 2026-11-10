import { afterEach, describe, expect, it } from 'bun:test';
import { Window } from 'happy-dom';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { guardAgainstTranslatedDom } from './translateDomGuard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Chrome's page translation swaps each text node for <font><font>translated</font></font>.
// React keeps the original node, now detached, as its anchor for later DOM writes.
function translate(textNode: Node, translated: string) {
  const doc = textNode.ownerDocument as Document;
  const outer = doc.createElement('font');
  const inner = doc.createElement('font');
  inner.textContent = translated;
  outer.appendChild(inner);
  textNode.parentNode?.replaceChild(outer, textNode);
}

let setSaving: (saving: boolean) => void = () => {};

// SkillForm's save button: the spinner is inserted before the label text.
function SaveButton() {
  const [saving, set] = useState(false);
  setSaving = set;
  return (
    <button type="button">
      {saving && <svg data-spinner="" />}
      {'Save changes'}
    </button>
  );
}

let setWorking: (working: boolean) => void = () => {};

// The organic sidebar's session marker: when the reply ends, the same <span> slot goes from
// [spinner, "Working"] to the role label, so React removes the old text child.
function WorkingMarker() {
  const [working, set] = useState(true);
  setWorking = set;
  return working ? (
    <span>
      <svg />
      Working
    </span>
  ) : (
    <span>assistant</span>
  );
}

// happy-dom shares one Node.prototype across every Window, so a guard installed by one test
// would silently guard the "unguarded" ones. Restore it after each test.
const restores: (() => void)[] = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
});

function installForThisTest(proto: Node) {
  const saved = Object.getOwnPropertyDescriptors(proto);
  const marker = Symbol.for('continuum.translateDomGuard');
  restores.push(() => {
    Object.defineProperties(proto, {
      removeChild: saved.removeChild,
      insertBefore: saved.insertBefore,
    });
    delete (proto as unknown as Record<symbol, unknown>)[marker];
  });
  guardAgainstTranslatedDom(proto);
}

// React 19 hands commit-phase DOM errors to the nearest error boundary instead of throwing
// them; in the app that boundary is the route's "Something went wrong" page. The root's
// onUncaughtError is where they land with no boundary above.
function render(guarded: boolean, update: () => void, node: React.ReactNode) {
  const window = new Window();
  if (guarded) installForThisTest(window.Node.prototype as unknown as Node);
  const container = window.document.createElement('div') as unknown as HTMLElement;
  window.document.body.appendChild(container as unknown as Node);
  const errors: unknown[] = [];
  const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
  act(() => root.render(node));

  const texts = [...container.querySelectorAll('*')]
    .flatMap((el) => [...el.childNodes])
    .filter((child) => child.nodeType === 3);
  for (const text of texts) translate(text, 'Traducido');

  try {
    act(update);
  } catch (error) {
    errors.push(error);
  }
  return { container, thrown: errors[0] ?? null };
}

describe('guardAgainstTranslatedDom', () => {
  it('an unguarded page throws when React inserts before a translated label', () => {
    const { thrown } = render(false, () => setSaving(true), <SaveButton />);
    expect(String(thrown)).toContain('is not a child of this node');
  });

  it('keeps the save button mounted, spinner and translation both shown', () => {
    const { container, thrown } = render(true, () => setSaving(true), <SaveButton />);
    expect(thrown).toBeNull();
    expect(container.querySelector('[data-spinner]')).not.toBeNull();
    expect(container.textContent).toContain('Traducido');
  });

  it('an unguarded page throws when React removes a translated marker label', () => {
    const { thrown } = render(false, () => setWorking(false), <WorkingMarker />);
    expect(String(thrown)).toContain('is not a child of this node');
  });

  it('keeps the session marker mounted when the reply ends', () => {
    const { container, thrown } = render(true, () => setWorking(false), <WorkingMarker />);
    expect(thrown).toBeNull();
    expect(container.textContent).toContain('assistant');
  });

  it('installs once, so a hot reload does not stack the wrappers', () => {
    const proto = new Window().Node.prototype as unknown as Node;
    installForThisTest(proto);
    const removeChild = proto.removeChild;
    guardAgainstTranslatedDom(proto);
    expect(proto.removeChild).toBe(removeChild);
  });
});
