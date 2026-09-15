/**
 * FormatPreview: the frame is drawn at the picked format's own aspect, the chip names each format
 * with its size, the badge says where the picture came from, and a file belongs to a format only
 * by its name — never by its position in the job's output list.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { ApiRenderOutput } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  FormatPreview,
  fileForFormat,
  type PreviewFormat,
  type PreviewFrame,
  previewFormats,
} from './FormatPreview';

afterEach(cleanup);

const COMP = 'Producto individual con descuento';
const FORMATS: PreviewFormat[] = [
  { id: 'wide', label: `${COMP} 16:9`, ratio: '16:9', width: 1920, height: 1080 },
  { id: 'square', label: `${COMP} 1:1`, ratio: '1:1', width: 1080, height: 1080 },
  { id: 'story', label: `${COMP} 9:16`, ratio: '9:16', width: null, height: null },
];

function Harness({ frame }: { frame: (format: PreviewFormat) => PreviewFrame }) {
  const [value, setValue] = useState('wide');
  return (
    <FormatPreview
      label="Preview"
      formats={FORMATS}
      value={value}
      onValueChange={setValue}
      frame={frame}
      wellClassName="h-96"
    />
  );
}

const frameEl = () =>
  document.querySelector('[data-slot="format-preview-frame"]') as HTMLElement | null;
const badge = () => document.querySelector('[data-slot="format-preview-badge"]')?.textContent;

describe('FormatPreview', () => {
  test('draws the frame at each picked format’s aspect, from its size or else its ratio', () => {
    render(<Harness frame={() => ({ mode: 'estimate', node: <svg aria-label="drawing" /> })} />);

    expect(frameEl()?.style.aspectRatio).toBe('1920 / 1080');
    fireEvent.click(screen.getByRole('button', { name: `${COMP} 1:1` }));
    expect(frameEl()?.style.aspectRatio).toBe('1080 / 1080');
    fireEvent.click(screen.getByRole('button', { name: `${COMP} 9:16` }));
    expect(frameEl()?.style.aspectRatio).toBe('9 / 16');
  });

  test('one chip per format, naming its ratio and pixel size', () => {
    render(<Harness frame={() => ({ mode: 'none' })} />);

    const wide = screen.getByRole('button', { name: `${COMP} 16:9` });
    expect(wide.textContent).toBe('16:91920×1080');
    expect(wide.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: `${COMP} 1:1` }).textContent).toBe('1:11080×1080');
    // No measured size: the ratio alone, never an invented one.
    expect(screen.getByRole('button', { name: `${COMP} 9:16` }).textContent).toBe('9:16');
  });

  test('the badge says estimate, rendered with its age, or rendered before the latest edits', () => {
    const at = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const { rerender } = render(<Harness frame={() => ({ mode: 'estimate', node: null })} />);
    expect(badge()).toBe('Estimate · wireframe');
    expect(
      screen.getByText(
        'Boxes measured from the template; type size, wrapping and brand fonts are guesses.',
      ),
    ).toBeTruthy();

    rerender(<Harness frame={() => ({ mode: 'rendered', at, node: <img alt="file" /> })} />);
    expect(badge()).toBe('Rendered · 2h ago');

    rerender(
      <Harness frame={() => ({ mode: 'rendered', at, stale: true, node: <img alt="file" /> })} />,
    );
    expect(badge()).toBe('Rendered · before latest edits');

    rerender(<Harness frame={() => ({ mode: 'none' })} />);
    expect(screen.getByText('No measured layout for this format')).toBeTruthy();
  });

  test('a format with both shows the render first and switches to the estimate', () => {
    const at = new Date().toISOString();
    render(
      <Harness
        frame={() => ({
          mode: 'rendered',
          at,
          node: <img alt="file" />,
          estimate: <svg aria-label="drawing" />,
        })}
      />,
    );

    expect(screen.getByAltText('file')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Estimate' }));
    expect(screen.queryByAltText('file')).toBeNull();
    expect(screen.getByLabelText('drawing')).toBeTruthy();
    expect(badge()).toBe('Estimate · wireframe');
  });
});

const output = (fileName: string): ApiRenderOutput => ({
  id: fileName,
  kind: 'image',
  fileName,
  mimeType: 'image/jpeg',
  url: `https://cdn.test/${fileName}`,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});

// The real template-133 names, in the order one prod job returned them.
const OUTPUTS = [
  output('Producto_individual_con_descuento_9_16_ooqxxwb.jpg'),
  output('Producto_individual_con_descuento_1_1_1mjxxwb.jpg'),
  output('Producto_individual_con_descuento_16_9_9w5xxwa.jpg'),
];

describe('fileForFormat', () => {
  test('finds each format’s file by name, whatever order the job listed them in', () => {
    const formats = previewFormats({ ratios: ['16:9', '1:1', '9:16'] });
    expect(fileForFormat(OUTPUTS, formats, '1:1')?.fileName).toBe(
      'Producto_individual_con_descuento_1_1_1mjxxwb.jpg',
    );
    expect(fileForFormat(OUTPUTS, formats, '16:9')?.fileName).toBe(
      'Producto_individual_con_descuento_16_9_9w5xxwa.jpg',
    );
  });

  test('a format no file answers has no file — never the first one', () => {
    const formats = previewFormats({ ratios: ['4:5'] });
    expect(fileForFormat(OUTPUTS, formats, '4:5')).toBeNull();
  });
});

describe('previewFormats', () => {
  test('contract outputs first, then the parse, then the bare ratios', () => {
    expect(
      previewFormats({
        outputs: [
          {
            id: 'square',
            label: 'Square',
            ratio: '1:1',
            comp: { name: 'Square', width: 1080, height: 1080 },
          },
        ],
        parse: { ratios: [{ ratio: '9:16', width: 1080, height: 1920, comps: ['Story'] }] },
        ratios: ['16:9'],
      }).map(({ id, width }) => [id, width]),
    ).toEqual([['square', 1080]]);

    expect(
      previewFormats({
        outputs: [],
        parse: { ratios: [{ ratio: '9:16', width: 1080, height: 1920, comps: ['Story'] }] },
        ratios: ['16:9'],
      }).map(({ id, label, height }) => [id, label, height]),
    ).toEqual([['Story', 'Story', 1920]]);

    expect(previewFormats({ outputs: [], parse: null, ratios: ['16:9'] })).toEqual([
      { id: '16:9', label: '16:9', ratio: '16:9', width: null, height: null },
    ]);
  });
});
