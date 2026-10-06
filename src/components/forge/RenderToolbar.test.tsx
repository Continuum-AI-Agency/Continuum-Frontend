import { afterEach, expect, mock, test } from 'bun:test';
import {
  type ApiRenderTemplateSummary,
  apiRenderTemplateSummarySchema,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TemplatePicker } from './RenderToolbar';

afterEach(cleanup);

const template = (
  key: string,
  displayName: string,
  bindingId = '44444444-4444-4444-8444-444444444444',
  sourceAssetId: string | null = null,
): ApiRenderTemplateSummary =>
  apiRenderTemplateSummarySchema.parse({
    key,
    name: `forge_${key}`,
    bindingId,
    environment: 'Continuum_app',
    contractVersion: '1',
    contractHash: 'hash',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: 1,
    previewUrl: null,
    updatedAt: null,
    ratios: ['1:1', '9:16'],
    sourceAssetId,
    displayName,
  });

const TEMPLATES = [
  template('133', 'StarCraft Promo'),
  template('134', 'Summer Sale'),
  // The same key in another sub-app is another template, and must stay its own row.
  template('133', 'StarCraft Promo', '55555555-5555-4555-8555-555555555555'),
];

const open = (onChange = mock(), onHighlight = mock()) => {
  render(
    <TemplatePicker
      templates={TEMPLATES}
      currentRef=""
      placeholder="Choose a template"
      onChange={onChange}
      onHighlight={onHighlight}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Template' }));
  return { onChange, onHighlight };
};

test('lists every template, a key held in two bindings twice, with its formats', async () => {
  open();
  const options = await screen.findAllByRole('option');
  expect(options).toHaveLength(3);
  expect(screen.getAllByText('1:1 9:16')).toHaveLength(3);
});

test('search narrows by name and never matches the binding uuid', async () => {
  open();
  const search = await screen.findByLabelText('Search templates');
  fireEvent.change(search, { target: { value: 'summer' } });
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    expect.stringContaining('Summer Sale'),
  ]);
  // Every binding uuid holds a "5"; a match on the value would list both StarCraft rows.
  fireEvent.change(search, { target: { value: '55555' } });
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  expect(screen.getByText('No template matches.')).toBeTruthy();
});

test('highlighting reports the template before it is chosen; choosing hands back its ref', async () => {
  const { onChange, onHighlight } = open();
  const search = await screen.findByLabelText('Search templates');
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  const highlighted = onHighlight.mock.calls.at(-1)?.[0] as ApiRenderTemplateSummary;
  expect(highlighted.displayName).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('option', { name: /Summer Sale/ }));
  expect(onChange).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444:134');
  // The picker closes on a pick. (A closing popup stays in the DOM while it animates out.)
  expect(screen.getByRole('button', { name: 'Template' }).getAttribute('aria-expanded')).toBe(
    'false',
  );
});

test('once the registry answers, rows group by what each was authored in, and the type is searchable', async () => {
  const design = '66666666-6666-4666-8666-666666666666';
  const motion = '77777777-7777-4777-8777-777777777777';
  render(
    <TemplatePicker
      templates={[
        template('301', 'Promo motion', undefined, motion),
        template('302', 'Artboard 1', undefined, design),
        template('88', 'Fleet card'),
      ]}
      currentRef=""
      placeholder="Choose a template"
      onChange={mock()}
      sourceKinds={
        new Map([
          [design, 'illustrator'],
          [motion, 'after_effects'],
        ])
      }
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Template' }));
  await screen.findAllByRole('option');
  const headings = screen
    .getAllByRole('group')
    .flatMap((group) => {
      const id = group.getAttribute('aria-labelledby');
      return id ? [document.getElementById(id)?.textContent] : [];
    });
  expect(headings).toEqual(['Illustrator', 'After Effects', 'Shared workspace']);
  const rowsIn = (name: string) =>
    within(screen.getByRole('group', { name }))
      .getAllByRole('option')
      .map((option) => option.querySelector('.truncate')?.textContent);
  expect(rowsIn('Illustrator')).toEqual(['Artboard 1']);
  expect(rowsIn('After Effects')).toEqual(['Promo motion']);
  // No upload in this brand: it came from the shared render workspace — not a guessed type.
  expect(rowsIn('Shared workspace')).toEqual(['Fleet card']);
  fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'illustrator' } });
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    expect.stringContaining('Artboard 1'),
  ]);
});
