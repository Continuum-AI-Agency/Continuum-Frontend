import { expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { TemplateGrid } from './TemplateGrid';

test('the Templates section starts with one clear AEP intake action', () => {
  const onChooseFiles = mock(() => undefined);

  render(
    <TemplateGrid
      brandId="brand-1"
      sources={[]}
      assets={[]}
      onChanged={() => undefined}
      onChooseFiles={onChooseFiles}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Add an After Effects template' })).toBeTruthy();
  expect(screen.getByText(/unpacks it, and lists its render controls here/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Choose template' }));
  expect(onChooseFiles).toHaveBeenCalledTimes(1);
});
