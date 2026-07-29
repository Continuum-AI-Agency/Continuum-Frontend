import { describe, expect, it } from 'bun:test';

import {
  buildAdminUserListSearchParams,
  canBulkTransfer,
  describeWorkflowNames,
  formatBrandDisambiguationLabel,
  membershipLabel,
} from '@/components/admin/adminUserListUtils';
import type { AdminBrandOption, AdminWorkflowLibraryRow } from '@/components/admin/adminUserTypes';

describe('membershipLabel', () => {
  it('uses the singular label only for one membership', () => {
    expect(membershipLabel(0)).toBe('0 memberships');
    expect(membershipLabel(1)).toBe('1 membership');
    expect(membershipLabel(2)).toBe('2 memberships');
  });
});

describe('buildAdminUserListSearchParams', () => {
  it('preserves unrelated parameters and resets pagination for a trimmed query', () => {
    const result = buildAdminUserListSearchParams(
      'section=users&page=4&pageSize=25',
      '  alex@example.com  ',
      50,
    );
    const params = new URLSearchParams(result);

    expect(params.get('query')).toBe('alex@example.com');
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('50');
    expect(params.get('section')).toBe('users');
  });

  it('removes the query when search is cleared', () => {
    const result = buildAdminUserListSearchParams(
      'section=users&query=alex&page=4&pageSize=25',
      '   ',
      50,
    );
    const params = new URLSearchParams(result);

    expect(params.has('query')).toBe(false);
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('50');
  });
});

function buildBrand(overrides: Partial<AdminBrandOption> = {}): AdminBrandOption {
  return {
    id: '148583e0-5538-462b-8d3a-acd25b80344e',
    brand_name: 'easyfit',
    tier: 1,
    active: true,
    ownerEmail: null,
    ...overrides,
  };
}

describe('formatBrandDisambiguationLabel', () => {
  it('includes the owner email and a short id suffix when an owner is known', () => {
    const brand = buildBrand({ ownerEmail: 'mkt@easyfit.mx' });
    expect(formatBrandDisambiguationLabel(brand)).toBe('easyfit — mkt@easyfit.mx — …5b80344e');
  });

  it('falls back to name and id suffix when no owner email is known', () => {
    const brand = buildBrand({ ownerEmail: null });
    expect(formatBrandDisambiguationLabel(brand)).toBe('easyfit — …5b80344e');
  });

  it('distinguishes two identically-named brands by owner and id', () => {
    const agencyRow = buildBrand({
      id: '148583e0-5538-462b-8d3a-acd25b80344e',
      ownerEmail: 'agency@mercadotecniavivo.com',
    });
    const directRow = buildBrand({
      id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
      ownerEmail: 'mkt@easyfit.mx',
    });
    expect(formatBrandDisambiguationLabel(agencyRow)).not.toBe(
      formatBrandDisambiguationLabel(directRow),
    );
  });
});

describe('describeWorkflowNames', () => {
  it('joins names as-is when within the limit', () => {
    expect(describeWorkflowNames(['Post', 'Contenido Organico'])).toBe('Post, Contenido Organico');
  });

  it('truncates and counts the remainder past the limit', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    expect(describeWorkflowNames(names, 5)).toBe('A, B, C, D, E, and 2 more');
  });
});

function buildWorkflow(overrides: Partial<AdminWorkflowLibraryRow> = {}): AdminWorkflowLibraryRow {
  return {
    id: 'wf-1',
    brand_profile_id: 'brand-1',
    name: 'Post',
    description: null,
    tags: [],
    visibility: 'brand',
    source_scope: null,
    source_workflow_id: null,
    source_brand_profile_id: null,
    promoted_from_workflow_id: null,
    copied_by: null,
    copied_at: null,
    created_by: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('canBulkTransfer', () => {
  it('rejects an empty selection', () => {
    expect(canBulkTransfer([])).toEqual({
      allowed: false,
      reason: 'Select at least one workflow.',
    });
  });

  it('allows a selection of workflows sharing one scope', () => {
    const workflows = [buildWorkflow({ id: 'a' }), buildWorkflow({ id: 'b' })];
    expect(canBulkTransfer(workflows)).toEqual({ allowed: true });
  });

  it('rejects a selection mixing brand and global scope', () => {
    const workflows = [
      buildWorkflow({ id: 'a', visibility: 'brand' }),
      buildWorkflow({ id: 'b', visibility: 'global', brand_profile_id: null }),
    ];
    const result = canBulkTransfer(workflows);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/single scope/);
  });
});
