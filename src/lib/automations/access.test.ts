import { describe, expect, test } from 'bun:test';
import { canAccessAutomations, resolveAutomationDeploymentEnvironment } from './access';

describe('automation rollout access', () => {
  test('gates production for non-admin users', () => {
    expect(canAccessAutomations({ isAdmin: false, environment: 'production' })).toBe(false);
    expect(canAccessAutomations({ isAdmin: true, environment: 'production' })).toBe(true);
  });

  test('allows development and preview users', () => {
    expect(canAccessAutomations({ isAdmin: false, environment: 'development' })).toBe(true);
    expect(canAccessAutomations({ isAdmin: false, environment: 'preview' })).toBe(true);
  });

  test('uses Vercel deployment identity before NODE_ENV', () => {
    expect(
      resolveAutomationDeploymentEnvironment({
        nodeEnv: 'production',
        vercelEnv: 'preview',
        siteUrl: 'https://app.trycontinuum.ai',
      }),
    ).toBe('preview');
  });

  test('allows local production builds and identifies the production app host', () => {
    expect(
      resolveAutomationDeploymentEnvironment({
        nodeEnv: 'production',
        siteUrl: 'http://localhost:3000',
      }),
    ).toBe('preview');
    expect(
      resolveAutomationDeploymentEnvironment({
        nodeEnv: 'production',
        siteUrl: 'https://app.trycontinuum.ai',
      }),
    ).toBe('production');
  });
});
