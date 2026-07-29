// Exercises the automations HTTP surface through the REAL http.request path.
// Only global.fetch and the Supabase-backed access-token reader are stubbed, so
// URL construction, Authorization attachment, ApiError mapping and the strict
// @continuum/contracts schema.parse all run for real. The parse step is the
// point: every contracts envelope is .strict(), so a backend that grows an
// unexpected field must throw here rather than render a blank screen.
// deleteAutomation is the lone exception — it is the one request function with
// no contracts schema, parsing an inline, non-strict z.object({ ok: boolean }) —
// so its case asserts a type violation rather than an unexpected key.
//
// getBrowserAccessToken is stubbed (rather than the Supabase client beneath it)
// because it is the auth-token source, not part of the HTTP layer under test,
// and its session-hydration retry would add a 300ms delay to every case.

import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  type Automation,
  type AutomationCapabilitiesResponse,
  type AutomationNodeRun,
  type AutomationRun,
  type AutomationWebhookDestination,
  type AutomationWebhookEndpoint,
  type AutomationWorkflowDefinition,
  type AutomationWorkflowValidation,
  type AutomationWorkflowVersion,
  automationWorkflowDefinitionSchema,
  createAutomationWebhookDestinationRequestSchema,
  createAutomationWebhookEndpointRequestSchema,
  createWorkflowAutomationRequestSchema,
  type ListAutomationTemplatesResponse,
  type RecipientCandidate,
  saveAutomationDraftRequestSchema,
  type TestAutomationWorkflowResponse,
  testAutomationWorkflowRequestSchema,
  updateAutomationRequestSchema,
} from '@continuum/contracts';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api/errors';

const ACCESS_TOKEN = 'automations-access-token';
const API_BASE_URL = 'https://api.automations.test';
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

process.env.NEXT_PUBLIC_API_URL = API_BASE_URL;

// Destructured before the stub is installed so afterAll can hand the real
// implementation back: mock.module is process-wide in Bun and rewrites an
// already-loaded module's exports in place, so only a captured reference
// survives the stub.
const { getBrowserAccessToken: actualGetBrowserAccessToken } = await import(
  '@/lib/auth/getBrowserAccessToken'
);

mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async (): Promise<string> => ACCESS_TOKEN,
}));

const {
  createAutomationWebhookDestination,
  createAutomationWebhookEndpoint,
  createWorkflowAutomation,
  deleteAutomation,
  fetchAutomation,
  fetchAutomationCapabilities,
  fetchAutomationRun,
  fetchAutomationRunDetail,
  fetchAutomationRuns,
  fetchAutomations,
  fetchAutomationTemplates,
  fetchAutomationWebhookResources,
  fetchAutomationWorkflow,
  fetchRecipientCandidates,
  publishAutomationWorkflow,
  runAutomationNow,
  saveAutomationWorkflowDraft,
  testAutomationWorkflow,
  unpublishAutomationWorkflow,
  updateAutomation,
  validateAutomationWorkflowForPublish,
} = await import('@/lib/automations/automations');

type RecordedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

const recordedRequests: RecordedRequest[] = [];
const originalFetch = globalThis.fetch;

function stubFetchJson(payload: unknown, status = 200): void {
  const stub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    recordedRequests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  globalThis.fetch = stub as unknown as typeof globalThis.fetch;
}

function lastRequest(): RecordedRequest {
  const request = recordedRequests.at(-1);
  if (!request) throw new Error('no fetch call was recorded');
  return request;
}

async function captureRejection(invoke: () => Promise<unknown>): Promise<unknown> {
  try {
    await invoke();
  } catch (error) {
    return error;
  }
  throw new Error('expected the request to reject, but it resolved');
}

beforeEach(() => {
  recordedRequests.length = 0;
  process.env.NEXT_PUBLIC_API_URL = API_BASE_URL;
});

// Bun shares one process across test files, so the global fetch stub, the API
// base URL and the access-token module are all handed back rather than left
// pointing at this file's fixtures.
afterAll(() => {
  globalThis.fetch = originalFetch;
  mock.module('@/lib/auth/getBrowserAccessToken', () => ({
    getBrowserAccessToken: actualGetBrowserAccessToken,
  }));
  if (originalApiBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalApiBaseUrl;
  }
});

const BRAND_ID = '22222222-2222-4222-8222-222222222222';
const AUTOMATION_ID = '33333333-3333-4333-8333-333333333333';
const WORKFLOW_VERSION_ID = '44444444-4444-4444-8444-444444444444';

const workflowDefinition: AutomationWorkflowDefinition = automationWorkflowDefinitionSchema.parse({
  schemaVersion: 3,
  nodes: [
    { id: 'trigger_1', type: 'trigger.manual', label: 'Manual trigger', position: { x: 0, y: 0 } },
    {
      id: 'agent_1',
      type: 'agent',
      label: 'Jaina',
      position: { x: 260, y: 0 },
      config: { agent: 'jaina' },
    },
  ],
  edges: [{ id: 'edge_1', source: 'trigger_1', target: 'agent_1' }],
});

const automationFixture: Automation = {
  id: AUTOMATION_ID,
  brandId: BRAND_ID,
  createdBy: 'user_1',
  name: 'Weekly paid recap',
  agent: 'jaina',
  prompt: 'Summarise last week of paid performance.',
  schedule: { kind: 'weekly', dayOfWeek: 1, time: '09:30', timezone: 'America/New_York' },
  recipients: { memberUserIds: ['user_1'], externalEmails: ['ops@example.com'] },
  enabled: true,
  isPublished: true,
  runAsUserId: null,
  workflowStatus: 'published',
  activeVersionId: WORKFLOW_VERSION_ID,
  draftVersionId: null,
  nextRunAt: '2026-08-03T13:30:00.000Z',
  lastRunId: 'run_1',
  lastRunAt: '2026-07-27T13:30:00.000Z',
  lastRunStatus: 'completed',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-27T13:31:00.000Z',
};

const recipientCandidateFixture: RecipientCandidate = {
  userId: 'user_1',
  email: 'ops@example.com',
  role: 'admin',
};

const automationRunFixture: AutomationRun = {
  runId: 'run_1',
  automationId: AUTOMATION_ID,
  brandId: BRAND_ID,
  trigger: 'schedule',
  requestedBy: null,
  status: 'completed',
  executionMode: 'production',
  workflowVersionId: WORKFLOW_VERSION_ID,
  scheduledFor: '2026-07-27T13:30:00.000Z',
  attempts: 1,
  output: { text: '# Weekly recap' },
  errorMessage: null,
  emailStatus: 'sent',
  emailedAt: '2026-07-27T13:31:00.000Z',
  emailError: null,
  enqueuedAt: '2026-07-27T13:30:00.000Z',
  startedAt: '2026-07-27T13:30:05.000Z',
  completedAt: '2026-07-27T13:30:55.000Z',
};

const nodeRunFixture: AutomationNodeRun = {
  id: 'node_run_1',
  runId: 'run_1',
  nodeId: 'agent_1',
  nodeType: 'agent',
  attempt: 1,
  status: 'completed',
  selectedHandle: 'output',
  input: null,
  output: { text: '# Weekly recap' },
  errorMessage: null,
  durationMs: 4200,
  startedAt: '2026-07-27T13:30:05.000Z',
  completedAt: '2026-07-27T13:30:55.000Z',
};

const validationFixture: AutomationWorkflowValidation = {
  ok: true,
  issues: [],
  topologicalOrder: ['trigger_1', 'agent_1'],
};

const workflowVersionFixture: AutomationWorkflowVersion = {
  id: WORKFLOW_VERSION_ID,
  automationId: AUTOMATION_ID,
  version: 4,
  state: 'draft',
  definition: workflowDefinition,
  definitionHash: 'sha256:8f1c0a',
  revision: 7,
  createdBy: 'user_1',
  publishedBy: null,
  createdAt: '2026-07-27T12:00:00.000Z',
  publishedAt: null,
};

const capabilitiesFixture: AutomationCapabilitiesResponse = {
  sources: [
    { source: 'brand_knowledge', lifecycle: 'production', availability: 'ready', reason: null },
    {
      source: 'live_web',
      lifecycle: 'preview',
      availability: 'unavailable',
      reason: 'Live web search is not enabled for this brand.',
    },
  ],
  mcpReadTools: [
    {
      name: 'analytics_query',
      description: 'Reads paid and organic analytics for the selected brand.',
      schemaHash: 'f'.repeat(64),
    },
  ],
  generatedAt: '2026-07-28T00:00:00.000Z',
};

const templatesFixture: ListAutomationTemplatesResponse = {
  templates: [
    {
      id: 'weekly-paid-recap',
      name: 'Weekly paid recap',
      description: 'Emails a paid-performance summary every Monday.',
      definition: workflowDefinition,
    },
  ],
};

const webhookEndpointFixture: AutomationWebhookEndpoint = {
  id: '11111111-1111-4111-8111-111111111111',
  publicId: 'whk_01h8xabcdef12345',
  brandId: BRAND_ID,
  automationId: AUTOMATION_ID,
  workflowVersionId: WORKFLOW_VERSION_ID,
  nodeId: 'trigger_webhook_1',
  name: 'Shopify order created',
  enabled: true,
  lastReceivedAt: null,
  createdAt: '2026-07-27T12:00:00.000Z',
};

const webhookDestinationFixture: AutomationWebhookDestination = {
  id: '55555555-5555-4555-8555-555555555555',
  brandId: BRAND_ID,
  name: 'Ops Slack relay',
  url: 'https://hooks.example.com/automations',
  method: 'POST',
  enabled: true,
  createdAt: '2026-07-27T12:00:00.000Z',
};

const SIGNING_SECRET = 'whsec_0123456789abcdef0123456789abcdef';

const testWorkflowResponseFixture: TestAutomationWorkflowResponse = {
  runId: 'run_test_1',
  validation: validationFixture,
  nodeExecutions: [
    {
      nodeId: 'agent_1',
      nodeType: 'agent',
      status: 'completed',
      selectedHandle: 'output',
      errorMessage: null,
      durationMs: 1200,
    },
  ],
  evidence: [
    {
      seq: 1,
      nodeId: 'agent_1',
      eventType: 'agent.output',
      status: 'completed',
      occurredAt: '2026-07-27T13:30:10.000Z',
      redacted: true,
    },
  ],
  checks: [
    {
      id: 'check_report_sections',
      name: 'Report contains every required section',
      status: 'pass',
      detail: 'All 3 required sections present.',
    },
  ],
  actionReceipts: [
    {
      nodeId: 'email_1',
      actionKind: 'action.email',
      effect: 'simulated',
      status: 'completed',
      summary: 'Would email 2 recipients.',
    },
  ],
};

describe('fetchAutomationCapabilities', () => {
  it('GETs the brand-scoped capabilities route with an encoded brandId and parses the envelope', async () => {
    stubFetchJson(capabilitiesFixture);

    const result = await fetchAutomationCapabilities('brand 1/2');

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/capabilities?brandId=brand%201%2F2`,
    );
    expect(lastRequest().method).toBe('GET');
    expect(lastRequest().body).toBeUndefined();
    expect(lastRequest().headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(result).toEqual(capabilitiesFixture);
  });
});

describe('fetchAutomations', () => {
  it('GETs the brand automation list and unwraps the automations array', async () => {
    stubFetchJson({ automations: [automationFixture] });

    const result = await fetchAutomations(BRAND_ID);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations?brandId=${BRAND_ID}`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual([automationFixture]);
  });
});

describe('fetchAutomation', () => {
  it('GETs one automation by encoded id and unwraps the automation', async () => {
    stubFetchJson({ automation: automationFixture });

    const result = await fetchAutomation('automation/1');

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/automation%2F1`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual(automationFixture);
  });
});

describe('createWorkflowAutomation', () => {
  it('POSTs the workflow-automation request the backend schema accepts', async () => {
    stubFetchJson({ automation: automationFixture });
    const input = {
      brandId: BRAND_ID,
      name: 'Weekly paid recap',
      definition: workflowDefinition,
    };

    const result = await createWorkflowAutomation(input);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/workflows`);
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().headers.get('content-type')).toBe('application/json');
    expect(lastRequest().body).toEqual(input);
    expect(() => createWorkflowAutomationRequestSchema.parse(lastRequest().body)).not.toThrow();
    expect(result).toEqual(automationFixture);
  });
});

describe('fetchAutomationTemplates', () => {
  it('GETs the brand template catalog and unwraps the templates array', async () => {
    stubFetchJson(templatesFixture);

    const result = await fetchAutomationTemplates(BRAND_ID);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/templates?brandId=${BRAND_ID}`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual(templatesFixture.templates);
  });
});

describe('updateAutomation', () => {
  it('PATCHes the automation with the partial the backend schema accepts', async () => {
    stubFetchJson({ automation: { ...automationFixture, enabled: false } });
    const patch = { enabled: false };

    const result = await updateAutomation(AUTOMATION_ID, patch);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/${AUTOMATION_ID}`);
    expect(lastRequest().method).toBe('PATCH');
    expect(lastRequest().body).toEqual(patch);
    expect(() => updateAutomationRequestSchema.parse(lastRequest().body)).not.toThrow();
    expect(result.enabled).toBe(false);
  });
});

describe('deleteAutomation', () => {
  it('DELETEs the encoded automation id with no body and resolves nothing', async () => {
    stubFetchJson({ ok: true });

    const result = await deleteAutomation('automation/1');

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/automation%2F1`);
    expect(lastRequest().method).toBe('DELETE');
    expect(lastRequest().body).toBeUndefined();
    expect(lastRequest().headers.get('content-type')).toBeNull();
    expect(lastRequest().headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(result).toBeUndefined();
  });
});

describe('runAutomationNow', () => {
  it('POSTs run-now without a body and returns the enqueued run id', async () => {
    stubFetchJson({ runId: 'run_2' }, 202);

    const result = await runAutomationNow(AUTOMATION_ID);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/${AUTOMATION_ID}/run-now`);
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().body).toBeUndefined();
    expect(lastRequest().headers.get('content-type')).toBeNull();
    expect(lastRequest().headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(result).toBe('run_2');
  });
});

describe('fetchAutomationRuns', () => {
  it('GETs the run history and unwraps the runs array', async () => {
    stubFetchJson({ runs: [automationRunFixture] });

    const result = await fetchAutomationRuns(AUTOMATION_ID);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/${AUTOMATION_ID}/runs`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual([automationRunFixture]);
  });
});

describe('fetchAutomationRunDetail', () => {
  it('GETs a single run from the run-scoped route and keeps run plus nodeRuns', async () => {
    stubFetchJson({ run: automationRunFixture, nodeRuns: [nodeRunFixture] });

    const result = await fetchAutomationRunDetail('run 1');

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/runs/run%201`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual({ run: automationRunFixture, nodeRuns: [nodeRunFixture] });
  });
});

describe('fetchAutomationRun', () => {
  it('reuses the run-detail route but narrows the envelope to the run alone', async () => {
    stubFetchJson({ run: automationRunFixture, nodeRuns: [nodeRunFixture] });

    const result = await fetchAutomationRun('run 1');

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/runs/run%201`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual(automationRunFixture);
    expect(Object.hasOwn(result, 'nodeRuns')).toBe(false);
  });
});

describe('fetchRecipientCandidates', () => {
  it('GETs the brand recipient picker feed and unwraps the candidates array', async () => {
    stubFetchJson({ candidates: [recipientCandidateFixture] });

    const result = await fetchRecipientCandidates('brand 1/2');

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/recipient-candidates?brandId=brand%201%2F2`,
    );
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual([recipientCandidateFixture]);
  });
});

describe('fetchAutomationWorkflow', () => {
  it('GETs the workflow envelope and parses version plus validation', async () => {
    stubFetchJson({ version: workflowVersionFixture, validation: validationFixture });

    const result = await fetchAutomationWorkflow(AUTOMATION_ID);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/${AUTOMATION_ID}/workflow`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual({ version: workflowVersionFixture, validation: validationFixture });
  });
});

describe('saveAutomationWorkflowDraft', () => {
  it('PUTs the draft with expectedRevision so the optimistic-concurrency check can run', async () => {
    stubFetchJson({ version: workflowVersionFixture, validation: validationFixture });
    const input = { definition: workflowDefinition, expectedRevision: 7 };

    const result = await saveAutomationWorkflowDraft(AUTOMATION_ID, input);

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/${AUTOMATION_ID}/workflow/draft`,
    );
    expect(lastRequest().method).toBe('PUT');
    expect(lastRequest().headers.get('content-type')).toBe('application/json');
    expect(lastRequest().body).toEqual(input);
    expect(saveAutomationDraftRequestSchema.parse(lastRequest().body).expectedRevision).toBe(7);
    expect(result.version.revision).toBe(7);
  });

  it('sends expectedRevision 0 for a first save rather than dropping the field', async () => {
    stubFetchJson({ version: workflowVersionFixture, validation: validationFixture });

    await saveAutomationWorkflowDraft(AUTOMATION_ID, {
      definition: workflowDefinition,
      expectedRevision: 0,
    });

    const body = lastRequest().body as Record<string, unknown>;
    expect(Object.hasOwn(body, 'expectedRevision')).toBe(true);
    expect(body.expectedRevision).toBe(0);
  });
});

describe('validateAutomationWorkflowForPublish', () => {
  it('POSTs the definition nested under a definition key and returns the bare validation', async () => {
    stubFetchJson(validationFixture);

    const result = await validateAutomationWorkflowForPublish(AUTOMATION_ID, workflowDefinition);

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/${AUTOMATION_ID}/workflow/validate`,
    );
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().headers.get('content-type')).toBe('application/json');
    expect(lastRequest().body).toEqual({ definition: workflowDefinition });
    expect(result).toEqual(validationFixture);
  });

  // The publish preflight gate has to render blocking issues, so a failing
  // validation must resolve with them rather than reject.
  it('resolves with the blocking issues when the workflow fails validation', async () => {
    const failedValidation: AutomationWorkflowValidation = {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'unreachable_node',
          message: 'node agent_1 is not reachable from any trigger',
          nodeId: 'agent_1',
        },
      ],
      topologicalOrder: [],
    };
    stubFetchJson(failedValidation);

    const result = await validateAutomationWorkflowForPublish(AUTOMATION_ID, workflowDefinition);

    expect(result).toEqual(failedValidation);
  });
});

describe('publishAutomationWorkflow', () => {
  // `actionNodeIds` is the backend's own list of the nodes publishing just armed
  // for live action. It was parsed and dropped, which left the pre-publish
  // surface with no way to say what it had granted; it is now returned intact.
  it('POSTs publish and returns the granted action node ids alongside version and validation', async () => {
    stubFetchJson({
      version: workflowVersionFixture,
      validation: validationFixture,
      actionNodeIds: ['email_1'],
    });

    const result = await publishAutomationWorkflow(AUTOMATION_ID);

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/${AUTOMATION_ID}/workflow/publish`,
    );
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().body).toBeUndefined();
    expect(result).toEqual({
      version: workflowVersionFixture,
      validation: validationFixture,
      actionNodeIds: ['email_1'],
    });
  });
});

describe('unpublishAutomationWorkflow', () => {
  it('POSTs unpublish without a body and parses the demoted version plus validation', async () => {
    const demotedVersion = {
      ...workflowVersionFixture,
      state: 'draft' as const,
      publishedBy: null,
      publishedAt: null,
    };
    stubFetchJson({ version: demotedVersion, validation: validationFixture });

    const result = await unpublishAutomationWorkflow(AUTOMATION_ID);

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/${AUTOMATION_ID}/workflow/unpublish`,
    );
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().body).toBeUndefined();
    expect(lastRequest().headers.get('content-type')).toBeNull();
    expect(result).toEqual({ version: demotedVersion, validation: validationFixture });
  });
});

describe('testAutomationWorkflow', () => {
  it('POSTs the definition with the workspace-test trigger payload the route expects', async () => {
    stubFetchJson(testWorkflowResponseFixture);

    const result = await testAutomationWorkflow(AUTOMATION_ID, workflowDefinition);

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/${AUTOMATION_ID}/workflow/test`,
    );
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().body).toEqual({
      definition: workflowDefinition,
      triggerPayload: { source: 'workspace-test', trigger: 'test' },
    });
    expect(() => testAutomationWorkflowRequestSchema.parse(lastRequest().body)).not.toThrow();
    expect(result).toEqual(testWorkflowResponseFixture);
  });

  it('adds triggerNodeId to the trigger payload when a specific trigger is exercised', async () => {
    stubFetchJson(testWorkflowResponseFixture);

    await testAutomationWorkflow(AUTOMATION_ID, workflowDefinition, 'trigger_1');

    expect(lastRequest().body).toEqual({
      definition: workflowDefinition,
      triggerPayload: {
        source: 'workspace-test',
        trigger: 'test',
        triggerNodeId: 'trigger_1',
      },
    });
    expect(() => testAutomationWorkflowRequestSchema.parse(lastRequest().body)).not.toThrow();
  });
});

describe('fetchAutomationWebhookResources', () => {
  it('GETs the brand webhook resources and parses endpoints plus destinations', async () => {
    stubFetchJson({
      endpoints: [webhookEndpointFixture],
      destinations: [webhookDestinationFixture],
    });

    const result = await fetchAutomationWebhookResources(BRAND_ID);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/webhooks?brandId=${BRAND_ID}`);
    expect(lastRequest().method).toBe('GET');
    expect(result).toEqual({
      endpoints: [webhookEndpointFixture],
      destinations: [webhookDestinationFixture],
    });
  });
});

describe('createAutomationWebhookEndpoint', () => {
  it('POSTs to the automation-scoped endpoint route without leaking the automationId into the body', async () => {
    stubFetchJson({ endpoint: webhookEndpointFixture, signingSecret: SIGNING_SECRET });

    const result = await createAutomationWebhookEndpoint({
      automationId: AUTOMATION_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
      nodeId: 'trigger_webhook_1',
      name: 'Shopify order created',
      payloadSchema: { type: 'object' },
    });

    expect(lastRequest().url).toBe(
      `${API_BASE_URL}/api/automations/${AUTOMATION_ID}/webhook-endpoints`,
    );
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().body).toEqual({
      workflowVersionId: WORKFLOW_VERSION_ID,
      nodeId: 'trigger_webhook_1',
      name: 'Shopify order created',
      payloadSchema: { type: 'object' },
    });
    expect(() =>
      createAutomationWebhookEndpointRequestSchema.parse(lastRequest().body),
    ).not.toThrow();
    expect(result).toEqual({ endpoint: webhookEndpointFixture, signingSecret: SIGNING_SECRET });
  });
});

describe('createAutomationWebhookDestination', () => {
  it('POSTs the destination to the brand-scoped route and returns the signing secret', async () => {
    stubFetchJson({ destination: webhookDestinationFixture, signingSecret: SIGNING_SECRET });
    const input = {
      brandId: BRAND_ID,
      name: 'Ops Slack relay',
      url: 'https://hooks.example.com/automations',
      method: 'POST' as const,
    };

    const result = await createAutomationWebhookDestination(input);

    expect(lastRequest().url).toBe(`${API_BASE_URL}/api/automations/webhook-destinations`);
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().body).toEqual(input);
    expect(() =>
      createAutomationWebhookDestinationRequestSchema.parse(lastRequest().body),
    ).not.toThrow();
    expect(result).toEqual({
      destination: webhookDestinationFixture,
      signingSecret: SIGNING_SECRET,
    });
  });
});

// One entry per request function that issues its own fetch — fetchAutomationRun
// is the only omission, and only because it delegates to
// fetchAutomationRunDetail, whose entry already covers the parse.
// `corruptedPayload` is the shape a drifted backend would realistically send;
// every one of them must reject rather than hand a half-typed object to the UI.
type EndpointCase = {
  readonly label: string;
  readonly invoke: () => Promise<unknown>;
  readonly corruption: string;
  readonly corruptedPayload: unknown;
  readonly unrecognizedKey?: string;
};

const endpointCases: readonly EndpointCase[] = [
  {
    label: 'fetchAutomationCapabilities',
    invoke: () => fetchAutomationCapabilities(BRAND_ID),
    corruption: 'carries an unexpected top-level field',
    corruptedPayload: { ...capabilitiesFixture, refreshedAt: '2026-07-28T00:05:00.000Z' },
    unrecognizedKey: 'refreshedAt',
  },
  {
    label: 'fetchAutomations',
    invoke: () => fetchAutomations(BRAND_ID),
    corruption: 'adds an unexpected field to an automation',
    corruptedPayload: { automations: [{ ...automationFixture, cadence: 'weekly' }] },
    unrecognizedKey: 'cadence',
  },
  {
    label: 'fetchAutomation',
    invoke: () => fetchAutomation(AUTOMATION_ID),
    corruption: 'adds an unexpected field to the nested schedule',
    corruptedPayload: {
      automation: {
        ...automationFixture,
        schedule: { ...automationFixture.schedule, cron: '30 9 * * 1' },
      },
    },
    unrecognizedKey: 'cron',
  },
  {
    label: 'createWorkflowAutomation',
    invoke: () =>
      createWorkflowAutomation({
        brandId: BRAND_ID,
        name: 'Weekly paid recap',
        definition: workflowDefinition,
      }),
    corruption: 'wraps the automation alongside an unexpected sibling field',
    corruptedPayload: { automation: automationFixture, warnings: [] },
    unrecognizedKey: 'warnings',
  },
  {
    label: 'fetchAutomationTemplates',
    invoke: () => fetchAutomationTemplates(BRAND_ID),
    corruption: 'adds an unexpected field to a template',
    corruptedPayload: {
      templates: [{ ...templatesFixture.templates[0], category: 'paid' }],
    },
    unrecognizedKey: 'category',
  },
  {
    label: 'updateAutomation',
    invoke: () => updateAutomation(AUTOMATION_ID, { enabled: false }),
    corruption: 'returns a string where the contract requires a boolean',
    corruptedPayload: { automation: { ...automationFixture, enabled: 'false' } },
  },
  {
    label: 'deleteAutomation',
    invoke: () => deleteAutomation(AUTOMATION_ID),
    // The one endpoint parsing an inline, non-strict z.object, so an extra key
    // would slip through here; a type violation is what it can still catch.
    corruption: 'returns a non-boolean ok flag',
    corruptedPayload: { ok: 'yes' },
  },
  {
    label: 'runAutomationNow',
    invoke: () => runAutomationNow(AUTOMATION_ID),
    corruption: 'adds an unexpected status field beside runId',
    corruptedPayload: { runId: 'run_2', status: 'queued' },
    unrecognizedKey: 'status',
  },
  {
    label: 'fetchAutomationRuns',
    invoke: () => fetchAutomationRuns(AUTOMATION_ID),
    corruption: 'adds an unexpected field to a run',
    corruptedPayload: { runs: [{ ...automationRunFixture, durationMs: 50_000 }] },
    unrecognizedKey: 'durationMs',
  },
  {
    label: 'fetchAutomationRunDetail',
    invoke: () => fetchAutomationRunDetail('run_1'),
    corruption: 'adds an unexpected field to a node run',
    corruptedPayload: {
      run: automationRunFixture,
      nodeRuns: [{ ...nodeRunFixture, retryOf: null }],
    },
    unrecognizedKey: 'retryOf',
  },
  {
    label: 'fetchRecipientCandidates',
    invoke: () => fetchRecipientCandidates(BRAND_ID),
    corruption: 'adds an unexpected field to a candidate',
    corruptedPayload: { candidates: [{ ...recipientCandidateFixture, displayName: 'Ops' }] },
    unrecognizedKey: 'displayName',
  },
  {
    label: 'fetchAutomationWorkflow',
    invoke: () => fetchAutomationWorkflow(AUTOMATION_ID),
    corruption: 'adds an unexpected field to the workflow version',
    corruptedPayload: {
      version: { ...workflowVersionFixture, notes: 'autosaved' },
      validation: validationFixture,
    },
    unrecognizedKey: 'notes',
  },
  {
    label: 'saveAutomationWorkflowDraft',
    invoke: () =>
      saveAutomationWorkflowDraft(AUTOMATION_ID, {
        definition: workflowDefinition,
        expectedRevision: 7,
      }),
    corruption: 'adds an unexpected field to a node inside the returned definition',
    corruptedPayload: {
      version: {
        ...workflowVersionFixture,
        definition: {
          ...workflowDefinition,
          nodes: [{ ...workflowDefinition.nodes[0], pinned: true }, workflowDefinition.nodes[1]],
        },
      },
      validation: validationFixture,
    },
    unrecognizedKey: 'pinned',
  },
  {
    label: 'validateAutomationWorkflowForPublish',
    invoke: () => validateAutomationWorkflowForPublish(AUTOMATION_ID, workflowDefinition),
    corruption: 'reports an issue code outside the contract enum',
    corruptedPayload: {
      ok: false,
      issues: [{ severity: 'error', code: 'unknown_trigger', message: 'no trigger node' }],
      topologicalOrder: [],
    },
  },
  {
    label: 'unpublishAutomationWorkflow',
    invoke: () => unpublishAutomationWorkflow(AUTOMATION_ID),
    corruption: 'drops the validation block from the envelope',
    corruptedPayload: { version: workflowVersionFixture },
  },
  {
    label: 'publishAutomationWorkflow',
    invoke: () => publishAutomationWorkflow(AUTOMATION_ID),
    corruption: 'omits the required actionNodeIds grant list',
    corruptedPayload: { version: workflowVersionFixture, validation: validationFixture },
  },
  {
    label: 'testAutomationWorkflow',
    invoke: () => testAutomationWorkflow(AUTOMATION_ID, workflowDefinition),
    corruption: 'reports a node status outside the contract enum',
    corruptedPayload: {
      ...testWorkflowResponseFixture,
      nodeExecutions: [{ ...testWorkflowResponseFixture.nodeExecutions[0], status: 'errored' }],
    },
  },
  {
    label: 'fetchAutomationWebhookResources',
    invoke: () => fetchAutomationWebhookResources(BRAND_ID),
    corruption: 'adds an unexpected field to a webhook endpoint',
    corruptedPayload: {
      endpoints: [{ ...webhookEndpointFixture, secretPreview: 'whsec_012…' }],
      destinations: [webhookDestinationFixture],
    },
    unrecognizedKey: 'secretPreview',
  },
  {
    label: 'createAutomationWebhookEndpoint',
    invoke: () =>
      createAutomationWebhookEndpoint({
        automationId: AUTOMATION_ID,
        workflowVersionId: WORKFLOW_VERSION_ID,
        nodeId: 'trigger_webhook_1',
        name: 'Shopify order created',
        payloadSchema: {},
      }),
    corruption: 'returns a signing secret shorter than the contract minimum',
    corruptedPayload: { endpoint: webhookEndpointFixture, signingSecret: 'whsec_short' },
  },
  {
    label: 'createAutomationWebhookDestination',
    invoke: () =>
      createAutomationWebhookDestination({
        brandId: BRAND_ID,
        name: 'Ops Slack relay',
        url: 'https://hooks.example.com/automations',
        method: 'POST',
      }),
    corruption: 'returns a destination url that is not a url',
    corruptedPayload: {
      destination: { ...webhookDestinationFixture, url: 'hooks.example.com/automations' },
      signingSecret: SIGNING_SECRET,
    },
  },
];

describe('strict contract enforcement', () => {
  for (const endpoint of endpointCases) {
    it(`${endpoint.label} throws when the response ${endpoint.corruption}`, async () => {
      stubFetchJson(endpoint.corruptedPayload);

      const error = await captureRejection(endpoint.invoke);

      expect(error).toBeInstanceOf(ZodError);
      const issues = (error as ZodError).issues;
      expect(issues.length).toBeGreaterThan(0);
      if (endpoint.unrecognizedKey) {
        expect(
          issues.some(
            (issue) =>
              issue.code === 'unrecognized_keys' &&
              issue.keys.includes(endpoint.unrecognizedKey as string),
          ),
        ).toBe(true);
      }
    });
  }
});

// Failure mapping lives in http.request/toApiError and is identical for every
// endpoint, so one representative case covers it; iterating the endpoint table
// here would restate the same four facts with no discriminating power. What
// does differ per endpoint — the conflict a specific route raises — gets its
// own case.
describe('API error propagation', () => {
  it('surfaces the upstream status, code and payload instead of parsing the body', async () => {
    const failurePayload = {
      error: 'workflow_invalid',
      code: 'WORKFLOW_INVALID',
      detail: 'node agent_1 is not reachable from any trigger',
    };
    stubFetchJson(failurePayload, 422);

    const error = await captureRejection(() =>
      saveAutomationWorkflowDraft(AUTOMATION_ID, {
        definition: workflowDefinition,
        expectedRevision: 7,
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    // The failure body cannot satisfy the success schema, so this also pins the
    // ordering: the status check runs before schema.parse ever sees the body.
    expect(error).not.toBeInstanceOf(ZodError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(422);
    expect(apiError.code).toBe('WORKFLOW_INVALID');
    expect(apiError.message).toBe('workflow_invalid');
    expect(apiError.payload).toEqual(failurePayload);
  });

  it('propagates a 409 run-in-progress conflict from run-now with its detail intact', async () => {
    const conflict = { error: 'run_in_progress', detail: 'a run is already queued or running' };
    stubFetchJson(conflict, 409);

    const error = await captureRejection(() => runAutomationNow(AUTOMATION_ID));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe('run_in_progress');
    expect((error as ApiError).payload).toEqual(conflict);
  });

  it('falls back to the HTTP status line when the failure body is not JSON', async () => {
    globalThis.fetch = (async () =>
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof globalThis.fetch;

    const error = await captureRejection(() => fetchAutomations(BRAND_ID));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toBe('502 Bad Gateway');
  });
});
