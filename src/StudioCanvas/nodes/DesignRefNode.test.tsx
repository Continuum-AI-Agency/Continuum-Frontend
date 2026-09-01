import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// The design-system READ is mocked at the hook, not at the transport: the component only
// ever asks "what does this brand's system contain", and driving that through the real
// hook's fetch would add a promise chain every assertion here has to wait on for nothing.
let designState: Record<string, unknown> = {};
const createSignedUrlMock = mock(() =>
  Promise.resolve({ data: { signedUrl: 'https://storage/exemplar.png' }, error: null }),
);
const executeGenerationMock = mock(() =>
  Promise.resolve({
    success: true,
    output: { type: 'image', url: 'https://storage/plate.png', mimeType: 'image/png' },
  }),
);

mock.module('@/lib/brands/useBrandDesignSections.client', () => ({
  useBrandDesignSections: () => designState,
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
  }),
}));
mock.module('../hooks/useWorkflowExecution', () => ({
  useWorkflowExecution: () => ({ executeGeneration: executeGenerationMock }),
}));

import type { DesignSection, DesignSystemSnapshot } from '@continuum/contracts';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { useStudioStore } from '../stores/useStudioStore';
import { DesignRefNode } from './DesignRefNode';

configure({ asyncUtilTimeout: 3000 });

/* -------------------------------------------------------------------------- */

type Exemplar = { name: string; path: string; mediaType: string; kind: string };

const card = (section: DesignSection, exemplars: Exemplar[] = [], rules: string[] = []) => ({
  section,
  title: `${section.slice(0, 1).toUpperCase()}${section.slice(1)}`,
  summary: '',
  content: {},
  rules: rules.map((statement) => ({
    statement,
    strength: 'hard',
    target: null,
    value: null,
    sourceRef: null,
  })),
  exemplars: exemplars.map((exemplar) => ({
    ...exemplar,
    channel: null,
    viewport: null,
    subtitle: null,
    sha256: null,
  })),
  provenance: 'declared',
  confidence: 1,
  enabled: true,
  editedAt: null,
});

const systemOf = (sections: ReturnType<typeof card>[]) => {
  const snapshot = {
    schemaVersion: 1,
    brandName: 'Test Brand',
    sourceKind: 'ds_export',
    rigor: { tier: 'strict', evidence: {}, override: null },
    tokens: [],
    fonts: [],
    adherence: { forbidRawPx: false, forbidRawHex: false, fontAllowlist: [], tokenAllowlist: [] },
    sections,
    conflicts: [],
  } as unknown as DesignSystemSnapshot;

  designState = {
    sections: sections.map((entry) => ({
      section: entry.section,
      title: entry.title,
      ruleCount: entry.rules.length,
      gates: true,
    })),
    snapshot,
    designSystemId: 'ds-1',
    isLoading: false,
    error: null,
  };
};

const noSystem = () => {
  designState = {
    sections: [],
    snapshot: null,
    designSystemId: null,
    isLoading: false,
    error: null,
  };
};

const updateNodeData = mock();

const renderNode = (data: Record<string, unknown>) =>
  render(
    <ReactFlowProvider>
      <DesignRefNode
        id="d1"
        data={data as never}
        type="designRef"
        selected={false}
        zIndex={0}
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        dragHandle=""
      />
    </ReactFlowProvider>,
  );

/** Everything the component wrote back, merged in call order. */
const written = (): Record<string, unknown> =>
  updateNodeData.mock.calls.reduce(
    (merged, call) => ({ ...merged, ...(call[1] as Record<string, unknown>) }),
    {} as Record<string, unknown>,
  );

describe('DesignRefNode', () => {
  // `useStudioStore` is a module singleton and bun runs every test file in one process, so
  // a mocked store ACTION left in place leaks into the next file: ElementNode.test.tsx's
  // writes landed in this file's `updateNodeData` mock and its assertions timed out.
  let originalUpdateNodeData: typeof updateNodeData | undefined;

  beforeEach(() => {
    originalUpdateNodeData = useStudioStore.getState().updateNodeData as typeof updateNodeData;
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1', updateNodeData });
    updateNodeData.mockClear();
    executeGenerationMock.mockClear();
    createSignedUrlMock.mockClear();
    noSystem();
  });

  afterEach(() => {
    if (originalUpdateNodeData) useStudioStore.setState({ updateNodeData: originalUpdateNodeData });
    cleanup();
  });

  it('offers the three presets and seeds section + mode from one click', () => {
    systemOf([card('palette')]);
    renderNode({ section: null, mode: 'both' });

    for (const label of ['Typography', 'Palette', 'Logo']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Logo' }));
    // The logo preset is image-only on purpose: a DESCRIBED mark is a wrong mark.
    expect(updateNodeData).toHaveBeenCalledWith('d1', { section: 'logo', mode: 'image' });
  });

  it('lists only the sections this brand actually has', () => {
    systemOf([card('palette'), card('motion')]);
    renderNode({ section: null, mode: 'both' });

    const picker = screen.getByLabelText('Design system section') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.value)).toEqual(['', 'palette', 'motion']);
  });

  it('emits an image exemplar VERBATIM, without generating', async () => {
    systemOf([
      card('palette', [
        {
          name: 'Swatches',
          path: 'preview/palette.png',
          mediaType: 'image/png',
          kind: 'preview_card',
        },
      ]),
    ]);
    renderNode({ section: 'palette', mode: 'both' });

    await waitFor(() => expect(written().specimenSource).toBe('exemplar'));
    expect(written().specimenUrl).toBe('https://storage/exemplar.png');
    expect(written().specimenMimeType).toBe('image/png');
    // Rung 1 is free.
    expect(executeGenerationMock).not.toHaveBeenCalled();
  });

  it('refuses an HTML preview card and offers to generate instead', async () => {
    // Every exemplar in production today is text/html — this is the path real brands take.
    systemOf([
      card('palette', [
        {
          name: 'Accent',
          path: 'preview/colors-accent.html',
          mediaType: 'text/html',
          kind: 'preview_card',
        },
      ]),
    ]);
    renderNode({ section: 'palette', mode: 'both' });

    await waitFor(() => expect(updateNodeData).toHaveBeenCalled());
    expect(createSignedUrlMock).not.toHaveBeenCalled();
    expect(written().specimenSource).toBeNull();
    expect(written().specimenUrl).toBeUndefined();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeDefined();
  });

  it('generates a reference plate and labels it as generated', async () => {
    systemOf([card('palette', [], ['Never gradients.'])]);
    renderNode({ section: 'palette', mode: 'both' });

    fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
    await waitFor(() => expect(executeGenerationMock).toHaveBeenCalled());

    const payload = executeGenerationMock.mock.calls[0]?.[1] as {
      prompt: string;
      medium: string;
      design_system_sections?: unknown;
      brand_book_pieces?: unknown;
    };
    expect(payload.medium).toBe('image');
    expect(payload.prompt).toContain('specification sheet, not a composition');
    expect(payload.prompt).toContain('Never gradients.');
    // The plate must not be grounded on the system it depicts, or the block would
    // describe the palette the picture is supposed to SHOW.
    expect(payload.design_system_sections).toEqual([]);
    expect(payload.brand_book_pieces).toEqual([]);

    await waitFor(() => expect(written().specimenSource).toBe('generated'));
    expect(written().specimenUrl).toBe('https://storage/plate.png');
  });

  it('writes the token summary for the text port', async () => {
    systemOf([card('palette', [], ['Two colours per piece.'])]);
    renderNode({ section: 'palette', mode: 'both' });

    await waitFor(() => expect(String(written().tokenSummary)).toContain('Two colours per piece.'));
  });

  it('clears a stale specimen when the section changes', async () => {
    systemOf([card('motion', [], ['Ease out, never linear.'])]);
    renderNode({
      section: 'motion',
      mode: 'both',
      specimenUrl: 'https://storage/stale-palette.png',
      specimenSource: 'generated',
    });

    // A palette plate left attached to a motion reference would be silently wrong.
    await waitFor(() => expect(written().specimenSource).toBeNull());
    expect(written().specimenUrl).toBeUndefined();
  });

  it('names the rung the specimen came from', () => {
    systemOf([card('palette')]);
    renderNode({ section: 'palette', mode: 'both', specimenSource: 'generated' });
    expect(screen.getByText('Specimen · generated')).toBeDefined();

    cleanup();
    renderNode({
      section: 'palette',
      mode: 'both',
      specimenUrl: 'https://storage/e.png',
      specimenSource: 'exemplar',
    });
    expect(screen.getByText('Specimen · from your design system')).toBeDefined();
    // An exemplar is the brand's own artifact — there is nothing to regenerate.
    expect(screen.queryByRole('button', { name: /Generate/ })).toBeNull();
  });

  // Airtable #289. A Palette reference wired into a generator produced a black-and-white
  // frame and the reporter read that as a broken promise. The owner's ruling is that the
  // palette informs the generation and its critique and never constrains it — so the node
  // has to SAY which of the two it is. The other half of the rule (a designRef never
  // blocks a run) is held in `executeWorkflow.designref.test.ts`.
  it('says the reference informs the generation rather than constraining it', () => {
    systemOf([card('palette')]);
    renderNode({ section: 'palette', mode: 'both', specimenSource: 'generated' });

    expect(
      screen.getByText('Informs the generation and its critique. Not enforced on the result.'),
    ).toBeDefined();
  });

  it('promises nothing until a section is chosen', () => {
    systemOf([card('palette')]);
    renderNode({ section: null, mode: 'both' });

    expect(screen.queryByText(/Informs the generation/)).toBeNull();
  });

  it('draws both source handles, and no targets', () => {
    systemOf([card('palette')]);
    const { container } = renderNode({ section: 'palette', mode: 'both' });

    const sources = [...container.querySelectorAll('.react-flow__handle-right')];
    expect(sources.map((handle) => handle.getAttribute('data-handleid')).sort()).toEqual([
      'image',
      'text',
    ]);
    expect(container.querySelectorAll('.react-flow__handle-left').length).toBe(0);
  });

  // Airtable #283. Three defects on one node: the title truncated to "Design Referen…",
  // the token summary clipped mid-word, and the blue Generate button floated on top of
  // that text. The geometry is asserted in `studio:node-chrome:bench`; what a DOM test can
  // hold is the structure that produced it.
  it('keeps the mode select narrow enough to leave the title its width', () => {
    systemOf([card('palette')]);
    renderNode({ section: 'palette', mode: 'both' });

    // A native select is as wide as its widest option, and it sits in the same 240px bar as
    // the node's own title. "Specimen + tokens" is what ate "Design Reference".
    const options = [
      ...screen.getByLabelText('What this reference emits').querySelectorAll('option'),
    ];
    expect(options.map((option) => option.textContent)).toEqual(['Both', 'Specimen', 'Tokens']);
  });

  it('gives the token summary its own bounded scroll pane, clear of Generate', async () => {
    systemOf([card('typography', [], ['Playfair Display for display, Instrument Sans for body.'])]);
    renderNode({
      section: 'typography',
      mode: 'both',
      tokenSummary:
        '<design_system>Playfair Display for display, Instrument Sans for body.</design_system>',
    });

    const tokens = await screen.findByTestId('design-ref-tokens');
    // styleguide.md §4: bound the frame, put the overflow in an inner pane. Clipping is a bug.
    expect(tokens.className).toContain('min-h-0');
    expect(tokens.className).toContain('flex-1');
    expect(tokens.className).toContain('overflow-y-auto');

    // Generate belongs to the specimen pane; floated over the summary it covered the text.
    const generate = screen.getByRole('button', { name: /Generate/ });
    expect(tokens.contains(generate)).toBe(false);
    expect(generate.closest('[data-testid="design-ref-tokens"]')).toBeNull();
    expect(generate.parentElement?.contains(tokens)).toBe(false);
  });

  it('says plainly that the brand has no design system', () => {
    renderNode({ section: 'palette', mode: 'both' });
    expect(screen.getByText('This brand has no design system yet')).toBeDefined();
  });
});
