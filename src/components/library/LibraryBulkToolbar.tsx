'use client';

import type {
  CustomField,
  CustomFieldValue,
  MediaCollection,
  Project,
} from '@continuum/contracts';
import {
  Check,
  FolderInput,
  FolderOpen,
  Link2,
  ListPlus,
  Loader2,
  Tag,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { useState } from 'react';
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
  DialogFooter,
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
import {
  bulkDeleteAssetsOperation,
  bulkSetAssetFieldValueOperation,
  bulkTransitionAssetReviewOperation,
  bulkUpdateAssetTagsOperation,
  mutateCollectionMembershipOperation,
} from '@/lib/library/creativeOperations';
import { createShareLink } from '@/lib/library/share';
import { useProjectMutations } from '@/lib/projects';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/** Sentinel value for the inline "New project…" row; never a real project id. */
const NEW_PROJECT = '__new_project__';

export function LibraryBulkToolbar({
  brandId,
  assetIds,
  collections,
  projects,
  customFields,
  currentCollectionId,
  onClear,
  onCompleted,
}: {
  brandId: string;
  assetIds: string[];
  collections: MediaCollection[];
  projects: Project[];
  customFields: CustomField[];
  currentCollectionId: string | null;
  onClear: () => void;
  onCompleted: () => void;
}) {
  const [collectionId, setCollectionId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [tag, setTag] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const client = () => createSupabaseBrowserClient();
  // Tagging is what makes the Library's Project filter mean anything: without it the filter
  // can only ever narrow to nothing.
  const {
    tag: tagIntoProject,
    untag: untagFromProject,
    create: createProject,
  } = useProjectMutations(brandId);
  const selectedField = customFields.find((field) => field.id === fieldId) ?? null;
  const fieldPayload: CustomFieldValue =
    selectedField?.type === 'multi_select'
      ? fieldValue
        ? [fieldValue]
        : null
      : fieldValue || null;

  /**
   * Create the project and tag the selection in ONE gesture.
   *
   * The measured cost of a first project was six to eight gestures across two surfaces:
   * leave the Library, open Settings, find the section, create, come back, re-select the
   * assets, tag. Every one of those was a chance to abandon, and the selection did not
   * survive the trip. Both mutations run under a single `run` so a failure in either
   * reports once, and the toolbar's own busy state covers the pair.
   */
  async function createAndTag() {
    const name = newProjectName.trim();
    if (!name) return;
    await run('Created project and tagged', async () => {
      const project = await createProject.mutateAsync({ name, adAccountIds: [], campaignIds: [] });
      await tagIntoProject.mutateAsync({
        projectId: project.id,
        entityType: 'asset',
        entityIds: assetIds,
      });
      setProjectId(project.id);
    });
    setNewProjectOpen(false);
    setNewProjectName('');
  }

  const onProjectChange = (value: string) => {
    if (value === NEW_PROJECT) {
      setNewProjectOpen(true);
      return;
    }
    setProjectId(value);
  };

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
      {/* Rendered unconditionally, including at zero projects. It used to disappear when the
          brand had none — which is every brand — so the only way to reach a project from the
          Library was to leave for Settings, create one, and come back to a lost selection.
          NEW_PROJECT below turns that round trip into one gesture. */}
      <div className="flex items-center gap-1 rounded-md border border-border bg-background pl-2">
        <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden />
        <Select value={projectId} onValueChange={onProjectChange}>
          <SelectTrigger size="sm" className="h-7 w-32 border-0 shadow-none" aria-label="Project">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW_PROJECT}>New project…</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={!projectId || Boolean(busy)}
          onClick={() =>
            void run('Tagged into project', () =>
              tagIntoProject.mutateAsync({
                projectId,
                entityType: 'asset',
                entityIds: assetIds,
              }),
            )
          }
        >
          Tag
        </Button>
        {/* Untag had no caller anywhere in the app, so the DELETE route was unreachable and
            a bulk mis-tag was permanent from the product. Undo belongs next to the action. */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-muted-foreground"
          disabled={!projectId || Boolean(busy)}
          onClick={() =>
            void run('Removed from project', () =>
              untagFromProject.mutateAsync({
                projectId,
                entityType: 'asset',
                entityIds: assetIds,
              }),
            )
          }
        >
          Untag
        </Button>
      </div>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Creates the project and adds the {assetIds.length} selected{' '}
              {assetIds.length === 1 ? 'asset' : 'assets'} to it.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newProjectName}
            placeholder="Winter challenge"
            onChange={(event) => setNewProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createAndTag();
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              disabled={!newProjectName.trim() || Boolean(busy)}
              onClick={() => void createAndTag()}
            >
              Create and add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={Boolean(busy)}
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 className="size-3.5" />
        Delete
      </Button>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Delete {assetIds.length === 1 ? 'this asset' : `these ${assetIds.length} assets`}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              They leave your library, along with every slide of any carousel you selected.
              Comments, versions and approvals are kept, and support can still bring them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingDelete(false);
                void run('Deleted', async () => {
                  await bulkDeleteAssetsOperation(client(), { brandId, assetIds });
                  onClear();
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
