// The picker's one hard rule: a codec the encoder probe refused is NEVER offered.
// The probe is injected as a prop (mock.module is process-wide in bun), so both the
// pre-probe state and each capability set are assertable on any machine.

import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ResolvedExportCodec } from '../../utils/render/exportPresets';
import { TimelineExportCodecSelect } from './TimelineEditorDialog';

afterEach(cleanup);

const optionValues = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('option')).map((option) => option.value);

describe('TimelineExportCodecSelect', () => {
  it('offers only the codecs the probe reports encodable', async () => {
    const { container } = render(
      <TimelineExportCodecSelect
        value="avc"
        onChange={() => {}}
        probe={() => Promise.resolve(new Set(['avc', 'vp9']))}
      />,
    );
    await waitFor(() => {
      expect(optionValues(container)).toEqual(['avc', 'vp9']);
    });
  });

  it('offers only avc until the probe has answered', () => {
    const { container } = render(
      <TimelineExportCodecSelect
        value="avc"
        onChange={() => {}}
        probe={() => new Promise(() => {})}
      />,
    );
    expect(optionValues(container)).toEqual(['avc']);
  });

  it('reports the resolved fallback and shows the fellBackFrom note', async () => {
    const resolutions: ResolvedExportCodec[] = [];
    const { container } = render(
      <TimelineExportCodecSelect
        value="hevc"
        onChange={() => {}}
        onResolvedChange={(resolved) => resolutions.push(resolved)}
        probe={() => Promise.resolve(new Set(['avc']))}
      />,
    );
    await waitFor(() => {
      expect(resolutions.at(-1)).toEqual({ codec: 'avc', container: 'mp4', fellBackFrom: 'hevc' });
    });
    expect(container.textContent).toContain('HEVC · MP4 unavailable — exporting H.264 · MP4');
  });

  it('shows no note and resolves the request itself when the codec is encodable', async () => {
    const resolutions: ResolvedExportCodec[] = [];
    const { container } = render(
      <TimelineExportCodecSelect
        value="vp9"
        onChange={() => {}}
        onResolvedChange={(resolved) => resolutions.push(resolved)}
        probe={() => Promise.resolve(new Set(['avc', 'hevc', 'vp9']))}
      />,
    );
    await waitFor(() => {
      expect(resolutions.at(-1)).toEqual({ codec: 'vp9', container: 'webm', fellBackFrom: null });
    });
    expect(container.textContent).not.toContain('unavailable');
  });
});
