import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { HomeBaseDashboard } from '@/components/dashboard/HomeBaseDashboard';

// Mock radix themes
mock.module('@radix-ui/themes', () => {
  return require('../mocks/radixThemes');
});

describe('HomeBaseDashboard', () => {
  beforeEach(() => {
    cleanup();
  });

  test('renders both slots but only shows one at a time', () => {
    render(
      <HomeBaseDashboard
        paidViewSlot={<div data-testid="paid-slot">Paid Content</div>}
        organicViewSlot={<div data-testid="organic-slot">Organic Content</div>}
      />,
    );

    const paidSlot = screen.getByTestId('paid-slot').parentElement;
    const organicSlot = screen.getByTestId('organic-slot').parentElement;

    // Initial state: Paid is visible, Organic is hidden
    expect(paidSlot?.style.display).toBe('block');
    expect(organicSlot?.style.display).toBe('none');
  });

  test('toggles visibility when tabs are clicked', () => {
    render(
      <HomeBaseDashboard
        paidViewSlot={<div data-testid="paid-slot">Paid Content</div>}
        organicViewSlot={<div data-testid="organic-slot">Organic Content</div>}
      />,
    );

    const paidSlot = screen.getByTestId('paid-slot').parentElement;
    const organicSlot = screen.getByTestId('organic-slot').parentElement;

    // Click Organic Tab
    const organicTab = screen.getByText('Organic Media');
    fireEvent.click(organicTab);

    expect(paidSlot?.style.display).toBe('none');
    expect(organicSlot?.style.display).toBe('block');

    // Click Paid Tab
    const paidTab = screen.getByText('Paid Media');
    fireEvent.click(paidTab);

    expect(paidSlot?.style.display).toBe('block');
    expect(organicSlot?.style.display).toBe('none');
  });
});
