import { describe, expect, it } from 'bun:test';

import {
  auditActorLabel,
  buildAdminAuditRequestBody,
  buildAdminTabParams,
  buildAdminUserListSearchParams,
  canBulkTransfer,
  describeWorkflowNames,
  formatAuditActionLabel,
  formatBrandDisambiguationLabel,
  membershipLabel,
  resolveAdminTab,
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

describe('resolveAdminTab', () => {
  it('returns a known tab unchanged', () => {
    expect(resolveAdminTab('audit')).toBe('audit');
    expect(resolveAdminTab('workflows')).toBe('workflows');
  });

  it('falls back to users for missing or unknown values', () => {
    expect(resolveAdminTab(null)).toBe('users');
    expect(resolveAdminTab(undefined)).toBe('users');
    expect(resolveAdminTab('reports-typo')).toBe('users');
  });
});

describe('buildAdminTabParams', () => {
  it('sets the tab param and preserves unrelated params', () => {
    const result = buildAdminTabParams('query=alex&page=2', 'audit');
    const params = new URLSearchParams(result);
    expect(params.get('tab')).toBe('audit');
    expect(params.get('query')).toBe('alex');
    expect(params.get('page')).toBe('2');
  });

  it('drops the tab param for the default users tab', () => {
    const result = buildAdminTabParams('tab=audit&query=alex', 'users');
    const params = new URLSearchParams(result);
    expect(params.has('tab')).toBe(false);
    expect(params.get('query')).toBe('alex');
  });
});

describe('formatAuditActionLabel', () => {
  it('humanizes a dotted domain.action key', () => {
    expect(formatAuditActionLabel('admin.user.set_admin')).toBe('User · Set admin');
    expect(formatAuditActionLabel('admin.workflow.promote_to_global')).toBe(
      'Workflow · Promote to global',
    );
  });

  it('falls back to a readable form for unknown keys', () => {
    expect(formatAuditActionLabel('somethingelse')).toBe('Somethingelse');
    expect(formatAuditActionLabel('')).toBe('');
  });
});

describe('buildAdminAuditRequestBody', () => {
  it('omits the action filter when unset', () => {
    expect(buildAdminAuditRequestBody({ page: 1, pageSize: 50 })).toEqual({
      page: 1,
      pageSize: 50,
    });
    expect(buildAdminAuditRequestBody({ page: 2, pageSize: 25, action: null })).toEqual({
      page: 2,
      pageSize: 25,
    });
  });

  it('includes the action filter when set', () => {
    expect(
      buildAdminAuditRequestBody({ page: 1, pageSize: 50, action: 'admin.user.set_admin' }),
    ).toEqual({ page: 1, pageSize: 50, action: 'admin.user.set_admin' });
  });
});

describe('auditActorLabel', () => {
  const base = { actor_name: null, actor_email: null, actor_user_id: null };

  it('prefers name, then email, matching the Users tab convention', () => {
    expect(auditActorLabel({ ...base, actor_name: 'Jane Doe', actor_email: 'jane@x.co' })).toBe(
      'Jane Doe',
    );
    expect(auditActorLabel({ ...base, actor_email: 'jane@x.co' })).toBe('jane@x.co');
  });

  it('treats whitespace-only name/email as absent', () => {
    expect(auditActorLabel({ ...base, actor_name: '   ', actor_email: 'jane@x.co' })).toBe(
      'jane@x.co',
    );
  });

  it('falls back to the raw actor id when unresolved, then to System', () => {
    expect(auditActorLabel({ ...base, actor_user_id: 'a1b2c3' })).toBe('a1b2c3');
    expect(auditActorLabel(base)).toBe('System');
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
