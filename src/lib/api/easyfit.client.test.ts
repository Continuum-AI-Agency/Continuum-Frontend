import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock((_options: Record<string, unknown>) => Promise.resolve({}));

mock.module('@/lib/api/http', () => ({ http: { request: requestMock } }));

const { configFixture } = await import(
  '@/components/paid-media/optimizer/dashboard/__fixtures__/easyfitPayload'
);
const { ApiError } = await import('@/lib/api/errors');
const { easyfitConfigResponseSchema, easyfitDashboardResponseSchema } = await import(
  '@continuum/contracts'
);
const { getEasyfitConfig, getEasyfitDashboard, isEasyfitForbidden, putEasyfitConfig } =
  await import('./easyfit.client');

describe('easyfit.client', () => {
  beforeEach(() => requestMock.mockClear());

  it('reads the dashboard through the contract envelope', async () => {
    await getEasyfitDashboard();

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/easyfit/dashboard',
        schema: easyfitDashboardResponseSchema,
      }),
    );
  });

  it('reads and writes the config with the contract schema on both sides', async () => {
    await getEasyfitConfig();
    await putEasyfitConfig(configFixture);

    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/easyfit/config',
      schema: easyfitConfigResponseSchema,
    });
    expect(requestMock.mock.calls[1]?.[0]).toMatchObject({
      path: '/easyfit/config',
      method: 'PUT',
      body: configFixture,
    });
  });

  it('refuses to send a config that breaks the contract', () => {
    const broken = {
      ...configFixture,
      piloto: { ...configFixture.piloto, moneda: 'USD' },
    } as unknown as typeof configFixture;

    expect(() => putEasyfitConfig(broken)).toThrow();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('recognises the 403 the Backend answers to a role that may not edit', () => {
    expect(isEasyfitForbidden(new ApiError('forbidden', 403))).toBe(true);
    expect(isEasyfitForbidden(new ApiError('failed', 500))).toBe(false);
    expect(isEasyfitForbidden(new Error('x'))).toBe(false);
  });
});
