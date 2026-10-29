import { afterEach, expect, mock, test } from 'bun:test';
import type { OnboardingIntake } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UrlScreen } from './UrlScreen';

afterEach(cleanup);
const submit = () =>
  mock<(intake: OnboardingIntake, files?: File[]) => Promise<void>>(async () => {});
const source = () => screen.getByLabelText(/Website, social profile, or a description/);
const chip = () => screen.getByTestId('intake-source-chip');
const type = (value: string) => fireEvent.change(source(), { target: { value } });
const pressEnter = () => fireEvent.keyDown(source(), { key: 'Enter' });

test('a bare domain is a website, normalized, and Enter analyzes it', async () => {
  const onSubmit = submit();
  render(<UrlScreen onSubmit={onSubmit} defaultBrandName="Acme" />);
  type('acme.example');
  expect(chip().textContent).toContain('Website');
  expect(chip().textContent).toContain('acme.example');
  expect(screen.queryByLabelText('Brand name')).toBeNull();
  pressEnter();
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      { kind: 'website', brand_name: 'Acme', url: 'https://acme.example/', description: null },
      undefined,
    ),
  );
});

test('Shift+Enter does not submit', () => {
  const onSubmit = submit();
  render(<UrlScreen onSubmit={onSubmit} defaultBrandName="Acme" />);
  type('acme.example');
  fireEvent.keyDown(source(), { key: 'Enter', shiftKey: true });
  expect(onSubmit).not.toHaveBeenCalled();
});

test('an Instagram handle is a social profile', async () => {
  const onSubmit = submit();
  render(<UrlScreen onSubmit={onSubmit} defaultBrandName="Acme" />);
  type('@ACME');
  expect(chip().textContent).toContain('@acme');
  pressEnter();
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      {
        kind: 'instagram',
        brand_name: 'Acme',
        url: 'https://www.instagram.com/acme/',
        description: null,
      },
      undefined,
    ),
  );
});

test('a Facebook group link is refused with a plain reason', async () => {
  const onSubmit = submit();
  render(<UrlScreen onSubmit={onSubmit} defaultBrandName="Acme" />);
  type('facebook.com/groups/acme');
  pressEnter();
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Facebook business Page'),
  );
  expect(onSubmit).not.toHaveBeenCalled();
});

test('prose is a description and needs a brand name', async () => {
  const onSubmit = submit();
  render(<UrlScreen onSubmit={onSubmit} />);
  type('Solar installation for homeowners.');
  expect(chip().textContent).toContain('Description');
  pressEnter();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('brand name'));
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Acme' } });
  pressEnter();
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      {
        kind: 'description',
        brand_name: 'Acme',
        url: null,
        description: 'Solar installation for homeowners.',
      },
      undefined,
    ),
  );
});

test('empty input explains what to give', async () => {
  const onSubmit = submit();
  render(<UrlScreen onSubmit={onSubmit} />);
  pressEnter();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Paste a link'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('attached files make it a documents intake and are handed over', async () => {
  const onSubmit = submit();
  const view = render(<UrlScreen onSubmit={onSubmit} defaultBrandName="Acme" />);
  const file = new File(['guide'], 'brand-guide.pdf', { type: 'application/pdf' });
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  expect(chip().textContent).toContain('1 file');
  expect(screen.getByText('brand-guide.pdf')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Continue to documents/ }));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      { kind: 'documents', brand_name: 'Acme', url: null, description: null },
      [file],
    ),
  );
});

test('a failed read keeps the link and offers describing it instead', async () => {
  const onSubmit = submit();
  const onRetry = mock(() => {});
  render(
    <UrlScreen
      onSubmit={onSubmit}
      onRetry={onRetry}
      defaultIntake={{
        kind: 'facebook',
        brand_name: 'Acme',
        url: 'https://facebook.com/acme',
        description: null,
      }}
      error="We couldn’t read that link."
    />,
  );
  expect((source() as HTMLTextAreaElement).value).toBe('https://facebook.com/acme');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Describe it instead' }));
  expect((source() as HTMLTextAreaElement).value).toBe('');
  expect(chip().textContent).toContain('Description');
  expect((screen.getByLabelText('Brand name') as HTMLInputElement).value).toBe('Acme');
  type('Solar installation for homes.');
  pressEnter();
  // The link the user first gave stays attached as context.
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      {
        kind: 'description',
        brand_name: 'Acme',
        url: null,
        reference_url: 'https://facebook.com/acme',
        description: 'Solar installation for homes.',
      },
      undefined,
    ),
  );
});
