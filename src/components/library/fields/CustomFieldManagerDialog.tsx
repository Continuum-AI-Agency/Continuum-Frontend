'use client';

// The brand's field vocabulary, editable in one place: create a field, rename
// it, reorder it, edit a select's options, delete it.
//
// A field's TYPE is fixed once created. Every value already stored is shaped by
// that type, and flipping single_select → date would leave a column of option
// ids that no longer mean anything; deleting the field and making a new one at
// least says out loud that the old answers are gone.
//
// Removing an OPTION does not rewrite the assets holding it. The contract keeps
// those ids valid until each asset is re-saved, and the surfaces render them as
// "Removed option" — silently rewriting history across a brand's library is the
// worse of the two failures.

import {
  type CustomField,
  type CustomFieldOption,
  type CustomFieldType,
  MAX_CUSTOM_FIELDS_PER_BRAND,
} from '@continuum/contracts';
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createCustomField,
  deleteCustomField,
  updateCustomField,
} from '@/lib/library/customFields';

const TYPE_LABEL: Record<CustomFieldType, string> = {
  single_select: 'Single select',
  multi_select: 'Multi select',
  text: 'Text',
  date: 'Date',
};

const SELECT_TYPES: CustomFieldType[] = ['single_select', 'multi_select'];

function newOption(label: string): CustomFieldOption {
  return { id: crypto.randomUUID(), label };
}

export type CustomFieldManagerDialogProps = {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: CustomField[];
  /** Re-reads the vocabulary after a write, so every surface sees the same list. */
  onChanged: () => void | Promise<void>;
};

export function CustomFieldManagerDialog({
  brandId,
  open,
  onOpenChange,
  fields,
  onChanged,
}: CustomFieldManagerDialogProps) {
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomField | null>(null);

  const run = async (work: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await work();
      await onChanged();
    } catch (err) {
      toast.error(`${failure} · ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const renameField = (field: CustomField, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === field.name) return;
    void run(
      () => updateCustomField({ brandId, fieldId: field.id, name: trimmed }),
      'Renaming the field failed',
    );
  };

  const saveOptions = (field: CustomField, options: CustomFieldOption[]) => {
    void run(
      () => updateCustomField({ brandId, fieldId: field.id, options }),
      'Saving the options failed',
    );
  };

  // Reorder is a SWAP of two positions, not a re-index of the whole list: the
  // two writes are independent, and a half-applied swap still leaves every field
  // with a position.
  const moveField = (index: number, direction: -1 | 1) => {
    const field = fields[index];
    const neighbour = fields[index + direction];
    if (!field || !neighbour) return;
    void run(
      () =>
        Promise.all([
          updateCustomField({ brandId, fieldId: field.id, position: neighbour.position }),
          updateCustomField({ brandId, fieldId: neighbour.id, position: field.position }),
        ]),
      'Reordering failed',
    );
  };

  const confirmDelete = () => {
    const field = pendingDelete;
    setPendingDelete(null);
    if (!field) return;
    void run(() => deleteCustomField({ brandId, fieldId: field.id }), 'Deleting the field failed');
  };

  const atCapacity = fields.length >= MAX_CUSTOM_FIELDS_PER_BRAND;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[80dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
            <DialogTitle className="text-sm">Custom fields</DialogTitle>
            <DialogDescription className="text-xs">
              Your brand's own metadata on an asset. Every field here can be filtered on, and a
              single-select can group the board.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {fields.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                No fields yet. Add one below — a rating, a usage-rights status, a shoot date.
              </p>
            ) : null}

            {fields.map((field, index) => (
              <FieldRow
                key={field.id}
                field={field}
                busy={busy}
                canMoveUp={index > 0}
                canMoveDown={index < fields.length - 1}
                onRename={(name) => renameField(field, name)}
                onMoveUp={() => moveField(index, -1)}
                onMoveDown={() => moveField(index, 1)}
                onSaveOptions={(options) => saveOptions(field, options)}
                onDelete={() => setPendingDelete(field)}
              />
            ))}
          </div>

          <div className="shrink-0 border-t border-border p-4">
            {atCapacity ? (
              <p className="text-xs text-muted-foreground">
                This brand has the maximum of {MAX_CUSTOM_FIELDS_PER_BRAND} fields.
              </p>
            ) : (
              <NewFieldForm
                busy={busy}
                onCreate={(input) =>
                  run(() => createCustomField({ brandId, ...input }), 'Creating the field failed')
                }
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => (!next ? setPendingDelete(null) : undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Every value your assets hold for this field is deleted with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete field</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FieldRow({
  field,
  busy,
  canMoveUp,
  canMoveDown,
  onRename,
  onMoveUp,
  onMoveDown,
  onSaveOptions,
  onDelete,
}: {
  field: CustomField;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: (name: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSaveOptions: (options: CustomFieldOption[]) => void;
  onDelete: () => void;
}) {
  const [draftOption, setDraftOption] = useState('');
  const isSelect = SELECT_TYPES.includes(field.type);

  const addOption = () => {
    const label = draftOption.trim();
    if (!label) return;
    setDraftOption('');
    onSaveOptions([...field.options, newOption(label)]);
  };

  const relabelOption = (optionId: string, label: string) => {
    const trimmed = label.trim();
    const existing = field.options.find((option) => option.id === optionId);
    if (!trimmed || !existing || existing.label === trimmed) return;
    // The id is untouched: the assets holding it keep their answer, and the new
    // label shows up wherever it is read.
    onSaveOptions(
      field.options.map((option) =>
        option.id === optionId ? { ...option, label: trimmed } : option,
      ),
    );
  };

  const removeOption = (optionId: string) => {
    if (field.options.length <= 1) {
      toast.error('A select field needs at least one option');
      return;
    }
    onSaveOptions(field.options.filter((option) => option.id !== optionId));
  };

  return (
    <div className="rounded-lg border border-border p-2">
      <div className="flex items-center gap-1.5">
        <Input
          defaultValue={field.name}
          disabled={busy}
          aria-label={`Field name: ${field.name}`}
          className="h-7 border-transparent bg-transparent px-1.5 text-xs font-medium shadow-none hover:border-border focus-visible:border-border"
          onBlur={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span className="shrink-0 text-2xs text-muted-foreground">{TYPE_LABEL[field.type]}</span>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            disabled={busy || !canMoveUp}
            aria-label={`Move ${field.name} up`}
            onClick={onMoveUp}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            disabled={busy || !canMoveDown}
            aria-label={`Move ${field.name} down`}
            onClick={onMoveDown}
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-destructive"
            disabled={busy}
            aria-label={`Delete ${field.name}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {isSelect ? (
        <div className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5 pl-1.5">
          {field.options.map((option) => (
            <div key={option.id} className="flex items-center gap-1">
              <Input
                defaultValue={option.label}
                disabled={busy}
                aria-label={`Option: ${option.label}`}
                className="h-7 border-transparent bg-transparent px-1.5 text-xs shadow-none hover:border-border focus-visible:border-border"
                onBlur={(event) => relabelOption(option.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground"
                disabled={busy}
                aria-label={`Remove option ${option.label}`}
                onClick={() => removeOption(option.id)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <Input
              value={draftOption}
              disabled={busy}
              placeholder="Add an option"
              aria-label={`Add an option to ${field.name}`}
              className="h-7 px-1.5 text-xs"
              onChange={(event) => setDraftOption(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addOption();
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground"
              disabled={busy || draftOption.trim().length === 0}
              aria-label={`Add option to ${field.name}`}
              onClick={addOption}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NewFieldForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: {
    name: string;
    type: CustomFieldType;
    options?: CustomFieldOption[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('single_select');
  const [optionsText, setOptionsText] = useState('');

  const isSelect = SELECT_TYPES.includes(type);
  const options = optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(newOption);
  const ready = name.trim().length > 0 && (!isSelect || options.length > 0);

  const submit = async () => {
    if (!ready || busy) return;
    await onCreate({
      name: name.trim(),
      type,
      ...(isSelect ? { options } : {}),
    });
    setName('');
    setOptionsText('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          disabled={busy}
          placeholder="New field name"
          aria-label="New field name"
          className="h-8 flex-1 text-xs"
          onChange={(event) => setName(event.target.value)}
        />
        <Select
          value={type}
          disabled={busy}
          onValueChange={(next) => setType(next as CustomFieldType)}
        >
          <SelectTrigger size="sm" className="h-8 w-32 text-xs" aria-label="New field type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_LABEL) as CustomFieldType[]).map((candidate) => (
              <SelectItem key={candidate} value={candidate} className="text-xs">
                {TYPE_LABEL[candidate]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0"
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add
        </Button>
      </div>
      {isSelect ? (
        <Textarea
          value={optionsText}
          disabled={busy}
          rows={3}
          placeholder="One option per line"
          aria-label="New field options, one per line"
          className="resize-none text-xs"
          onChange={(event) => setOptionsText(event.target.value)}
        />
      ) : null}
    </div>
  );
}
