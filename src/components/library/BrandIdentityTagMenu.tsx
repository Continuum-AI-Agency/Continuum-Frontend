'use client';

// Marks an image as one of the brand's references or as a particular logo variant (white
// for dark backgrounds, icon, horizontal…). These are ordinary Library tags from the shared
// vocabulary in contracts: references feed generation, variants are recorded for the brand
// and read by the agents. Nothing here picks a variant automatically.

import {
  LOGO_TAG,
  LOGO_VARIANT_TAGS,
  type LogoVariantTag,
  REFERENCE_TAG,
} from '@continuum/contracts';
import { Tags } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast-imperative';
import { bulkUpdateAssetTagsOperation } from '@/lib/library/creativeOperations';
import { canEditLibrary, useBrandRole } from '@/lib/library/useBrandRole';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const VARIANT_LABEL_KEYS = {
  'logo:primary': 'logoVariantPrimary',
  'logo:white': 'logoVariantWhite',
  'logo:dark': 'logoVariantDark',
  'logo:icon': 'logoVariantIcon',
  'logo:horizontal': 'logoVariantHorizontal',
} as const satisfies Record<LogoVariantTag, string>;

type UpdateTags = (input: {
  brandId: string;
  assetId: string;
  addTags?: string[];
  removeTags?: string[];
}) => Promise<unknown>;

const updateTags: UpdateTags = ({ assetId, ...input }) =>
  bulkUpdateAssetTagsOperation(createSupabaseBrowserClient(), { ...input, assetIds: [assetId] });

export type BrandIdentityTagMenuProps = {
  brandId: string;
  assetId: string;
  tags: readonly string[];
  /** Onboarding's logo tiles are already logos, so they offer only the variants. */
  variantsOnly?: boolean;
  onTagsChange?: (tags: string[]) => void;
  /** The tag write, injectable for tests. */
  update?: UpdateTags;
};

export function BrandIdentityTagMenu({
  brandId,
  assetId,
  tags: initialTags,
  variantsOnly = false,
  onTagsChange,
  update = updateTags,
}: BrandIdentityTagMenuProps) {
  const translateUi = useUiTranslations('library');
  const role = useBrandRole(brandId);
  const [tags, setTags] = useState<readonly string[]>(initialTags);
  if (!canEditLibrary(role)) return null;

  const toggle = async (tag: string, on: boolean) => {
    // A variant is a kind of logo, so marking one also files the image under `logo`.
    const add = on ? (tag.startsWith(`${LOGO_TAG}:`) ? [tag, LOGO_TAG] : [tag]) : [];
    const before = tags;
    const after = on
      ? [...new Set([...tags, ...add])]
      : tags.filter((existing) => existing !== tag);
    setTags(after);
    try {
      await update(
        on ? { brandId, assetId, addTags: add } : { brandId, assetId, removeTags: [tag] },
      );
      onTagsChange?.(after);
    } catch (error) {
      console.error('[BrandIdentityTagMenu] tag update failed', error);
      setTags(before);
      toast.error(translateUi('brandIdentityTagFailed'));
    }
  };

  const item = (
    tag: string,
    labelKey: (typeof VARIANT_LABEL_KEYS)[LogoVariantTag] | 'brandReference',
  ) => (
    <DropdownMenuCheckboxItem
      key={tag}
      checked={tags.includes(tag)}
      onCheckedChange={(checked) => void toggle(tag, checked === true)}
    >
      {translateUi(labelKey)}
    </DropdownMenuCheckboxItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="brand-identity-tags"
        render={
          <Button type="button" variant={variantsOnly ? 'ghost' : 'outline'} size="sm">
            <Tags className="size-3.5" aria-hidden />{' '}
            {translateUi(variantsOnly ? 'logoVariant' : 'brandIdentity')}
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {variantsOnly ? null : (
          <>
            {item(REFERENCE_TAG, 'brandReference')}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>{translateUi('logoVariant')}</DropdownMenuLabel>
        {LOGO_VARIANT_TAGS.map((tag) => item(tag, VARIANT_LABEL_KEYS[tag]))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
