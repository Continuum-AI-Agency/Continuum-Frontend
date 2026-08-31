import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { VERNE_TITLE_RIGHT_MARGIN } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// The panel's own behaviour is what is under test: what it WRITES for a pick, a drag and a
// snap. The store and the design-system read are boundaries this component only reads
// through, so they are stubbed rather than mounted.
const patch = mock();
mock.module('../../hooks/useNodeConfigPatch', () => ({ useNodeConfigPatch: () => patch }));

let storeState: Record<string, unknown> = {};
mock.module('../../stores/useStudioStore', () => ({
  useStudioStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
}));

let snapshot: unknown = null;
mock.module('@/lib/brands/useBrandType.client', () => ({
  useBrandType: () => ({
    inputs: { designSystem: snapshot },
    snapshot,
    facesReady: true,
    isLoading: false,
  }),
}));

import { BurnInConfig, resolveBurnInPreviewSources } from './BurnInConfig';

const ACTION_NODE = { id: 'act-1', type: 'action', position: { x: 0, y: 0 }, data: {} };
const IMAGE_NODE = {
  id: 'img-1',
  type: 'image',
  position: { x: 0, y: 0 },
  data: { image: 'data:image/png;base64,AAA' },
};
const TEXT_NODE = {
  id: 'txt-1',
  type: 'string',
  position: { x: 0, y: 0 },
  data: { value: 'Estudia una carrera **con University of London**' },
};
const EDGES = [
  { id: 'e1', source: 'img-1', target: 'act-1', targetHandle: 'in' },
  { id: 'e2', source: 'txt-1', target: 'act-1', targetHandle: 'text-in' },
];

const colourToken = (name: string, value: string) => ({
  name,
  value,
  kind: 'color' as const,
  resolvedValue: value,
  definedIn: null,
  description: null,
});

/** The stage is laid out by the browser; jsdom gives every element a zero rect, so a drag
 *  has to be told what the stage measures. 400x500 keeps the arithmetic legible. */
const STAGE = { width: 400, height: 500, left: 0, top: 0 };
const stubRects = () => {
  Element.prototype.getBoundingClientRect = function stub(this: Element) {
    return {
      ...STAGE,
      right: STAGE.left + STAGE.width,
      bottom: STAGE.top + STAGE.height,
      x: STAGE.left,
      y: STAGE.top,
      toJSON: () => ({}),
    } as DOMRect;
  };
};

const lastConfig = (): Record<string, unknown> => {
  const call = patch.mock.calls.at(-1);
  if (!call) throw new Error('the panel wrote nothing');
  return (call[2] as { config: Record<string, unknown> }).config;
};

/**
 * Drag the block by a DELTA in stage fractions.
 *
 * Relative rather than absolute on purpose: the panel tracks the pointer through the grab
 * offset taken at pointerdown, so a press and a release at the same point must move nothing
 * whatever the block's current placement — which is also what makes this helper independent
 * of the fallback extent jsdom produces.
 */
const dragBlockBy = (delta: { x: number; y: number }) => {
  const block = screen.getByTestId('burn-in-block');
  fireEvent.pointerDown(block, { clientX: 100, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(block, {
    clientX: 100 + delta.x * STAGE.width,
    clientY: 100 + delta.y * STAGE.height,
    pointerId: 1,
  });
};

describe('BurnInConfig', () => {
  beforeEach(() => {
    patch.mockClear();
    snapshot = {
      schemaVersion: 1,
      brandName: 'Bench Brand',
      sourceKind: 'ds_export',
      rigor: { tier: 'strict', evidence: {}, override: null },
      tokens: [colourToken('--ink', '#0f1f43'), colourToken('--accent', '#de8218')],
      fonts: [{ family: 'Georgia', tokens: [], source: null }],
      adherence: { rules: [], exemplars: [] },
      sections: [],
      conflicts: [],
    };
    storeState = { nodes: [ACTION_NODE, IMAGE_NODE, TEXT_NODE], edges: EDGES, brandId: 'brand-1' };
    stubRects();
    // jsdom has no `setPointerCapture`; the drag handler calls it on pointerdown.
    // biome-ignore lint/suspicious/noExplicitAny: jsdom element shim
    (Element.prototype as any).setPointerCapture = () => {};
  });

  afterEach(() => {
    cleanup();
  });

  // The junk this panel exists to replace. A section enum offered `motion`, `voice`, `radii`
  // and `iconography` as the source of a text colour; if one ever comes back through the
  // generic panel, it comes back as a visible control with that word in it.
  it('offers no design-section picker at all', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    for (const junk of ['motion', 'voice', 'radii', 'spacing', 'iconography']) {
      expect(screen.queryByText(new RegExp(junk, 'i'))).toBeNull();
    }
  });

  it('picks an anchor and CLEARS the nudge, because a preset is not a nudged preset', () => {
    render(<BurnInConfig nodeId="act-1" config={{ offsetX: 0.2, offsetY: 0.3 }} />);
    fireEvent.click(screen.getByLabelText('Bottom left'));
    expect(lastConfig()).toMatchObject({ anchor: 'bottom-left', offsetX: 0, offsetY: 0 });
  });

  it('shows all nine points, not the overlay picker five', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    for (const label of [
      'Top left',
      'Top centre',
      'Top right',
      'Middle left',
      'Centre',
      'Middle right',
      'Bottom left',
      'Bottom centre',
      'Bottom right',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('a drag that lands away from every point stores a fraction, never a pixel', () => {
    render(<BurnInConfig nodeId="act-1" config={{ anchor: 'center', offsetX: 0, offsetY: 0 }} />);
    dragBlockBy({ x: 0.18, y: 0.22 });
    const written = lastConfig();
    expect(
      Math.abs(written.offsetX as number) + Math.abs(written.offsetY as number),
    ).toBeGreaterThan(0);
    for (const key of ['offsetX', 'offsetY'] as const) {
      expect(Math.abs(written[key] as number)).toBeLessThanOrEqual(1);
    }
  });

  it('a press and a release at the same point move nothing', () => {
    render(<BurnInConfig nodeId="act-1" config={{ anchor: 'center', offsetX: 0, offsetY: 0 }} />);
    dragBlockBy({ x: 0, y: 0 });
    expect(lastConfig()).toMatchObject({ anchor: 'center', offsetX: 0, offsetY: 0 });
  });

  // `top-right`'s origin is `1 - margin - measure`; `top-left`'s is `margin`. The gap between
  // them is exactly the drag that has to land, and landing it must clear the nudge.
  it('a drag released ON a point snaps to it and clears the nudge', () => {
    render(
      <BurnInConfig nodeId="act-1" config={{ anchor: 'top-right', offsetX: 0, offsetY: 0 }} />,
    );
    dragBlockBy({ x: -(1 - 2 * VERNE_TITLE_RIGHT_MARGIN - 0.61), y: 0 });
    expect(lastConfig()).toMatchObject({ anchor: 'top-left', offsetX: 0, offsetY: 0 });
  });

  // A nudge is smaller than the snap radius by construction. If it went through the snap it
  // would be swallowed every time and the block could never leave an anchor from a keyboard.
  it('nudges with the arrow keys WITHOUT re-snapping, so the block can leave an anchor', () => {
    render(<BurnInConfig nodeId="act-1" config={{ anchor: 'center', offsetX: 0, offsetY: 0 }} />);
    fireEvent.keyDown(screen.getByTestId('burn-in-block'), { key: 'ArrowDown' });
    expect(lastConfig()).toMatchObject({ anchor: 'center' });
    expect(lastConfig().offsetY as number).toBeGreaterThan(0);
  });

  it('offers the palette as swatches, and the default as a named choice', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    fireEvent.click(screen.getByLabelText('--accent'));
    expect(lastConfig()).toMatchObject({ inkToken: '--accent' });
    fireEvent.click(screen.getByLabelText("The palette's default ink"));
    expect(lastConfig()).toMatchObject({ inkToken: '' });
  });

  // A token is a REFERENCE and a hand-picked hex is a VALUE. Holding both would leave the
  // panel and the render free to disagree about which one wins, so every write clears the other.
  it('a hand-picked ink clears the token, and a token clears the hand-picked ink', () => {
    render(<BurnInConfig nodeId="act-1" config={{ inkToken: '--accent' }} />);

    fireEvent.click(screen.getByLabelText('Custom ink colour'));
    fireEvent.change(screen.getByLabelText('Hex colour'), { target: { value: '#123456' } });
    expect(lastConfig()).toMatchObject({ inkHex: '#123456', inkToken: '' });

    cleanup();
    render(<BurnInConfig nodeId="act-1" config={{ inkHex: '#123456' }} />);
    fireEvent.click(screen.getByLabelText('--accent'));
    expect(lastConfig()).toMatchObject({ inkToken: '--accent', inkHex: null });
  });

  it('shows the hand-picked ink as the selected one, and can put it back', () => {
    render(<BurnInConfig nodeId="act-1" config={{ inkHex: '#123456' }} />);

    // No swatch and no Default may claim to be selected while a custom colour is set.
    expect(screen.getByLabelText("The palette's default ink").getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByLabelText('--accent').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('burn-in-ink-source').textContent).toContain('picked by hand');

    fireEvent.click(screen.getByLabelText('Clear the custom ink'));
    expect(lastConfig()).toMatchObject({ inkHex: null });
  });

  it('says out loud that contrast outranks placement', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    expect(screen.getByText(/outranks placement/i)).toBeTruthy();
  });

  // A substitute face is fine; an unlabelled one is not. The panel is the surface that has to
  // name it, and `burnin:type:bench` SKIPs the DOM hop on the strength of these two tests.
  it('names the resolved face and the shape it was read from', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    const source = screen.getByTestId('burn-in-type-source');
    expect(source.getAttribute('data-type-source')).toBe('design-system');
    expect(source.textContent).toContain('Georgia');
    expect(screen.getByText(/Read from the design system/i)).toBeTruthy();
  });

  it('says plainly that no brand face was found when the chain reaches its last rung', () => {
    snapshot = null;
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    const source = screen.getByTestId('burn-in-type-source');
    expect(source.getAttribute('data-type-source')).toBe('fallback');
    expect(source.textContent).toMatch(/no brand face found/i);
    expect(screen.getByText(/set in a face Continuum ships/i)).toBeTruthy();
  });

  it('names where the INK came from, and says what happens when there is none', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    expect(screen.getByTestId('burn-in-ink-source').textContent).toContain(
      'from the design system',
    );
    cleanup();
    snapshot = null;
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    // Not a refusal any more, and the panel must not still threaten one: the ink is measured.
    expect(screen.getByTestId('burn-in-ink-source').textContent).toMatch(/MEASURED from the photo/);
  });

  // Both fallbacks are opt-out, and the panel's job is to say what OFF costs — a switch
  // labelled only with what ON does leaves the user to guess why their node started refusing.
  it('offers both fallbacks, defaulted ON so the node generates out of the box', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    // Base UI's Switch reports state as `data-checked` / `data-unchecked`, not aria-checked.
    expect(screen.getByLabelText('Use a fallback typeface').hasAttribute('data-checked')).toBe(
      true,
    );
    expect(screen.getByLabelText('Measure a fallback ink').hasAttribute('data-checked')).toBe(true);
  });

  it('says what OFF does, not just what ON does', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    expect(screen.getAllByText(/OFF makes this action REFUSE TO RUN/).length).toBe(2);
  });

  it('writes each toggle independently', () => {
    render(<BurnInConfig nodeId="act-1" config={{}} />);
    fireEvent.click(screen.getByLabelText('Measure a fallback ink'));
    expect(lastConfig()).toMatchObject({ fallbackInk: false });
    fireEvent.click(screen.getByLabelText('Use a fallback typeface'));
    expect(lastConfig()).toMatchObject({ fallbackType: false });
  });

  it('warns that a colourless brand will REFUSE once the ink fallback is off', () => {
    snapshot = null;
    render(<BurnInConfig nodeId="act-1" config={{ fallbackInk: false }} />);
    expect(screen.getByTestId('burn-in-ink-source').textContent).toMatch(
      /switched off — this action will refuse/i,
    );
  });
});

describe('resolveBurnInPreviewSources', () => {
  it('reads the real picture and the real words off the upstream nodes', () => {
    // biome-ignore lint/suspicious/noExplicitAny: structural node fixtures
    const sources = resolveBurnInPreviewSources(
      'act-1',
      [ACTION_NODE, IMAGE_NODE, TEXT_NODE] as any,
      EDGES as any,
    );
    expect(sources.imageUrl).toBe('data:image/png;base64,AAA');
    expect(sources.headline).toContain('University of London');
  });

  it('a generator that has not produced a frame yet resolves to nothing, not to a guess', () => {
    const pending = { id: 'img-1', type: 'nanoGen', position: { x: 0, y: 0 }, data: {} };
    // biome-ignore lint/suspicious/noExplicitAny: structural node fixtures
    const sources = resolveBurnInPreviewSources(
      'act-1',
      [ACTION_NODE, pending] as any,
      EDGES as any,
    );
    expect(sources.imageUrl).toBeUndefined();
  });

  it('reads a generated frame from whichever field the upstream node keeps it in', () => {
    const generated = {
      id: 'img-1',
      type: 'nanoGen',
      position: { x: 0, y: 0 },
      data: { generatedImageUrl: 'https://cdn.test/frame.png' },
    };
    // biome-ignore lint/suspicious/noExplicitAny: structural node fixtures
    const sources = resolveBurnInPreviewSources(
      'act-1',
      [ACTION_NODE, generated] as any,
      EDGES as any,
    );
    expect(sources.imageUrl).toBe('https://cdn.test/frame.png');
  });
});
