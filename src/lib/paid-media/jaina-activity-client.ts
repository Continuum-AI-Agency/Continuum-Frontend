'use client';

/**
 * The ONLY place the Campaign Flow Canvas reads Jaina's paid-media activity.
 *
 * Same reasoning as `scaffold-tree-client.ts`, which this module extends outward from
 * one version's nodes to the whole picture a canvas needs: the scaffolds a brand owns,
 * the gate each version is sitting behind, and the audience groups Jaina published.
 * Every table below carries `brand_id` and an RLS SELECT policy of
 * `using (has_brand_access(brand_id))` — a direct column check, no join — and grants
 * `authenticated` SELECT and nothing else. So a route handler could only re-implement a
 * check the database already makes, which root AGENTS.md §5 names a thin
 * auth-forwarding proxy. One wrapper module, never a query inside a component.
 *
 * READ-ONLY BY CONSTRUCTION, not by convention: none of these tables grants INSERT,
 * UPDATE or DELETE to `authenticated`. Every write goes through a SECURITY DEFINER RPC
 * that is explicitly revoked from `authenticated`. That is what makes it safe for the
 * canvas to hydrate a real proposal and let someone drag its nodes around — the browser
 * physically cannot persist the result, so "propose via Jaina" is the only way forward.
 */

import { fetchBrandAuthors } from '@/lib/library/commentAuthors';
import { displayNameFromEmail } from '@/lib/library/comments';
import {
  fetchPaidScaffoldTreeRows,
  type PaidScaffoldTreeRead,
} from '@/lib/paid-media/scaffold-tree-client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/* -- gates ---------------------------------------------------------------------- */

/** `brand_profiles.paid_scaffold_gate_approvals.gate`. Ordered; the database enforces it. */
export type ScaffoldGateName = 'build' | 'populate' | 'activate';

/**
 * The five states a gate row can hold, plus the sixth that is the ABSENCE of a row.
 *
 * `proposed` is not a database value: it is what a node whose gate has never been
 * opened is actually in — Jaina wrote the proposal, nobody has been asked to approve
 * anything yet. Reading a missing row as `proposed` rather than as "unknown" is the
 * whole point of showing gates on the canvas.
 */
export type CanvasGateStatus =
  | 'proposed'
  | 'awaiting_approval'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'consumed';

const GATE_STATUSES: readonly CanvasGateStatus[] = [
  'awaiting_approval',
  'approved',
  'denied',
  'expired',
  'consumed',
];

export type CanvasGate = {
  /** `build` | `populate` | `activate`, or the tool name for an audience-group gate. */
  gate: string;
  status: CanvasGateStatus;
  /** A display name derived from the brand member's email, never the raw uuid. */
  approvedBy: string | null;
  approvedAt: string | null;
};

const asGateStatus = (value: unknown): CanvasGateStatus =>
  GATE_STATUSES.includes(value as CanvasGateStatus)
    ? (value as CanvasGateStatus)
    : // An unknown status understates rather than overstates: `proposed` claims nobody
      // approved anything, which is the safe reading of a value we cannot interpret.
      'proposed';

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/* -- scaffolds ------------------------------------------------------------------ */

export type ScaffoldSummary = {
  id: string;
  name: string;
  adAccountId: string;
  currentVersionId: string | null;
  createdAt: string;
};

export type ScaffoldVersionSummary = {
  id: string;
  version: number;
  /** `proposed` | `building` | `built` | `populating` | `populated` | … */
  lifecycle: string;
  createdAt: string;
};

/** Newest first, archived excluded — the picker's list. */
export async function fetchBrandScaffolds(params: { brandId: string }): Promise<ScaffoldSummary[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('paid_scaffolds')
    .select('id,name,ad_account_id,current_version_id,created_at')
    .eq('brand_id', params.brandId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Could not load this brand's scaffolds: ${error.message}`);

  return (data ?? []).map((entry) => {
    const raw = entry as unknown as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? 'Untitled scaffold'),
      adAccountId: String(raw.ad_account_id ?? ''),
      currentVersionId: asNullableString(raw.current_version_id),
      createdAt: String(raw.created_at ?? ''),
    };
  });
}

/** Every version of one scaffold, newest first. */
export async function fetchScaffoldVersions(params: {
  scaffoldId: string;
}): Promise<ScaffoldVersionSummary[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('paid_scaffold_versions')
    .select('id,version,lifecycle,created_at')
    .eq('scaffold_id', params.scaffoldId)
    .order('version', { ascending: false });

  if (error) throw new Error(`Could not load the scaffold's versions: ${error.message}`);

  return (data ?? []).map((entry) => {
    const raw = entry as unknown as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      version: typeof raw.version === 'number' ? raw.version : 0,
      lifecycle: String(raw.lifecycle ?? 'proposed'),
      createdAt: String(raw.created_at ?? ''),
    };
  });
}

/**
 * The gate rows for one scaffold version, keyed by gate name.
 *
 * `unique (version_id, gate)` in the schema, so at most three rows and no ambiguity
 * about which one governs a node.
 */
async function fetchScaffoldGates(params: {
  versionId: string;
  nameOf: (userId: string | null) => string | null;
}): Promise<Partial<Record<ScaffoldGateName, CanvasGate>>> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('paid_scaffold_gate_approvals')
    .select('gate,status,approved_by,approved_at')
    .eq('version_id', params.versionId);

  if (error) throw new Error(`Could not load the scaffold's approvals: ${error.message}`);

  const gates: Partial<Record<ScaffoldGateName, CanvasGate>> = {};
  for (const entry of data ?? []) {
    const raw = entry as unknown as Record<string, unknown>;
    const gate = String(raw.gate ?? '');
    if (gate !== 'build' && gate !== 'populate' && gate !== 'activate') continue;
    gates[gate] = {
      gate,
      status: asGateStatus(raw.status),
      approvedBy: params.nameOf(asNullableString(raw.approved_by)),
      approvedAt: asNullableString(raw.approved_at),
    };
  }
  return gates;
}

/* -- audience groups ------------------------------------------------------------ */

export type AudienceGroupRead = {
  id: string;
  name: string;
  /** `audience_groups.current_version_id` — the subject id its gate row is keyed on. */
  versionId: string | null;
  memberCount: number;
  /** `manifest.targeting`, read defensively; the manifest is jsonb on the wire. */
  targeting: Record<string, unknown>;
  /** Member keys the manifest includes — the canvas shows them as custom audiences. */
  includedKeys: string[];
  gate: CanvasGate | null;
};

/**
 * Every audience group the brand owns, with its current version's manifest and the
 * `jaina_tool_gate_approvals` row that governs it.
 *
 * Audience groups do NOT use `paid_scaffold_gate_approvals`: `audience_group_manage`
 * is registered in the generic Jaina tool gate under
 * `subject_kind = 'audience_group_version'`, so that is the row to join on.
 */
export async function fetchBrandAudienceGroups(params: {
  brandId: string;
  nameOf: (userId: string | null) => string | null;
}): Promise<AudienceGroupRead[]> {
  const supabase = createSupabaseBrowserClient();

  const { data: groupData, error: groupError } = await supabase
    .schema('brand_profiles')
    .from('audience_groups')
    .select('id,name,current_version_id,created_at')
    .eq('brand_id', params.brandId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (groupError) throw new Error(`Could not load the audience groups: ${groupError.message}`);

  const groups = (groupData ?? []).map((entry) => entry as unknown as Record<string, unknown>);
  const versionIds = groups
    .map((group) => asNullableString(group.current_version_id))
    .filter((id): id is string => id !== null);

  if (versionIds.length === 0) {
    return groups.map((group) => ({
      id: String(group.id ?? ''),
      name: String(group.name ?? 'Untitled audience'),
      versionId: null,
      memberCount: 0,
      targeting: {},
      includedKeys: [],
      gate: null,
    }));
  }

  const [{ data: versionData, error: versionError }, { data: gateData, error: gateError }] =
    await Promise.all([
      supabase
        .schema('brand_profiles')
        .from('audience_group_versions')
        .select('id,manifest')
        .in('id', versionIds),
      supabase
        .schema('brand_profiles')
        .from('jaina_tool_gate_approvals')
        .select('tool_name,subject_id,status,approved_by,approved_at')
        .eq('brand_id', params.brandId)
        .eq('subject_kind', 'audience_group_version')
        .in('subject_id', versionIds),
    ]);

  if (versionError) {
    throw new Error(`Could not load the audience group versions: ${versionError.message}`);
  }
  if (gateError) throw new Error(`Could not load the audience approvals: ${gateError.message}`);

  const manifestById = new Map<string, Record<string, unknown>>();
  for (const entry of versionData ?? []) {
    const raw = entry as unknown as Record<string, unknown>;
    manifestById.set(String(raw.id ?? ''), asRecord(raw.manifest));
  }

  const gateBySubjectId = new Map<string, CanvasGate>();
  for (const entry of gateData ?? []) {
    const raw = entry as unknown as Record<string, unknown>;
    gateBySubjectId.set(String(raw.subject_id ?? ''), {
      gate: String(raw.tool_name ?? 'audience_group_manage'),
      status: asGateStatus(raw.status),
      approvedBy: params.nameOf(asNullableString(raw.approved_by)),
      approvedAt: asNullableString(raw.approved_at),
    });
  }

  return groups.map((group) => {
    const versionId = asNullableString(group.current_version_id);
    const manifest = versionId ? (manifestById.get(versionId) ?? {}) : {};
    const includedKeys = Array.isArray(manifest.include_member_keys)
      ? manifest.include_member_keys.filter((key): key is string => typeof key === 'string')
      : [];
    return {
      id: String(group.id ?? ''),
      // The manifest name is what a human typed; the group row's name is derived from
      // it, so they agree — the manifest wins only because it is the authored value.
      name: String(manifest.name ?? group.name ?? 'Untitled audience'),
      versionId,
      memberCount: Array.isArray(manifest.members) ? manifest.members.length : 0,
      targeting: asRecord(manifest.targeting),
      includedKeys,
      gate: versionId ? (gateBySubjectId.get(versionId) ?? null) : null,
    };
  });
}

/* -- brand members -------------------------------------------------------------- */

/**
 * uid -> display name, for `approved_by`.
 *
 * `brand_profiles.permissions` carries an email and no name column, so the app's one
 * existing idiom derives the name from the email (`displayNameFromEmail`). Reused here
 * rather than re-derived: two functions that disagreed would name the same approver two
 * ways on two screens.
 */
export async function fetchBrandMemberNames(params: {
  brandId: string;
}): Promise<(userId: string | null) => string | null> {
  const authors = await fetchBrandAuthors(createSupabaseBrowserClient(), params.brandId);
  return (userId) => {
    if (!userId) return null;
    const author = authors.get(userId);
    return author?.name ?? displayNameFromEmail(author?.email) ?? null;
  };
}

/* -- the composed read ---------------------------------------------------------- */

export type CanvasScaffoldRead = {
  scaffold: ScaffoldSummary;
  version: ScaffoldVersionSummary;
  versions: ScaffoldVersionSummary[];
  tree: PaidScaffoldTreeRead;
  gates: Partial<Record<ScaffoldGateName, CanvasGate>>;
  audiences: AudienceGroupRead[];
};

/**
 * Everything the canvas needs to render one scaffold as a graph.
 *
 * The version is resolved here rather than by the caller: `current_version_id` is the
 * one the rest of the product acts on, and falling back to the newest version keeps a
 * scaffold whose pointer was never set from rendering as empty.
 */
export async function fetchCanvasScaffoldRead(params: {
  brandId: string;
  scaffold: ScaffoldSummary;
}): Promise<CanvasScaffoldRead> {
  const [versions, nameOf] = await Promise.all([
    fetchScaffoldVersions({ scaffoldId: params.scaffold.id }),
    fetchBrandMemberNames({ brandId: params.brandId }),
  ]);

  const version =
    versions.find((entry) => entry.id === params.scaffold.currentVersionId) ?? versions[0];
  if (!version) {
    throw new Error(`"${params.scaffold.name}" has no versions to load.`);
  }

  const [tree, gates, audiences] = await Promise.all([
    fetchPaidScaffoldTreeRows({ scaffoldVersionId: version.id }),
    fetchScaffoldGates({ versionId: version.id, nameOf }),
    fetchBrandAudienceGroups({ brandId: params.brandId, nameOf }),
  ]);

  return { scaffold: params.scaffold, version, versions, tree, gates, audiences };
}
