'use client';

import { readFontNames } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { uploadBrandFont } from '@/lib/library/templateSources';

const rowSchema = z.object({
  family: z.string().trim().min(1, 'Family is required').max(120),
  weight: z
    .string()
    .refine(
      (value) =>
        value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1000),
      'Use a whole number from 1 to 1000',
    ),
  style: z.enum(['normal', 'italic']),
});
const formSchema = z.object({ fonts: z.array(rowSchema).min(1) });
type FormValues = z.infer<typeof formSchema>;

const familyFromFileName = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || name;

export function FontUploadReviewDialog({
  brandId,
  files,
  onClose,
  onUploaded,
}: {
  brandId: string;
  files: File[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [activeFiles, setActiveFiles] = useState(files);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getFieldState,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fonts: files.map((file) => ({
        family: familyFromFileName(file.name),
        weight: '',
        style: 'normal',
      })),
    },
  });

  // A filename is a guess, and packages ship hashed ones (`2f0cf17….ttf`). The file's own
  // PostScript name is what a template asks for, and unique per face, so two weights of one
  // family never land on the same stored object.
  useEffect(() => {
    let current = true;
    void Promise.all(files.map(async (file) => readFontNames(await file.arrayBuffer()))).then(
      (names) => {
        if (!current) return;
        names.forEach((name, index) => {
          if (!name?.postScriptName || getFieldState(`fonts.${index}.family`).isDirty) return;
          setValue(`fonts.${index}.family`, name.postScriptName);
          if (/italic|oblique/i.test(name.subfamily ?? ''))
            setValue(`fonts.${index}.style`, 'italic');
        });
      },
    );
    return () => {
      current = false;
    };
  }, [files, getFieldState, setValue]);

  const submit = handleSubmit(async ({ fonts }) => {
    setSaving(true);
    const failedFiles: File[] = [];
    const failedRows: FormValues['fonts'] = [];
    const failures: string[] = [];
    let stored = 0;
    for (const [index, file] of activeFiles.entries()) {
      const row = fonts[index];
      try {
        await uploadBrandFont({
          brandId,
          family: row.family.trim(),
          file,
          ...(row.weight === '' ? {} : { weight: Number(row.weight) }),
          style: row.style,
        });
        stored += 1;
      } catch (error) {
        failedFiles.push(file);
        failedRows.push(row);
        failures.push(error instanceof Error ? error.message : 'Could not be stored');
      }
    }
    setSaving(false);
    setSaved((value) => value + stored);
    if (stored > 0) onUploaded();
    if (failedFiles.length > 0) {
      setActiveFiles(failedFiles);
      setRowErrors(failures);
      reset({ fonts: failedRows });
    } else {
      setActiveFiles([]);
      setRowErrors([]);
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Review font metadata</DialogTitle>
          <DialogDescription>
            Confirm the family and optional face details before these licensed files are stored
            privately. No browser font URL or specimen is created.
          </DialogDescription>
        </DialogHeader>

        {activeFiles.length > 0 ? (
          <form className="space-y-4" onSubmit={submit}>
            {activeFiles.map((file, index) => (
              <fieldset
                key={`${file.name}-${file.size}`}
                className="space-y-2 rounded-lg border p-3"
              >
                <legend className="max-w-full truncate px-1 text-xs font-medium">
                  {file.name}
                </legend>
                <label htmlFor={`font-family-${index}`} className="block space-y-1 text-xs">
                  <span>Family</span>
                  <Input
                    id={`font-family-${index}`}
                    aria-invalid={Boolean(errors.fonts?.[index]?.family)}
                    aria-describedby={
                      errors.fonts?.[index]?.family ? `font-family-error-${index}` : undefined
                    }
                    aria-label={
                      activeFiles.length === 1 ? 'Font family' : `${file.name} font family`
                    }
                    {...register(`fonts.${index}.family`)}
                  />
                  {errors.fonts?.[index]?.family ? (
                    <span
                      id={`font-family-error-${index}`}
                      role="alert"
                      className="text-destructive"
                    >
                      {errors.fonts[index].family.message}
                    </span>
                  ) : null}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label htmlFor={`font-weight-${index}`} className="block space-y-1 text-xs">
                    <span>Weight (optional)</span>
                    <Input
                      id={`font-weight-${index}`}
                      inputMode="numeric"
                      aria-invalid={Boolean(errors.fonts?.[index]?.weight)}
                      aria-describedby={
                        errors.fonts?.[index]?.weight ? `font-weight-error-${index}` : undefined
                      }
                      aria-label={
                        activeFiles.length === 1 ? 'Weight (optional)' : `${file.name} weight`
                      }
                      placeholder="400"
                      {...register(`fonts.${index}.weight`)}
                    />
                    {errors.fonts?.[index]?.weight ? (
                      <span
                        id={`font-weight-error-${index}`}
                        role="alert"
                        className="text-destructive"
                      >
                        {errors.fonts[index].weight.message}
                      </span>
                    ) : null}
                  </label>
                  <label htmlFor={`font-style-${index}`} className="block space-y-1 text-xs">
                    <span>Style</span>
                    <select
                      id={`font-style-${index}`}
                      aria-label={activeFiles.length === 1 ? 'Style' : `${file.name} style`}
                      className="h-9 w-full rounded-md border border-input bg-background px-2"
                      {...register(`fonts.${index}.style`)}
                    >
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </label>
                </div>
                {rowErrors[index] ? (
                  <p role="alert" className="text-xs text-destructive">
                    {rowErrors[index]}
                  </p>
                ) : null}
              </fieldset>
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Add to engine
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <p role="status" className="text-sm">
              {saved} {saved === 1 ? 'face' : 'faces'} added to the engine.
            </p>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
