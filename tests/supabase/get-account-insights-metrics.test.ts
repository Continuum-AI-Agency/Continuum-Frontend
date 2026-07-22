import { expect, test } from 'bun:test';

import {
  extractActionMetric,
  extractPurchaseRoas,
  PURCHASE_ACTION_TYPES,
} from '../../supabase/functions/get-account-insights/metrics';

test('extractPurchaseRoas returns direct numeric values', () => {
  expect(extractPurchaseRoas(3.21)).toBe(3.21);
  expect(extractPurchaseRoas('4.56')).toBe(4.56);
});

test('extractPurchaseRoas prefers purchase action types by priority', () => {
  const payload = [
    { action_type: 'landing_page_view', value: '99' },
    { action_type: 'purchase', value: '2.7' },
    { action_type: 'omni_purchase', value: '3.4' },
  ];

  expect(extractPurchaseRoas(payload)).toBe(3.4);
});

test('extractPurchaseRoas falls back to first positive metric when action type is unknown', () => {
  const payload = [
    { action_type: 'unknown_signal', value: '1.8' },
    { action_type: 'another_unknown', value: '2.2' },
  ];

  expect(extractPurchaseRoas(payload)).toBe(1.8);
});

test('extractActionMetric sums purchase values across matching action types', () => {
  const actionValues = [
    { action_type: 'omni_purchase', value: '10' },
    { action_type: 'purchase', value: '5' },
    { action_type: 'link_click', value: '7' },
  ];

  expect(extractActionMetric(actionValues, PURCHASE_ACTION_TYPES)).toBe(15);
});
