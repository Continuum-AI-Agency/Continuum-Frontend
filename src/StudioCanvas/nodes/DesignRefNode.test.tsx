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
  beforeEach(() => {
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1', updateNodeData });
    updateNodeData.mockClear();
    executeGenerationMock.mockClear();
    createSignedUrlMock.mockClear();
    noSystem();
  });

  afterEach(cleanup);

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

  it('says plainly that the brand has no design system', () => {
    renderNode({ section: 'palette', mode: 'both' });
    expect(screen.getByText('This brand has no design system yet')).toBeDefined();
  });
});
