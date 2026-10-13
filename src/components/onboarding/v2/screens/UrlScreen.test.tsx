import { afterEach, expect, mock, test } from 'bun:test';
import type { OnboardingIntake } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UrlScreen } from './UrlScreen';

afterEach(cleanup);
const submit = () => mock<(intake: OnboardingIntake) => Promise<void>>(async () => {});

test('website remains the default and scheme-less URLs are normalized', async () => {
  const onSubmit = submit();
  const view = render(<UrlScreen onSubmit={onSubmit} defaultBrandName="Acme" />);
  expect(
    screen.getByRole('radio', { name: 'Website', exact: true }).getAttribute('aria-checked'),
  ).toBe('true');
  fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: 'acme.example' } });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'website',
      brand_name: 'Acme',
      url: 'https://acme.example/',
      description: null,
    }),
  );
});
test('description cannot submit a name alone and original text survives switching sources', async () => {
  const onSubmit = submit();
  const view = render(<UrlScreen onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Describe your business' }));
  fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Acme' } });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Tell us what your business does'),
  );
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('What does your business do?'), {
    target: { value: 'Solar installation for homeowners.' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Brand documents', exact: true }));
  fireEvent.click(screen.getByRole('radio', { name: 'Describe your business' }));
  expect((screen.getByLabelText('What does your business do?') as HTMLTextAreaElement).value).toBe(
    'Solar installation for homeowners.',
  );
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'description',
      brand_name: 'Acme',
      url: null,
      description: 'Solar installation for homeowners.',
    }),
  );
});
test('social source accepts Instagram handles and rejects Facebook group links', async () => {
  const onSubmit = submit();
  const view = render(<UrlScreen onSubmit={onSubmit} defaultBrandName="Acme" />);
  fireEvent.click(screen.getByRole('radio', { name: 'Social profile' }));
  fireEvent.change(screen.getByLabelText('Social profile URL'), {
    target: { value: 'facebook.com/groups/acme' },
  });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Facebook business Page URL'),
  );
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Social profile URL'), { target: { value: '@ACME' } });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'instagram',
      brand_name: 'Acme',
      url: 'https://www.instagram.com/acme/',
      description: null,
    }),
  );
});
test('blocked social reads keep their inputs and offer another source', () => {
  render(
    <UrlScreen
      onSubmit={submit()}
      defaultIntake={{
        kind: 'facebook',
        brand_name: 'Acme',
        url: 'https://facebook.com/acme',
        description: null,
      }}
      error="We couldn’t read that Facebook Page."
    />,
  );
  expect((screen.getByLabelText('Social profile URL') as HTMLInputElement).value).toBe(
    'https://facebook.com/acme',
  );
  expect(screen.getByRole('alert').textContent).toContain(
    'Brand documents or Describe your business',
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Brand documents', exact: true }));
  expect((screen.getByLabelText('Brand name') as HTMLInputElement).value).toBe('Acme');
  expect(
    (screen.getByRole('button', { name: 'Continue to documents' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

test('fallback keeps the original social link separate from the website', async () => {
  const onSubmit = submit();
  const view = render(
    <UrlScreen
      onSubmit={onSubmit}
      defaultIntake={{
        kind: 'facebook',
        brand_name: 'Acme',
        url: 'https://facebook.com/acme',
        description: null,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Describe your business' }));
  fireEvent.change(screen.getByLabelText('What does your business do?'), {
    target: { value: 'Solar installation for homes.' },
  });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'description',
      brand_name: 'Acme',
      url: null,
      reference_url: 'https://facebook.com/acme',
      description: 'Solar installation for homes.',
    }),
  );
});
