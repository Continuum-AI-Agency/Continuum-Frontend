import { afterEach, describe, expect, mock, test } from 'bun:test';
import { type PresentationCommand, presentationDocumentSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationAgentPanel } from './PresentationAgentPanel';
import type { PresentationEngine } from './presentationEngine';

const document = presentationDocumentSchema.parse({
  schemaVersion: 1,
  id: 'deck',
  title: 'Deck',
  revision: 0,
  engineVersion: 'fixture',
  nativeDocument: 'native',
  source: null,
  size: { width: 720, height: 405 },
  slides: [{ id: 'slide-a', title: 'Intro', layoutId: 'layout-a', notes: '', objects: [] }],
  fields: [],
  diagnostics: [],
  capabilities: { apply: true },
  layouts: [
    { id: 'layout-a', name: 'Title', agentAllowed: true },
    { id: 'layout-b', name: 'Blank', agentAllowed: false },
  ],
});
const scope = {
  brandId: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  baseVersionId: '33333333-3333-4333-8333-333333333333',
};
afterEach(cleanup);
function mount(editorBusy = false) {
  const onCommands = mock(async (_commands: PresentationCommand[]) => true);
  render(
    <PresentationAgentPanel
      scope={scope}
      envelope={{ document, draftRevision: 1 }}
      document={document}
      engine={{} as PresentationEngine}
      slideId="slide-a"
      selectedSlideIds={[]}
      dirty={false}
      save={async () => true}
      adopt={() => undefined}
      onError={() => undefined}
      onChanged={async () => undefined}
      onCommands={onCommands}
      editorBusy={editorBusy}
    />,
  );
  fireEvent.click(screen.getByText('Allowed layouts'));
  return onCommands;
}

describe('PresentationAgentPanel layout permissions', () => {
  test('a human layout choice stages the shared command instead of requesting a proposal', async () => {
    const onCommands = mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Title' }));
    await waitFor(() =>
      expect(onCommands).toHaveBeenCalledWith([
        { type: 'layout.allow', layoutId: 'layout-a', allowed: false },
      ]),
    );
    expect(screen.getByRole('checkbox', { name: 'Blank' }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  test('pending editor operations block layout choices and drafting', () => {
    mount(true);
    expect(screen.getByRole('checkbox', { name: 'Title' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(
      (screen.getByRole('button', { name: 'Drafting variants…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
