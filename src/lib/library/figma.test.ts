import { afterEach, describe, expect, it, mock } from 'bun:test';

import { listFigmaProjects } from './figma';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Figma Library client', () => {
  it('calls the backend directly with a user JWT and canonical query', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    globalThis.fetch = mock(async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return Response.json({ projects: [{ id: 'project-1', name: 'Campaign', fileCount: 2 }] });
    }) as typeof fetch;

    const projects = await listFigmaProjects(
      '11111111-1111-4111-8111-111111111111',
      'team 1',
      async () => 'user-jwt',
    );
    expect(projects).toEqual([{ id: 'project-1', name: 'Campaign', fileCount: 2 }]);
    expect(requestedUrl).toBe(
      'https://api.example.com/integrations/figma/projects?brandId=11111111-1111-4111-8111-111111111111&teamId=team+1',
    );
    expect((requestedInit?.headers as Record<string, string>).Authorization).toBe('Bearer user-jwt');
  });
});
