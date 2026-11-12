'use client';

// Create an Element: a name, a category, up to eight images of the SAME subject, and
// the two text fields that decide whether the reference is usable.
//
// rightsNote is not decoration. `creativeReferenceSchema` REFUSES a
// preserve-person-identity reference that has none, so a model/character Element
// without one is a compile error the first time it reaches the creative-direction
// compiler. The form refuses first, where the user can still answer the question.

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, X } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUiErrorMessage } from '@/i18n/errors';
import { useValidationErrorMap } from '@/i18n/validation';
import {
  ELEMENT_CATEGORIES,
  ELEMENT_MEMBER_LIMIT,
  type ElementCategory,
  elementRequiresRightsNote,
} from '@/lib/ai-studio/elements';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { elementCategoryGuidance, elementCategoryLabel } from './elementPresentation';

export interface StagedElementMember {
  assetId: string;
  previewUrl?: string;
  fileName: string;
}

export type ElementMemberUploader = (params: {
  file: File;
  brandId: string;
}) => Promise<{ assetId: string; versionId: string; signedUrl: string }>;

const createElementSchema = (translateUi: ReturnType<typeof useUiTranslations<'studio'>>) =>
  z.object({
    name: z.string().min(1, translateUi('validationElementNameRequired')),
    category: z.enum(ELEMENT_CATEGORIES),
    guidelines: z.string().optional(),
    rightsNote: z.string().optional(),
  });

type CreateElementFormValues = z.infer<ReturnType<typeof createElementSchema>>;

export interface ElementCreateFormProps {
  brandId: string;
  isSaving?: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    category: ElementCategory;
    memberAssetIds: string[];
    guidelines: string | null;
    rightsNote: string | null;
  }) => void;
  /** Injected in tests; the real seam is the library upload edge function. */
  uploadAsset?: ElementMemberUploader;
}

export function ElementCreateForm({
  brandId,
  isSaving = false,
  onCancel,
  onSubmit,
  uploadAsset,
}: ElementCreateFormProps) {
  const validationErrorMap = useValidationErrorMap();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

  const [members, setMembers] = React.useState<StagedElementMember[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const upload = uploadAsset ?? ((params) => uploadMediaAsset(params));

  const form = useForm<CreateElementFormValues>({
    resolver: zodResolver(createElementSchema(translateUi), {
      error: validationErrorMap,
    }),
    defaultValues: {
      name: '',
      category: 'product',
      guidelines: '',
      rightsNote: '',
    },
    mode: 'onSubmit',
  });

  const category = form.watch('category');
  const rightsNote = form.watch('rightsNote');
  const needsRights = elementRequiresRightsNote(category);
  const remaining = ELEMENT_MEMBER_LIMIT - members.length;

  const missingRights = needsRights && !(rightsNote ?? '').trim();
  const canSubmit = members.length > 0 && !missingRights && !uploading && !isSaving;

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;

    // The cap is enforced in the Backend route too; refusing here is what keeps the
    // user from uploading four files and being told about it afterwards.
    const accepted = picked.slice(0, remaining);
    const overflow = picked.length - accepted.length;
    setUploadError(
      overflow > 0
        ? `An Element holds at most ${ELEMENT_MEMBER_LIMIT} images — ${overflow} not added.`
        : null,
    );
    if (accepted.length === 0) return;

    setUploading(true);
    try {
      for (const file of accepted) {
        const result = await upload({ file, brandId });
        setMembers((current) => [
          ...current,
          {
            assetId: result.assetId,
            previewUrl: result.signedUrl,
            fileName: file.name,
          },
        ]);
      }
    } catch (error) {
      setUploadError(uiErrorText(error));
    } finally {
      setUploading(false);
    }
  };

  const submit = form.handleSubmit((values) => {
    if (!canSubmit) return;
    onSubmit({
      name: values.name.trim(),
      category: values.category,
      memberAssetIds: members.map((member) => member.assetId),
      guidelines: values.guidelines?.trim() || null,
      rightsNote: values.rightsNote?.trim() || null,
    });
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} data-testid="element-create-form">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-name">{translateUi('name_dcd1d522')}</Label>
        <Input
          id="element-name"
          placeholder={translateUi('aria_brand_model_eb8739dc')}
          {...form.register('name')}
        />
        {form.formState.errors.name ? (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-category">{translateUi('category_292c06f0')}</Label>
        <Select
          value={category}
          onValueChange={(value) => form.setValue('category', value as ElementCategory)}
        >
          <SelectTrigger id="element-category" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ELEMENT_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {elementCategoryLabel(value, translateUi)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {elementCategoryGuidance(category, translateUi)}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-images">{translateUi('images_be7e2f20')}</Label>
        <p className="text-xs text-muted-foreground">
          {translateUi(category === 'style' ? 'elementStyleInputGuidance' : 'elementInputGuidance')}
        </p>
        <div className="flex flex-wrap gap-2">
          {members.map((member, index) => (
            <div
              key={member.assetId}
              className="relative h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-muted/40"
            >
              {member.previewUrl ? (
                // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
                <img
                  src={member.previewUrl}
                  alt={member.fileName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xs">
                  {index + 1}
                </span>
              )}
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={translateUi('remove_value0_3028bf7d', {
                  value0: String(member.fileName),
                })}
                className="absolute right-0 top-0 h-5 w-5 rounded-none rounded-bl"
                onClick={() =>
                  setMembers((current) => current.filter((item) => item.assetId !== member.assetId))
                }
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {remaining > 0 ? (
            <Label
              htmlFor="element-images"
              className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground hover:bg-muted/40"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Label>
          ) : null}
        </div>
        <Input
          id="element-images"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-5 px-2 text-2xs">
            {members.length}/{ELEMENT_MEMBER_LIMIT}
          </Badge>
          {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-guidelines">{translateUi('guidelines_c4f9417b')}</Label>
        <Textarea
          id="element-guidelines"
          rows={2}
          placeholder={translateUi('the_matte_finish_not_the_glossy_one_10ad94e8')}
          {...form.register('guidelines')}
        />
        <p className="text-xs text-muted-foreground">{translateUi('elementGuidelinesGuidance')}</p>
      </div>

      {needsRights ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="element-rights">{translateUi('rights_basis_c272d465')}</Label>
          <Input
            id="element-rights"
            placeholder={translateUi('own_employee_consent_on_file_4131e603')}
            {...form.register('rightsNote')}
          />
          <p className="text-xs text-muted-foreground">{translateUi('elementRightsGuidance')}</p>
          {missingRights ? (
            <p className="text-xs text-destructive">
              {translateUi('elementRightsMissingSave', {
                category: elementCategoryLabel(category, translateUi),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {needsRights ? (
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('elementCharacterCreationGuidance', {
            category: elementCategoryLabel(category, translateUi).toLowerCase(),
          })}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {' '}
          {translateUi('cancel_19766ed6')}{' '}
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {needsRights
            ? translateUi('create_and_make_character_sheet_fd9c5449')
            : translateUi('create_element_635864da')}
        </Button>
      </div>
    </form>
  );
}
