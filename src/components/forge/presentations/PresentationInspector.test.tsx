import { afterEach, describe, expect, mock, test } from 'bun:test';
import { type PresentationCommand, presentationDocumentSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationInspector } from './PresentationInspector';

const document = presentationDocumentSchema.parse({
  schemaVersion: 1,
  id: 'deck',
  title: 'Imported deck',
  revision: 0,
  engineVersion: 'fixture',
  source: null,
  nativeDocument: 'native',
  size: { width: 720, height: 405 },
  fields: [],
  diagnostics: [],
  capabilities: {},
  slides: [
    {
      id: 'slide-a',
      title: 'Intro',
      layoutId: null,
      notes: '',
      objects: [
        {
          id: 'text-a',
          kind: 'text',
          name: 'Heading',
          bounds: { x: 40, y: 50, width: 300, height: 80, rotation: 0 },
          text: 'Original',
          style: { fontFamily: 'Inter', fontSize: 32, color: '#333333', italic: true },
        },
      ],
    },
  ],
});
afterEach(cleanup);

function mount(overrides: Partial<Parameters<typeof PresentationInspector>[0]> = {}) {
  const commands = mock(async (_commands: PresentationCommand[]) => true);
  const onError = mock((_message: string) => undefined);
  render(
    <PresentationInspector
      document={document}
      slideId="slide-a"
      object={document.slides[0].objects[0]}
      busy={false}
      onCommands={commands}
      onError={onError}
      {...overrides}
    />,
  );
  return { commands, onError };
}

describe('PresentationInspector', () => {
  test('text edits preserve imported style unless a style control changes', async () => {
    const { commands } = mount();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Revised heading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    expect(commands.mock.calls[0][0]).toEqual([
      { type: 'object.text', slideId: 'slide-a', objectId: 'text-a', text: 'Revised heading' },
    ]);
  });

  test('geometric shape text and fill remain editable in one batch', async () => {
    const { commands } = mount({
      object: { ...document.slides[0].objects[0], kind: 'shape', data: { shapeType: 'rect' } },
    });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Shape caption' } });
    fireEvent.change(screen.getByLabelText('Fill'), { target: { value: '#ff6600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    expect(commands.mock.calls[0][0]).toEqual([
      { type: 'object.text', slideId: 'slide-a', objectId: 'text-a', text: 'Shape caption' },
      { type: 'object.style', slideId: 'slide-a', objectId: 'text-a', style: { fill: '#ff6600' } },
    ]);
  });

  test('a protected font does not prevent an unrelated color patch', async () => {
    const { commands } = mount({
      document: {
        ...document,
        fields: [
          {
            id: 'font-lock',
            name: 'Brand font',
            slideId: 'slide-a',
            objectId: 'text-a',
            kind: 'text',
            property: 'fontFamily',
            locked: true,
            required: false,
          },
        ],
      },
    });
    expect((screen.getByLabelText('Typeface') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Color') as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#112233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    expect(commands.mock.calls[0][0]).toEqual([
      { type: 'object.style', slideId: 'slide-a', objectId: 'text-a', style: { color: '#112233' } },
    ]);
  });

  test('imported fractional bounds and type sizes permit an unrelated text edit', async () => {
    const original = document.slides[0].objects[0];
    const { commands } = mount({
      object: {
        ...original,
        bounds: { ...original.bounds, height: 64.8 },
        style: { ...original.style, fontSize: 27.5 },
      },
    });
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Fractional imported layout' },
    });
    const form = screen.getByRole('button', { name: 'Apply changes' }).closest('form');
    expect(form?.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    expect(commands.mock.calls[0][0]).toEqual([
      {
        type: 'object.text',
        slideId: 'slide-a',
        objectId: 'text-a',
        text: 'Fractional imported layout',
      },
    ]);
  });

  test('placement and text submit as one atomic command batch', async () => {
    const { commands } = mount();
    fireEvent.change(screen.getByLabelText('Left'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Moved heading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    expect(commands.mock.calls[0][0]).toEqual([
      {
        type: 'object.transform',
        slideId: 'slide-a',
        objectId: 'text-a',
        bounds: { x: 90, y: 50, width: 300, height: 80, rotation: 0 },
      },
      { type: 'object.text', slideId: 'slide-a', objectId: 'text-a', text: 'Moved heading' },
    ]);
  });

  test('locked content remains disabled while unlock is available', async () => {
    const { commands } = mount({ object: { ...document.slides[0].objects[0], locked: true } });
    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Apply changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() =>
      expect(commands).toHaveBeenCalledWith([
        { type: 'lock.set', slideId: 'slide-a', objectId: 'text-a', locked: false },
      ]),
    );
  });

  test('property locks keep text editable when only placement is protected', () => {
    mount({
      document: {
        ...document,
        fields: [
          {
            id: 'field-a',
            name: 'Heading position',
            slideId: 'slide-a',
            objectId: 'text-a',
            kind: 'text',
            property: 'bounds',
            locked: true,
            required: false,
          },
        ],
      },
    });
    expect((screen.getByLabelText('Left') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).disabled).toBe(false);
  });

  test('invalid chart data blocks the entire batch', async () => {
    const { commands, onError } = mount({
      object: {
        id: 'chart-a',
        kind: 'chart',
        name: 'Sales',
        bounds: { x: 0, y: 0, width: 300, height: 180, rotation: 0 },
        data: {
          chartType: 'bar',
          categories: ['One', 'Two'],
          series: [{ name: 'Sales', values: [10, 20] }],
        },
      },
    });
    fireEvent.change(screen.getByLabelText('Values, separated by commas'), {
      target: { value: '10, bad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(commands).not.toHaveBeenCalled();
  });

  test('excessive image crop blocks the entire batch', async () => {
    const { commands, onError } = mount({
      object: {
        id: 'image-a',
        kind: 'image',
        name: 'Hero',
        bounds: { x: 0, y: 0, width: 300, height: 180, rotation: 0 },
        data: { bytesBase64: 'AA==', mimeType: 'image/png' },
      },
    });
    fireEvent.change(screen.getByLabelText('Crop left (%)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Crop right (%)'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(commands).not.toHaveBeenCalled();
  });
});
