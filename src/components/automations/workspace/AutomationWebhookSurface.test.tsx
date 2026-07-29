// Guards the automations webhook surface after `action.outbound_webhook` moved
// to the `production` lifecycle. Every assertion here failed (or would have
// silently passed on a broken UI) while the coming-soon gates were still in
// place, so this file is the regression fence for re-adding one.

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  Automation,
  AutomationWebhookDestination,
  AutomationWebhookEndpoint,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  automationDestinationUrlError,
  automationEndpointCreationBlockReason,
  automationEndpointCreationError,
  canDismissRevealedSecret,
  WebhookManager,
  type WebhookManagerClient,
  WorkflowInspector,
} from './AutomationWorkspacePanels';
import { createAutomationWorkflowNode } from './automationNodeCatalog';

afterEach(cleanup);

// The shared happy-dom setup installs the globals its existing specs needed.
// Radix focus-scope (Dialog, AlertDialog) constructs a MutationObserver on open
// and Radix Select walks up to HTMLFormElement, so both are lifted off the
// happy-dom window here rather than mutating the shared setup file.
type LiftedGlobals = {
  MutationObserver?: typeof MutationObserver;
  HTMLFormElement?: typeof HTMLFormElement;
};
const happyDomWindow = globalThis.window as unknown as LiftedGlobals;
const testGlobals = globalThis as LiftedGlobals;
if (typeof testGlobals.MutationObserver !== 'function') {
  testGlobals.MutationObserver = happyDomWindow.MutationObserver;
}
if (typeof testGlobals.HTMLFormElement !== 'function') {
  testGlobals.HTMLFormElement = happyDomWindow.HTMLFormElement;
}

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const AUTOMATION_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const ENDPOINT_ID = '44444444-4444-4444-8444-444444444444';
const SIGNING_SECRET = 'whsec_0123456789abcdef0123456789abcdef01';

const automation: Automation = {
  id: AUTOMATION_ID,
  brandId: BRAND_ID,
  name: 'Nightly digest',
  enabled: false,
  isPublished: false,
  workflowStatus: 'draft',
  activeVersionId: null,
  draftVersionId: VERSION_ID,
} as unknown as Automation;

const endpoint: AutomationWebhookEndpoint = {
  id: ENDPOINT_ID,
  publicId: 'hook_public_identifier_1',
  brandId: BRAND_ID,
  automationId: AUTOMATION_ID,
  workflowVersionId: VERSION_ID,
  nodeId: 'trigger-webhook-1',
  name: 'Inbound webhook',
  enabled: true,
  lastReceivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

const destination: AutomationWebhookDestination = {
  id: '55555555-5555-4555-8555-555555555555',
  brandId: BRAND_ID,
  name: 'Ops relay',
  url: 'https://hooks.example.com/continuum',
  method: 'POST',
  enabled: true,
  createdAt: '2026-07-01T00:00:00.000Z',
};

const webhookTriggerNode = () =>
  createAutomationWorkflowNode({
    type: 'trigger.webhook',
    position: { x: 0, y: 0 },
    id: 'trigger-webhook-1',
  });

const stubClient = (overrides: Partial<WebhookManagerClient> = {}): WebhookManagerClient => ({
  createEndpoint: mock(async () => ({ endpoint, signingSecret: SIGNING_SECRET })),
  createDestination: mock(async () => ({ destination, signingSecret: SIGNING_SECRET })),
  rotateSecret: mock(async () => ({ signingSecret: SIGNING_SECRET })),
  ...overrides,
});

const renderWebhookManager = (props: Partial<React.ComponentProps<typeof WebhookManager>> = {}) => {
  const client = props.client ?? stubClient();
  render(
    <TooltipProvider>
      <WebhookManager
        automation={automation}
        versionId={VERSION_ID}
        versionState="draft"
        saveState="saved"
        selected={webhookTriggerNode()}
        locked={false}
        resources={{ endpoints: [], destinations: [] }}
        onRefresh={async () => {}}
        onEndpointCreated={() => {}}
        {...props}
        client={client}
      />
    </TooltipProvider>,
  );
  return client;
};

const openWebhookDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: /Webhooks/ }));
};

describe('webhooks trigger', () => {
  test('is not disabled — the coming-soon gate is gone', () => {
    renderWebhookManager();

    const trigger = screen.getByRole('button', { name: /Webhooks/ }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  test('opens the managed webhooks dialog', async () => {
    renderWebhookManager();
    openWebhookDialog();

    await waitFor(() => expect(screen.getByText('Managed webhooks')).toBeTruthy());
  });
});

describe('outbound webhook node configuration', () => {
  const renderInspector = (node: ReturnType<typeof createAutomationWorkflowNode>) =>
    render(
      <TooltipProvider>
        <WorkflowInspector
          selected={node}
          locked={false}
          validation={{ ok: true, issues: [] }}
          evidence={[]}
          checks={[]}
          actionReceipts={[]}
          sourceCapabilities={null}
          webhookDestinations={[destination]}
          webhookEndpoints={[endpoint]}
          onPatch={() => {}}
          onSelectIssue={() => {}}
          onMessage={() => {}}
        />
      </TooltipProvider>,
    );

  test('a newly created outbound webhook node is enabled and its editor is reachable', () => {
    const node = createAutomationWorkflowNode({
      type: 'action.outbound_webhook',
      position: { x: 0, y: 0 },
      id: 'outbound-1',
    });
    expect(node.disabled).toBe(false);

    renderInspector(node);

    // The destination picker is the editor surface the coming-soon gate hid.
    const picker = screen.getByRole('combobox', { name: /Managed destination/ });
    expect(picker.getAttribute('data-disabled')).toBeNull();
    expect(picker.getAttribute('disabled')).toBeNull();

    // And the disable switch is two-way again, not greyed forever.
    const disableSwitch = screen.getByRole('switch') as HTMLButtonElement;
    expect(disableSwitch.id).toBe('node-disabled-outbound-1');
    expect(disableSwitch.disabled).toBe(false);
    expect(disableSwitch.getAttribute('aria-checked')).toBe('false');
  });

  test('surfaces an unselected destination as needing setup', () => {
    renderInspector(
      createAutomationWorkflowNode({
        type: 'action.outbound_webhook',
        position: { x: 0, y: 0 },
        id: 'outbound-2',
      }),
    );

    expect(screen.getByText('Needs setup')).toBeTruthy();
    expect(screen.getByText(/cannot run or publish until one is chosen/)).toBeTruthy();
  });
});

describe('inbound endpoint creation gating', () => {
  test('is blocked with an explanation when the version is not a draft', async () => {
    renderWebhookManager({ versionState: 'published', saveState: 'saved' });
    openWebhookDialog();

    const create = (await screen.findByRole('button', {
      name: /Create endpoint for/,
    })) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText(/Unpublish this automation first/)).toBeTruthy();
  });

  test('is blocked with an explanation while the draft is saving or dirty', async () => {
    renderWebhookManager({ versionState: 'draft', saveState: 'saving' });
    openWebhookDialog();

    const create = (await screen.findByRole('button', {
      name: /Create endpoint for/,
    })) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText(/Waiting for the draft to save/)).toBeTruthy();
  });

  test('is available once the draft is saved', async () => {
    renderWebhookManager({ versionState: 'draft', saveState: 'saved' });
    openWebhookDialog();

    const create = (await screen.findByRole('button', {
      name: /Create endpoint for/,
    })) as HTMLButtonElement;
    expect(create.disabled).toBe(false);
    expect(
      automationEndpointCreationBlockReason({ versionState: 'draft', saveState: 'saved' }),
    ).toBe(null);
  });

  test('maps the server draft/trigger error codes to the same explanation', () => {
    expect(automationEndpointCreationError(new Error('draft_not_found'))).toContain('Draft saved');
    expect(automationEndpointCreationError(new Error('webhook_trigger_not_found'))).toContain(
      'not in the saved draft yet',
    );
    expect(automationEndpointCreationError(new Error('boom'))).toBe('boom');
  });
});

describe('reveal-once signing secret', () => {
  test('cannot be dismissed until the user acknowledges copying it', async () => {
    renderWebhookManager({ versionState: 'draft', saveState: 'saved' });
    openWebhookDialog();

    fireEvent.click(await screen.findByRole('button', { name: /Create endpoint for/ }));

    const secret = await screen.findByText(SIGNING_SECRET);
    expect(secret).toBeTruthy();

    // Escape must not tear the dialog down while the secret is unacknowledged.
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getByText(SIGNING_SECRET)).toBeTruthy();

    const acknowledge = screen.getByRole('checkbox', { name: /copied it/ });
    fireEvent.click(acknowledge);

    await waitFor(() =>
      expect(canDismissRevealedSecret({ secret: SIGNING_SECRET, acknowledged: true })).toBe(true),
    );
  });

  test('the dismissal guard opens only on acknowledgement', () => {
    expect(canDismissRevealedSecret({ secret: null, acknowledged: false })).toBe(true);
    expect(canDismissRevealedSecret({ secret: SIGNING_SECRET, acknowledged: false })).toBe(false);
    expect(canDismissRevealedSecret({ secret: SIGNING_SECRET, acknowledged: true })).toBe(true);
  });
});

describe('outbound destination URL validation', () => {
  test('rejects an http:// destination client-side, before any request', async () => {
    const client = renderWebhookManager();
    openWebhookDialog();

    const urlField = await screen.findByLabelText('Destination URL');
    fireEvent.change(urlField, { target: { value: 'http://hooks.example.com/continuum' } });

    const create = screen.getByRole('button', {
      name: 'Create signed destination',
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText(/Enter a public HTTPS URL/)).toBeTruthy();
    expect(client.createDestination).not.toHaveBeenCalled();
  });

  test('accepts an https:// destination', async () => {
    renderWebhookManager();
    openWebhookDialog();

    const urlField = await screen.findByLabelText('Destination URL');
    fireEvent.change(urlField, { target: { value: 'https://hooks.example.com/continuum' } });

    const create = screen.getByRole('button', {
      name: 'Create signed destination',
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(false);
  });

  test('validates with the contract rule, not a prefix check', () => {
    expect(automationDestinationUrlError('http://hooks.example.com')).toContain('HTTPS');
    expect(automationDestinationUrlError('https://')).toContain('HTTPS');
    expect(automationDestinationUrlError('https:// not a url')).toContain('HTTPS');
    expect(automationDestinationUrlError('https://hooks.example.com/continuum')).toBe(null);
  });
});

describe('signing secret rotation', () => {
  test('exposes a confirm-gated rotate action per endpoint', async () => {
    const client = renderWebhookManager({
      resources: { endpoints: [endpoint], destinations: [] },
    });
    openWebhookDialog();

    fireEvent.click(
      await screen.findByRole('button', { name: `Rotate ${endpoint.name} signing secret` }),
    );

    expect(await screen.findByText(/stops working immediately/)).toBeTruthy();
    expect(client.rotateSecret).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Rotate secret' }));

    await waitFor(() => expect(client.rotateSecret).toHaveBeenCalledTimes(1));
    expect(client.rotateSecret).toHaveBeenCalledWith({
      automationId: AUTOMATION_ID,
      endpointId: ENDPOINT_ID,
    });
    expect(await screen.findByText(SIGNING_SECRET)).toBeTruthy();
  });
});
