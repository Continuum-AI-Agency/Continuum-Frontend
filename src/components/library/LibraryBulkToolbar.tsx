'use client';

import type { CustomField, CustomFieldValue, MediaCollection } from '@continuum/contracts';
import { Check, FolderInput, Link2, ListPlus, Loader2, Tag, Workflow, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  bulkSetAssetFieldValueOperation,
  bulkTransitionAssetReviewOperation,
  bulkUpdateAssetTagsOperation,
  mutateCollectionMembershipOperation,
} from '@/lib/library/creativeOperations';
import { createShareLink } from '@/lib/library/share';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LibraryBulkToolbar({
  brandId,
  assetIds,
  collections,
  customFields,
  currentCollectionId,
  onClear,
  onCompleted,
}: {
  brandId: string;
  assetIds: string[];
  collections: MediaCollection[];
  customFields: CustomField[];
  currentCollectionId: string | null;
  onClear: () => void;
  onCompleted: () => void;
}) {
  const [collectionId, setCollectionId] = useState('');
  const [tag, setTag] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const client = () => createSupabaseBrowserClient();
  const selectedField = customFields.find((field) => field.id === fieldId) ?? null;
  const fieldPayload: CustomFieldValue =
    selectedField?.type === 'multi_select'
      ? fieldValue
        ? [fieldValue]
        : null
      : fieldValue || null;

  async function run(label: string, operation: () => Promise<unknown>) {
    setBusy(label);
    setMessage(null);
    try {
      await operation();
      setMessage(`${label} complete`);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-sm backdrop-blur">
      <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground">
        <Check className="size-3.5 text-primary" aria-hidden />
        {assetIds.length} selected
      </span>
      <Select value={collectionId} onValueChange={setCollectionId}>
        <SelectTrigger size="sm" className="h-8 w-44" aria-label="Destination collection">
          <SelectValue placeholder="Choose collection" />
        </SelectTrigger>
        <SelectContent>
          {collections
            .filter((collection) => collection.kind === 'manual')
            .map((collection) => (
              <SelectItem key={collection.id} value={collection.id}>
                {collection.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!collectionId || Boolean(busy)}
        onClick={() =>
          void run('Added to collection', () =>
            mutateCollectionMembershipOperation(client(), {
              brandId,
              collectionId,
              assetIds,
              mode: 'add',
            }),
          )
        }
      >
        <FolderInput className="size-3.5" />
        Add
      </Button>
      {currentCollectionId ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() =>
            void run('Removed from collection', () =>
              mutateCollectionMembershipOperation(client(), {
                brandId,
                collectionId: currentCollectionId,
                assetIds,
                mode: 'remove',
              }),
            )
          }
        >
          Remove here
        </Button>
      ) : null}
      <div className="flex items-center rounded-md border border-border bg-background pl-2">
        <Tag className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder="Add tag"
          className="h-7 w-28 bg-transparent px-2 text-xs outline-none"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={!tag.trim() || Boolean(busy)}
          onClick={() =>
            void run('Tags updated', async () => {
              await bulkUpdateAssetTagsOperation(client(), {
                brandId,
                assetIds,
                addTags: [tag.trim()],
              });
              setTag('');
            })
          }
        >
          Apply
        </Button>
      </div>
      <div className="flex items-center gap-1 rounded-md border border-border bg-background pl-2">
        <Workflow className="size-3.5 text-muted-foreground" aria-hidden />
        <Select value={reviewStatus} onValueChange={setReviewStatus}>
          <SelectTrigger
            size="sm"
            className="h-7 w-32 border-0 shadow-none"
            aria-label="Review status"
          >
            <SelectValue placeholder="Review status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="needs_changes">Needs changes</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={!reviewStatus || Boolean(busy)}
          onClick={() =>
            void run('Review status updated', () =>
              bulkTransitionAssetReviewOperation(client(), {
                brandId,
                assetIds,
                toStatus: reviewStatus as 'draft' | 'in_review' | 'needs_changes' | 'approved',
              }),
            )
          }
        >
          Apply
        </Button>
      </div>
      {customFields.length > 0 ? (
        <div className="flex items-center gap-1 rounded-md border border-border bg-background pl-2">
          <ListPlus className="size-3.5 text-muted-foreground" aria-hidden />
          <Select
            value={fieldId}
            onValueChange={(value) => {
              setFieldId(value);
              setFieldValue('');
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-28 border-0 shadow-none"
              aria-label="Custom field"
            >
              <SelectValue placeholder="Field" />
            </SelectTrigger>
            <SelectContent>
              {customFields.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {field.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedField?.type === 'single_select' || selectedField?.type === 'multi_select' ? (
            <Select value={fieldValue} onValueChange={setFieldValue}>
              <SelectTrigger
                size="sm"
                className="h-7 w-28 border-0 shadow-none"
                aria-label="Field value"
              >
                <SelectValue placeholder="Value" />
              </SelectTrigger>
              <SelectContent>
                {selectedField.options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : selectedField ? (
            <input
              type={selectedField.type === 'date' ? 'date' : 'text'}
              value={fieldValue}
              onChange={(event) => setFieldValue(event.target.value)}
              placeholder="Value"
              aria-label="Field value"
              className="h-7 w-28 bg-transparent px-2 text-xs outline-none"
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={!selectedField || !fieldValue || Boolean(busy)}
            onClick={() =>
              void run('Field updated', () =>
                bulkSetAssetFieldValueOperation(client(), {
                  brandId,
                  assetIds,
                  fieldId,
                  value: fieldPayload,
                }),
              )
            }
          >
            Set
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() =>
          void run('Share link copied', async () => {
            const link = await createShareLink({
              brandId,
              scope: 'selection',
              assetIds,
              versionMode: 'live',
              allowComments: true,
              allowApproval: false,
              allowDownload: true,
              showMetadata: true,
              showCustomFields: false,
              requireIdentity: false,
            });
            const url = link.url ?? `${window.location.origin}/share/${link.token}`;
            await navigator.clipboard.writeText(url);
          })
        }
      >
        <Link2 className="size-3.5" />
        Share
      </Button>
      <span
        className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground"
        role="status"
      >
        {busy ? <Loader2 className="ml-auto size-3.5 animate-spin" /> : message}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
