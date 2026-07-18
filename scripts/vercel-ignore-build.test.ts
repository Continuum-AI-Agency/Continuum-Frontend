import { describe, expect, it } from 'bun:test';
import { isNonRuntimePath, shouldIgnoreBuild } from './vercel-ignore-build.mjs';

describe('Vercel ignored-build classification', () => {
  it('skips only changes that cannot affect the deployed application', () => {
    expect(
      shouldIgnoreBuild([
        'README.md',
        'docs/deployment.md',
        'src/components/Button.test.tsx',
        'e2e/__screenshots__/login.png',
      ]),
    ).toBe(true);
  });

  it('builds when any runtime file changes', () => {
    expect(shouldIgnoreBuild(['docs/deployment.md', 'src/app/layout.tsx'])).toBe(false);
    expect(shouldIgnoreBuild(['package.json'])).toBe(false);
    expect(shouldIgnoreBuild(['public/logo.svg'])).toBe(false);
  });

  it('builds when the changed-file set is empty or indeterminate', () => {
    expect(shouldIgnoreBuild([])).toBe(false);
  });

  it('recognizes supported non-runtime paths without hiding source files', () => {
    expect(isNonRuntimePath('plans/vercel.md')).toBe(true);
    expect(isNonRuntimePath('src/lib/cache.bench.ts')).toBe(true);
    expect(isNonRuntimePath('src/lib/cache.ts')).toBe(false);
  });
});
