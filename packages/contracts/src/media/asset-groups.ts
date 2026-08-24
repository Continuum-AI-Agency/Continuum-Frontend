import { z } from 'zod';

// Mirrors the `media.asset_groups.kind` CHECK exactly. When one widens the other must,
// or contracts start refusing a row the database happily stores. 'element' arrived with
// migration 20260824100000_asset_groups_element_kind.sql.
export const assetGroupKindSchema = z.enum(['carousel', 'element']);
export type AssetGroupKind = z.infer<typeof assetGroupKindSchema>;

export const assetGroupMemberSchema = z
  .object({
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid().nullable().optional(),
    position: z.number().int().nonnegative(),
  })
  .strict();
export type AssetGroupMember = z.infer<typeof assetGroupMemberSchema>;

export const assetGroupSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    kind: assetGroupKindSchema,
    externalKey: z.string().min(1).max(500).nullable().optional(),
    title: z.string().min(1).max(500).nullable().optional(),
    members: z.array(assetGroupMemberSchema).min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()
  .superRefine((group, context) => {
    const positions = new Set<number>();
    const assets = new Set<string>();
    group.members.forEach((member, index) => {
      if (positions.has(member.position)) {
        context.addIssue({
          code: 'custom',
          path: ['members', index, 'position'],
          message: 'Group positions must be unique',
        });
      }
      if (assets.has(member.assetId)) {
        context.addIssue({
          code: 'custom',
          path: ['members', index, 'assetId'],
          message: 'An asset can appear only once in a group',
        });
      }
      positions.add(member.position);
      assets.add(member.assetId);
    });
  });
export type AssetGroup = z.infer<typeof assetGroupSchema>;
