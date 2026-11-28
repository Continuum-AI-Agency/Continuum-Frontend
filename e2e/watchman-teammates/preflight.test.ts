import { expect, test } from 'bun:test';
import { assertWatchmanFixtureLane } from './preflight';

test('browser fixtures accept each native role lane and legacy kind defaults', () => {
  for (const role of ['content', 'gtm', 'lead'] as const)
    expect(() => assertWatchmanFixtureLane({ role, kind: 'organic' })).not.toThrow();
  expect(() => assertWatchmanFixtureLane({ role: 'performance', kind: 'paid' })).not.toThrow();
  expect(() => assertWatchmanFixtureLane({ kind: 'organic' })).not.toThrow();
  expect(() => assertWatchmanFixtureLane({ kind: 'paid' })).not.toThrow();
});

test('browser fixtures refuse the observed paid-lead mismatch before browser startup', () => {
  for (const role of ['content', 'gtm', 'lead'] as const)
    expect(() => assertWatchmanFixtureLane({ role, kind: 'paid' })).toThrow('kind must match');
  expect(() => assertWatchmanFixtureLane({ role: 'performance', kind: 'organic' })).toThrow(
    'kind must match',
  );
});
