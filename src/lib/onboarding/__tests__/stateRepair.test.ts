import { describe, expect, test } from 'bun:test';
import { createDefaultOnboardingState, repairOnboardingState } from '@/lib/onboarding/state';

const owner = {
  id: 'user-1',
  email: 'owner@example.com',
  role: 'owner' as const,
};

describe('repairOnboardingState', () => {
  test('repairs an empty persisted object into a usable onboarding state', () => {
    const repaired = repairOnboardingState({}, owner);

    expect(repaired.repaired).toBe(true);
    expect(repaired.state).toEqual(createDefaultOnboardingState(owner));
    expect(repaired.issues.length).toBeGreaterThan(0);
  });

  test('preserves independently valid legacy fields while defaulting invalid fields', () => {
    const repaired = repairOnboardingState(
      {
        step: 5,
        brand: {
          name: 'Acme',
          website: 'https://example.com',
          overview: 'Useful evidence',
          colors: ['not-a-hex'],
        },
      },
      owner,
    );

    expect(repaired.repaired).toBe(true);
    expect(repaired.state.step).toBe(5);
    expect(repaired.state.brand.name).toBe('Acme');
    expect(repaired.state.brand.website).toBe('https://example.com');
    expect(repaired.state.brand.overview).toBe('Useful evidence');
    expect(repaired.state.brand.colors).toEqual([]);
    expect(repaired.state.members).toEqual([owner]);
  });

  test('accepts the generation screen as a durable resume position', () => {
    const state = createDefaultOnboardingState(owner);

    const repaired = repairOnboardingState({ ...state, step: 6 }, owner);

    expect(repaired.repaired).toBe(false);
    expect(repaired.state.step).toBe(6);
  });

  test('preserves a selected inspiration when repairing another invalid field', () => {
    const state = createDefaultOnboardingState(owner);
    const repaired = repairOnboardingState(
      {
        ...state,
        brand: { ...state.brand, colors: ['not-a-color'] },
        selectedInspiration: {
          competitorName: 'Acme',
          imageUrl: 'https://cdn.example.com/acme.jpg',
        },
      },
      owner,
    );

    expect(repaired.state.selectedInspiration).toEqual({
      competitorName: 'Acme',
      imageUrl: 'https://cdn.example.com/acme.jpg',
    });
  });
});
