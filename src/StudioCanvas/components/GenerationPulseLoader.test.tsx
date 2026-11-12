import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@/components/library/__tests__/renderWithCreativeI18n';
import { GenerationPulseLoader } from './GenerationPulseLoader';

describe('GenerationPulseLoader', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders pulsing circle status', () => {
    render(<GenerationPulseLoader />);
    expect(screen.getByRole('status', { name: 'Generating media' })).toBeTruthy();
  });
});
