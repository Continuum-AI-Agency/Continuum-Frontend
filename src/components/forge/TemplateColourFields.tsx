'use client';

/**
 * Marks a published template's render fields as colours, for a colour the forge reflected as text.
 * The Backend retypes a marked field to `color`, so every renderer shows a colour picker. A colour
 * the forge detected is shown on and locked: this only promotes text, it never demotes.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { Switch } from '@/components/ui/switch';
import { fetchTemplateColourFields, saveTemplateColourFields } from '@/lib/library/templateSources';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

export function TemplateColourFields({
  brandId,
  assetId,
  templateKey,
}: {
  brandId: string;
  assetId: string;
  templateKey: string;
}) {
  const queryClient = useQueryClient();
  // The same key TemplateDetail reads the published contract under, so this is not a second fetch.
  const contract = useQuery({
    queryKey: forgeQueryKeys.contract(brandId, null, templateKey),
    queryFn: () => apiRendersApi.getContract(brandId, templateKey),
    retry: false,
  });
  const marked = useQuery({
    queryKey: forgeQueryKeys.colourFields(brandId, assetId, templateKey),
    queryFn: () => fetchTemplateColourFields(brandId, assetId, templateKey),
  });
  const save = useMutation({
    mutationFn: (keys: string[]) =>
      saveTemplateColourFields(brandId, assetId, { templateKey, keys }),
    // Held pending until the contracts have refetched, so a switch never shows the old kind.
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: forgeQueryKeys.contracts(brandId) });
      queryClient.setQueryData(forgeQueryKeys.colourFields(brandId, assetId, templateKey), saved);
    },
  });

  const fields = (contract.data?.variables ?? []).filter(
    (variable) => variable.kind === 'text' || variable.kind === 'color',
  );
  if (!fields.length) return null;
  const keys = marked.data?.keys ?? [];

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
        Colour fields
      </p>
      {fields.map((field) => {
        const isMarked = keys.includes(field.key);
        const detected = field.kind === 'color' && !isMarked;
        return (
          <div key={field.key} className="flex items-center justify-between gap-2 text-xs">
            <span>
              {field.label}
              {detected ? (
                <span className="text-muted-foreground"> · detected from the template</span>
              ) : null}
            </span>
            <Switch
              size="sm"
              aria-label={`${field.label} is a colour`}
              checked={field.kind === 'color'}
              disabled={detected || save.isPending || !marked.isSuccess}
              onCheckedChange={(on) =>
                save.mutate(on ? [...keys, field.key] : keys.filter((key) => key !== field.key))
              }
            />
          </div>
        );
      })}
      {save.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Colour fields could not be saved. {save.error.message}
        </p>
      ) : null}
    </div>
  );
}
