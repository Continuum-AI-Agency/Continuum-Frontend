import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_PROJECT_COLOR,
  PROJECT_COLOR_PRESETS,
  projectCreateRequestSchema,
  projectEntityTypeSchema,
  projectListQuerySchema,
  projectMembershipQuerySchema,
  projectSchema,
  projectTagRequestSchema,
  projectUpdateRequestSchema,
  toProject,
  toProjectMembership,
} from './project';

const BRAND = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

describe('projectEntityTypeSchema', () => {
  // The migration's check constraint is the other half of this list. A member added on one
  // side only produces a row the database rejects at insert time, so the count is asserted.
  it('carries exactly the eight taggable entity types', () => {
    expect(projectEntityTypeSchema.options).toEqual([
      'asset',
      'collection',
      'canvas_workflow',
      'automation',
      'jaina_session',
      'organic_session',
      'optimizer_portfolio',
      'brand_document',
    ]);
  });

  it('rejects an entity type the constraint would reject', () => {
    expect(projectEntityTypeSchema.safeParse('editor_project').success).toBe(false);
  });
});

describe('toProject', () => {
  const row = {
    id: PROJECT,
    brand_id: BRAND,
    name: 'UGC focus',
    brief: 'Creator-led, hand-held, no studio lighting.',
    color: '#0daea2',
    status: 'active',
    ad_account_ids: ['act_123'],
    campaign_ids: ['c1', 'c2'],
    created_by: USER,
    created_at: '2026-09-07T00:00:00Z',
    updated_at: '2026-09-07T00:00:00Z',
  };

  it('maps a snake_case row to the camelCase contract', () => {
    expect(toProject(row)).toEqual({
      id: PROJECT,
      brandId: BRAND,
      name: 'UGC focus',
      brief: 'Creator-led, hand-held, no studio lighting.',
      color: '#0daea2',
      status: 'active',
      adAccountIds: ['act_123'],
      campaignIds: ['c1', 'c2'],
      createdBy: USER,
      createdAt: '2026-09-07T00:00:00Z',
      updatedAt: '2026-09-07T00:00:00Z',
    });
  });

  // Postgres defaults the arrays to '{}', but a projection that omits them (or a row written
  // before the default) hands back null. Every consumer maps over these, so null must not
  // reach them.
  it('normalizes null arrays to empty', () => {
    const project = toProject({ ...row, ad_account_ids: null, campaign_ids: null });
    expect(project.adAccountIds).toEqual([]);
    expect(project.campaignIds).toEqual([]);
  });

  it('refuses a status outside the check constraint', () => {
    expect(() => toProject({ ...row, status: 'deleted' })).toThrow();
  });
});

describe('toProjectMembership', () => {
  it('keeps entity_id as text', () => {
    expect(
      toProjectMembership({
        project_id: PROJECT,
        brand_id: BRAND,
        entity_type: 'jaina_session',
        entity_id: 'bench:jaina:abc',
        added_by: null,
        added_at: '2026-09-07T00:00:00Z',
      }).entityId,
    ).toBe('bench:jaina:abc');
  });
});

describe('request envelopes', () => {
  it('defaults a list query to active projects only', () => {
    expect(projectListQuerySchema.parse({ brandId: BRAND }).status).toBe('active');
  });

  it('defaults create scope arrays to empty and trims the name', () => {
    const parsed = projectCreateRequestSchema.parse({ brandId: BRAND, name: '  UGC focus  ' });
    expect(parsed.name).toBe('UGC focus');
    expect(parsed.adAccountIds).toEqual([]);
    expect(parsed.campaignIds).toEqual([]);
  });

  it('rejects a colour the chip could not render', () => {
    expect(
      projectCreateRequestSchema.safeParse({ brandId: BRAND, name: 'x', color: 'teal-500' }).success,
    ).toBe(false);
    expect(
      projectCreateRequestSchema.safeParse({ brandId: BRAND, name: 'x', color: '#0daea2' }).success,
    ).toBe(true);
  });

  it('rejects unknown keys so a typo silently drops nothing', () => {
    expect(
      projectCreateRequestSchema.safeParse({ brandId: BRAND, name: 'x', colour: '#0daea2' }).success,
    ).toBe(false);
  });

  // PATCH semantics: an omitted field is untouched, an explicit null clears it. The route
  // builds its update object from `in`, so the two must stay distinguishable here.
  it('distinguishes an omitted field from an explicit null', () => {
    const cleared = projectUpdateRequestSchema.parse({
      brandId: BRAND,
      projectId: PROJECT,
      brief: null,
    });
    expect('brief' in cleared).toBe(true);
    expect(cleared.brief).toBeNull();
    expect('name' in projectUpdateRequestSchema.parse({ brandId: BRAND, projectId: PROJECT })).toBe(
      false,
    );
  });

  it('requires at least one entity id to tag', () => {
    expect(
      projectTagRequestSchema.safeParse({
        brandId: BRAND,
        projectId: PROJECT,
        entityType: 'asset',
        entityIds: [],
      }).success,
    ).toBe(false);
  });

  it('requires a membership query to name a project or an entity', () => {
    expect(projectMembershipQuerySchema.safeParse({ brandId: BRAND }).success).toBe(false);
    expect(
      projectMembershipQuerySchema.safeParse({ brandId: BRAND, projectId: PROJECT }).success,
    ).toBe(true);
    expect(
      projectMembershipQuerySchema.safeParse({ brandId: BRAND, entityId: 'asset-1' }).success,
    ).toBe(true);
  });
});

describe('palette', () => {
  it('offers only colours the schema accepts', () => {
    for (const color of PROJECT_COLOR_PRESETS) {
      expect(
        projectCreateRequestSchema.safeParse({ brandId: BRAND, name: 'x', color }).success,
      ).toBe(true);
    }
    expect(PROJECT_COLOR_PRESETS).toContain(DEFAULT_PROJECT_COLOR);
  });
});

describe('projectSchema', () => {
  it('rejects a project with no brand', () => {
    expect(projectSchema.safeParse({ id: PROJECT, name: 'x' }).success).toBe(false);
  });
});
