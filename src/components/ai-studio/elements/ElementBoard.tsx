'use client';

// An Element's reference board: what each source image IS to it (the front view, the label,
// the hand that gives it scale), the board Elements it is shot in, and the `/slug` styles it
// carries into every generation. One PATCH saves all three and each REPLACES the stored
// value, so what is on screen is exactly what the Backend keeps.

import {
  ELEMENT_BOARD_LIMIT,
  ELEMENT_MEMBER_ROLES,
  ELEMENT_STYLE_SLUG_LIMIT,
  type ElementMemberRole,
  type ElementMemberRoles,
  elementErrorResponseSchema,
  elementStyleSlugSchema,
  isElementBoardCategory,
} from '@continuum/contracts';
import { Loader2, Plus, X } from 'lucide-react';
import { useLocale, useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { elementCategoryLabel } from '@/components/ai-studio/elements/elementPresentation';
import { SlashMenu, useSkillSlashOptions, useSlashTextarea } from '@/components/chat/slash-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  type ElementRecord,
  useElementMutations,
  useElements,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { ApiError } from '@/lib/api/errors';
import { useBrandSkills } from '@/lib/organic/skills';

const ROLE_KEYS = {
  identity: 'elementRoleIdentity',
  front: 'elementRoleFront',
  back: 'elementRoleBack',
  side: 'elementRoleSide',
  three_quarter: 'elementRoleThreeQuarter',
  top: 'elementRoleTop',
  detail: 'elementRoleDetail',
  label: 'elementRoleLabel',
  packaging: 'elementRolePackaging',
  in_hand: 'elementRoleInHand',
  wardrobe: 'elementRoleWardrobe',
  pose: 'elementRolePose',
} as const satisfies Record<ElementMemberRole, string>;
const NO_ROLE = 'none';
const SAVE_ERROR_KEYS: Readonly<
  Partial<Record<string, 'elementStyleUnknown' | 'elementStyleConflict' | 'elementBoardInvalid'>>
> = {
  element_style_unknown: 'elementStyleUnknown',
  element_style_conflict: 'elementStyleConflict',
  element_board_invalid: 'elementBoardInvalid',
};

const SLASH_TOKEN = /\/([a-z0-9][a-z0-9:-]*)/gi;

const storedRoles = (element: ElementRecord): ElementMemberRoles =>
  Object.fromEntries(
    element.members.flatMap((member) => (member.role ? [[member.assetId, member.role]] : [])),
  );

export interface ElementBoardProps {
  element: ElementRecord;
  brandId: string;
}

export function ElementBoard({ element, brandId }: ElementBoardProps) {
  const translateUi = useUiTranslations('studio');
  const locale = useLocale();
  const roleItems = React.useMemo(
    () =>
      Object.fromEntries([
        [NO_ROLE, translateUi('elementNoRole')],
        ...ELEMENT_MEMBER_ROLES.map((role) => [role, translateUi(ROLE_KEYS[role])]),
      ]),
    [translateUi],
  );

  const { elements } = useElements(brandId);
  const { update } = useElementMutations(brandId);
  const { all: skills } = useBrandSkills(brandId);
  const [roles, setRoles] = React.useState(() => storedRoles(element));
  const [boardIds, setBoardIds] = React.useState(element.boardElementIds ?? []);
  const [styleSlugs, setStyleSlugs] = React.useState(element.styleSlugs ?? []);
  const [styleDraft, setStyleDraft] = React.useState('');
  const [styleHint, setStyleHint] = React.useState<string | null>(null);

  const members = [...element.members].sort((left, right) => left.position - right.position);
  const signedUrls = useSignedAssetUrls(
    brandId,
    members.map((member) => member.assetId),
  );

  // The shared `/` menu also offers the per-generation brand-book switches (`/brand`,
  // `/nobrand`); only a skill's own slug is a style an Element can default to.
  const styleSlugSet = React.useMemo(
    () =>
      new Set(
        skills.flatMap((skill) =>
          skill.slug && elementStyleSlugSchema.safeParse(skill.slug).success ? [skill.slug] : [],
        ),
      ),
    [skills],
  );
  const slashOptions = useSkillSlashOptions(skills);
  const slash = useSlashTextarea(slashOptions, (text) => {
    setStyleDraft('');
    const picked = [...text.matchAll(SLASH_TOKEN)].map((match) => match[1] ?? '');
    const refused = picked.find((slug) => !styleSlugSet.has(slug));
    setStyleHint(refused ? translateUi('elementStyleNotInBrand', { slug: refused }) : null);
    setStyleSlugs((current) =>
      [...new Set([...current, ...picked.filter((slug) => styleSlugSet.has(slug))])].slice(
        0,
        ELEMENT_STYLE_SLUG_LIMIT,
      ),
    );
  });

  const boardName = (id: string) =>
    elements.find((candidate) => candidate.id === id)?.name ?? 'Unavailable board';
  const boardCandidates = elements.filter(
    (candidate) =>
      candidate.id !== element.id &&
      isElementBoardCategory(candidate.category) &&
      !boardIds.includes(candidate.id),
  );

  const saveError = update.error;
  const failureContext =
    saveError instanceof ApiError ? elementErrorResponseSchema.safeParse(saveError.payload) : null;
  const failureStyleSlugs = failureContext?.success ? (failureContext.data.styleSlugs ?? []) : [];

  const saveErrorCode = failureContext?.success
    ? failureContext.data.error
    : saveError instanceof ApiError
      ? saveError.code
      : undefined;
  const saveErrorCopy = saveErrorCode ? SAVE_ERROR_KEYS[saveErrorCode] : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" data-testid="element-board">
      <p className="text-sm font-medium">{translateUi('reference_board_8512e842')}</p>

      {members.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label>{translateUi('what_each_image_shows_8cef31d4')}</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {members.map((member, index) => {
              const url = signedUrls[member.assetId];
              return (
                <div key={member.assetId} className="flex flex-col gap-1">
                  <div className="aspect-square overflow-hidden rounded-md border border-border/60 bg-muted/40">
                    {url ? (
                      // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
                      <img
                        src={url}
                        alt={translateUi('source_value0_2ba9d9c9', {
                          value0: String(index + 1),
                        })}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-2xs">
                        {index + 1}
                      </span>
                    )}
                  </div>
                  <Select
                    value={roles[member.assetId] ?? NO_ROLE}
                    onValueChange={(value: string) =>
                      setRoles((current) => {
                        const { [member.assetId]: _previous, ...rest } = current;
                        return value === NO_ROLE
                          ? rest
                          : {
                              ...rest,
                              [member.assetId]: value as ElementMemberRole,
                            };
                      })
                    }
                  >
                    <SelectTrigger
                      aria-label={translateUi('role_of_source_value0_786b0aa1', {
                        value0: String(index + 1),
                      })}
                      className="h-7 w-full px-2 text-xs"
                    >
                      <SelectValue items={roleItems} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ROLE}>{translateUi('no_role_784a7208')}</SelectItem>
                      {ELEMENT_MEMBER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {translateUi(ROLE_KEYS[role])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label>{translateUi('linked_boards_36bd25d8')}</Label>
        <div className="flex flex-wrap gap-1.5">
          {boardIds.map((id) => (
            <Badge key={id} variant="secondary" className="h-6 gap-1 pl-2 pr-1 text-xs">
              {boardName(id)}
              <button
                type="button"
                aria-label={translateUi('unlink_value0_fbe997c9', {
                  value0: String(boardName(id)),
                })}
                onClick={() => setBoardIds((current) => current.filter((value) => value !== id))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {boardIds.length < ELEMENT_BOARD_LIMIT
            ? boardCandidates.map((candidate) => (
                <Button
                  key={candidate.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setBoardIds((current) => [...current, candidate.id])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {candidate.name}
                  <span className="ml-1 text-muted-foreground">
                    {elementCategoryLabel(candidate.category, translateUi)}
                  </span>
                </Button>
              ))
            : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {boardIds.length === 0 && boardCandidates.length === 0
            ? translateUi('save_a_moodboard_style_palette_sett_6f8e16a3')
            : translateUi('the_look_this_element_is_shot_in_up_639997a0', {
                value0: String(ELEMENT_BOARD_LIMIT),
              })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`element-${element.id}-styles`}>{translateUi('styles_3626e7fd')}</Label>
        {styleSlugs.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {styleSlugs.map((slug) => (
              <Badge key={slug} variant="outline" className="h-6 gap-1 pl-2 pr-1 font-mono text-xs">
                /{slug}
                <button
                  type="button"
                  aria-label={translateUi('remove_value0_e459697f', {
                    value0: String(slug),
                  })}
                  onClick={() =>
                    setStyleSlugs((current) => current.filter((value) => value !== slug))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="relative">
          {slash.menuProps ? <SlashMenu {...slash.menuProps} /> : null}
          <Textarea
            id={`element-${element.id}-styles`}
            ref={slash.ref}
            rows={1}
            className="min-h-9"
            value={styleDraft}
            disabled={styleSlugs.length >= ELEMENT_STYLE_SLUG_LIMIT}
            placeholder={
              styleSlugs.length >= ELEMENT_STYLE_SLUG_LIMIT
                ? translateUi('up_to_value0_styles_fdbb7aa8', {
                    value0: String(ELEMENT_STYLE_SLUG_LIMIT),
                  })
                : translateUi('type_to_add_a_style_76e95708')
            }
            onChange={(event) => setStyleDraft(event.target.value)}
            onSelect={slash.onSelect}
            onBlur={slash.close}
            onKeyDown={slash.onKeyDown}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('sent_with_every_generation_this_ele_6b3c9aaa')}{' '}
        </p>
        {styleHint ? <p className="text-xs text-destructive">{styleHint}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          size="sm"
          className="self-end"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              elementId: element.id,
              input: {
                memberRoles: roles,
                styleSlugs,
                boardElementIds: boardIds,
                expectedUpdatedAt: element.updatedAt,
              },
            })
          }
        >
          {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{' '}
          {translateUi('save_board_3bbd889c')}{' '}
        </Button>
        {saveError ? (
          <p className="text-xs text-destructive" role="alert">
            {saveErrorCopy
              ? translateUi(saveErrorCopy)
              : translateUi('could_not_save_the_board_4bd81b52')}
            {failureStyleSlugs.length
              ? ' ' +
                translateUi('elementErrorStyles', {
                  styles: new Intl.ListFormat(locale, {
                    style: 'long',
                    type: 'conjunction',
                  }).format(failureStyleSlugs.map((slug) => '/' + slug)),
                })
              : ''}
          </p>
        ) : update.isSuccess ? (
          <p className="text-xs text-muted-foreground" role="status">
            {' '}
            {translateUi('board_saved_60a975e3')}{' '}
          </p>
        ) : null}
      </div>
    </div>
  );
}
