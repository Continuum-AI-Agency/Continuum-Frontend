import type {
  AdminAuditLogEntry,
  AdminBrandOption,
  AdminWorkflowLibraryRow,
  PermissionRow,
} from '@/components/admin/adminUserTypes';

export function membershipLabel(count: number) {
  return `${count} ${count === 1 ? 'membership' : 'memberships'}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

/**
 * The same disambiguation split into the two lines the brand picker renders, so a long
 * owner email wraps instead of being clipped mid-word. `formatBrandDisambiguationLabel`
 * is derived from this rather than duplicating it — one source of truth means the
 * one-line and two-line renderings cannot drift apart.
 */
export function formatBrandDisambiguationLines(brand: AdminBrandOption): {
  name: string;
  detail: string;
} {
  const idSuffix = `…${brand.id.slice(-8)}`;
  return {
    name: brand.brand_name,
    detail: brand.ownerEmail ? `${brand.ownerEmail} — ${idSuffix}` : idSuffix,
  };
}

export function formatBrandDisambiguationLabel(brand: AdminBrandOption): string {
  const { name, detail } = formatBrandDisambiguationLines(brand);
  return `${name} — ${detail}`;
}

export function describeWorkflowNames(names: string[], maxNames = 5): string {
  if (names.length <= maxNames) return names.join(', ');
  const shown = names.slice(0, maxNames).join(', ');
  return `${shown}, and ${names.length - maxNames} more`;
}

export type BulkTransferEligibility = {
  allowed: boolean;
  reason?: string;
};

export function canBulkTransfer(workflows: AdminWorkflowLibraryRow[]): BulkTransferEligibility {
  if (workflows.length === 0) {
    return { allowed: false, reason: 'Select at least one workflow.' };
  }

  const visibilities = new Set(workflows.map((workflow) => workflow.visibility));
  if (visibilities.size > 1) {
    return {
      allowed: false,
      reason:
        'Select workflows of a single scope (all brand or all global) to transfer them together.',
    };
  }

  return { allowed: true };
}

export function groupPermissionsByUserId(permissions: PermissionRow[]) {
  const byUserId = new Map<string, PermissionRow[]>();

  permissions.forEach((permission) => {
    const existing = byUserId.get(permission.user_id);
    if (existing) {
      existing.push(permission);
      return;
    }
    byUserId.set(permission.user_id, [permission]);
  });

  return byUserId;
}

export type PaginationItem = number | 'ellipsis';

type PaginationRangeInput = {
  currentPage: number;
  totalPages: number;
  siblingCount?: number;
};

export function buildAdminPaginationRange({
  currentPage,
  totalPages,
  siblingCount = 1,
}: PaginationRangeInput): PaginationItem[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 2 * siblingCount + 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const clampedPage = Math.max(1, Math.min(currentPage, totalPages));
  const leftSibling = Math.max(2, clampedPage - siblingCount);
  const rightSibling = Math.min(totalPages - 1, clampedPage + siblingCount);

  const items: PaginationItem[] = [1];

  if (leftSibling > 2) {
    items.push('ellipsis');
  }

  for (let page = leftSibling; page <= rightSibling; page += 1) {
    items.push(page);
  }

  if (rightSibling < totalPages - 1) {
    items.push('ellipsis');
  }

  items.push(totalPages);

  return items;
}

export function buildAdminUserListPaginationParams(
  currentParams: string,
  nextPage: number,
  pageSize: number,
) {
  const params = new URLSearchParams(currentParams);
  params.set('page', String(nextPage));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

export function buildAdminUserListSearchParams(
  currentParams: string,
  query: string,
  pageSize: number,
) {
  const params = new URLSearchParams(currentParams);
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    params.set('query', trimmedQuery);
  } else {
    params.delete('query');
  }

  params.set('page', '1');
  params.set('pageSize', String(pageSize));
  return params.toString();
}

// Admin console tabs -------------------------------------------------------

// The admin console tabs, in render order. `users` is the default (no param).
export const ADMIN_TABS = ['users', 'brands', 'workflows', 'audit', 'reports'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

// Coerce a raw `?tab=` value into a known tab, defaulting to `users`. Lets
// /admin?tab=audit deep-link to the Audit tab instead of silently landing on
// Users (BUG-001).
export function resolveAdminTab(value: string | null | undefined): AdminTab {
  return ADMIN_TABS.includes(value as AdminTab) ? (value as AdminTab) : 'users';
}

// Write the active tab back onto the URL, preserving unrelated params. The
// default `users` tab is represented by the absence of the param to keep URLs
// clean.
export function buildAdminTabParams(currentParams: string, tab: AdminTab): string {
  const params = new URLSearchParams(currentParams);
  if (tab === 'users') {
    params.delete('tab');
  } else {
    params.set('tab', tab);
  }
  return params.toString();
}

// Admin audit log ----------------------------------------------------------

// The admin.* action keys the audit writers emit today (impersonate-user,
// admin-set-admin, admin-access-actions, admin-update-tier,
// admin-workflow-library). Drives the audit filter dropdown. A new writer
// action must be added here to be filterable — keep in sync with the edge
// functions under supabase/functions/admin-*.
export const ADMIN_AUDIT_ACTIONS = [
  'admin.user.set_admin',
  'admin.user.impersonation_link',
  'admin.member.remove',
  'admin.brand.update_tier',
  'admin.workflow.migrate_global_to_brand',
  'admin.workflow.duplicate_to_brand',
  'admin.workflow.promote_to_global',
  'admin.workflow.move_to_brand',
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

// Humanize a dotted action key for display: 'admin.user.set_admin' becomes
// 'User · Set admin', 'admin.workflow.promote_to_global' becomes
// 'Workflow · Promote to global'. Falls back to the raw key so an unknown or
// newly added action still renders legibly.
export function formatAuditActionLabel(action: string): string {
  if (!action) return action;
  const withoutPrefix = action.startsWith('admin.') ? action.slice('admin.'.length) : action;
  const [domain, ...rest] = withoutPrefix.split('.');
  const humanize = (value: string) =>
    value.replace(/_/g, ' ').replace(/^\w/, (character) => character.toUpperCase());
  if (rest.length === 0) return humanize(domain ?? action);
  return `${humanize(domain)} · ${humanize(rest.join(' '))}`;
}

type AdminAuditRequestInput = {
  page: number;
  pageSize: number;
  action?: string | null;
  brandProfileId?: string | null;
  search?: string | null;
  actorQuery?: string | null;
};

// Build the admin-audit-log request body, omitting any filter that is unset so
// the endpoint returns every action rather than filtering on an empty string.
export function buildAdminAuditRequestBody({
  page,
  pageSize,
  action,
  brandProfileId,
  search,
  actorQuery,
}: AdminAuditRequestInput) {
  const body: {
    page: number;
    pageSize: number;
    action?: string;
    brandProfileId?: string;
    search?: string;
    actorQuery?: string;
  } = { page, pageSize };
  if (action) body.action = action;
  if (brandProfileId) body.brandProfileId = brandProfileId;
  const trimmedSearch = search?.trim();
  if (trimmedSearch) body.search = trimmedSearch;
  const trimmedActor = actorQuery?.trim();
  if (trimmedActor) body.actorQuery = trimmedActor;
  return body;
}

type AuditActor = Pick<AdminAuditLogEntry, 'actor_name' | 'actor_email' | 'actor_user_id'>;

// Identify an audit actor the way the rest of the admin console identifies a
// user: name first, then email, matching the `name ?? email` convention used in
// the Users directory. Falls back to the raw actor UUID when the actor isn't in
// the directory (e.g. a since-deleted user), and to 'System' for actor-less
// automated actions. Whitespace-only names/emails are treated as absent.
export function auditActorLabel(actor: AuditActor): string {
  return actor.actor_name?.trim() || actor.actor_email?.trim() || actor.actor_user_id || 'System';
}

// Workflow transfer ---------------------------------------------------------

// Airtable #277. The transfer picker enumerated all 321 brands alphabetically —
// "Aaron Test Brand, AgeGateway, ALA Applied Technologies…" — most of which have
// never had a Creative Studio, so the destination list was mostly noise.
// `workflowCount` already rides on every `list_brands` row, so narrowing the list
// is a filter over what we already fetched, not a second round trip. The synthetic
// rows (global library, audit "All brands") carry no count and are not transfer
// destinations, so an absent count reads as zero.
export function brandsWithWorkflows(brands: AdminBrandOption[]): AdminBrandOption[] {
  return brands.filter((brand) => (brand.workflowCount ?? 0) > 0);
}
