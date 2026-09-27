'use client';

import {
  type CustomField,
  type CustomFieldValue,
  ELEMENT_MEMBER_LIMIT,
  type MediaCollection,
  type Project,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  FolderInput,
  FolderOpen,
  Layers,
  Link2,
  ListPlus,
  Loader2,
  Tag,
  Trash2,
  UserCheck,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { createElement, elementsQueryKey } from '@/lib/ai-studio/elements';
import {
  BULK_CHUNK_SIZE,
  fetchAllMatchingAssetIds,
  writeInChunks,
} from '@/lib/library/bulkSelection';
import {
  bulkDeleteAssetsOperation,
  bulkSetAssetFieldValueOperation,
  bulkTransitionAssetReviewOperation,
  bulkUpdateAssetTagsOperation,
  mutateCollectionMembershipOperation,
} from '@/lib/library/creativeOperations';
import { createCustomField } from '@/lib/library/customFields';
import { createShareLink } from '@/lib/library/share';
import { useLibraryAccess } from '@/lib/library/useBrandRole';
import { useProjectMutations } from '@/lib/projects';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { CustomFieldValueEditor } from './fields/CustomFieldValueEditor';
import { ShareBoxDialog } from './ShareBoxDialog';

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
  onProjectCreatedAction,
}: {
  brandId: string;
  assetIds: string[];
  collections: MediaCollection[];
  projects: Project[];
  customFields: CustomField[];
  currentCollectionId: string | null;
  onClear: () => void;
  onCompleted: () => void;
  /**
   * Called with the id of a project created inline, so the viewer can point the Library at
   * it. Without this the whole create-and-tag gesture ends with the screen unchanged: the
   * project exists, the assets are in it, and nothing on the page shows either.
   */
  onProjectCreatedAction?: (projectId: string) => void;
}) {
  const [collectionId, setCollectionId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [tag, setTag] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [fieldValue, setFieldValue] = useState<CustomFieldValue>(null);
  const [assignFieldId, setAssignFieldId] = useState('');
  const [assignee, setAssignee] = useState<CustomFieldValue>(null);
  // "Select all matching" widens the target past what the grid has loaded; any change
  // to the hand-picked selection narrows it back.
  const [matchingIds, setMatchingIds] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const selectionKey = assetIds.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectionKey is the selection
  useEffect(() => setMatchingIds(null), [selectionKey]);
  const targetIds = matchingIds ?? assetIds;
  const { canEdit } = useLibraryAccess(brandId, { collectionId: currentCollectionId });
  const userFields = customFields.filter((field) => field.type === 'user');
  const assignField =
    userFields.find((field) => field.id === assignFieldId) ?? userFields[0] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const client = () => createSupabaseBrowserClient();
  // Tagging is what makes the Library's Project filter mean anything: without it the filter
  // can only ever narrow to nothing.
  const {
    tag: tagIntoProject,
    untag: untagFromProject,
    create: createProject,
  } = useProjectMutations(brandId);
  const selectedField = customFields.find((field) => field.id === fieldId) ?? null;

  const writeChunked = (write: (chunk: string[]) => Promise<unknown>) =>
    writeInChunks(targetIds, write, (done, total) =>
      setProgress(total > BULK_CHUNK_SIZE ? `${done} / ${total}` : null),
    );

  async function selectAllMatching() {
    setBusy('Selecting');
    setMessage(null);
    try {
      const ids = await fetchAllMatchingAssetIds({
        brandId,
        search: window.location.search,
        collectionId: currentCollectionId,
      });
      setMatchingIds(ids);
      setMessage(`All ${ids.length} matching selected`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Selecting failed');
    } finally {
      setBusy(null);
    }
  }

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
      // Show the thing that was just made. Four clicks that leave the page identical read
      // as "did that work?", and the answer lives two more gestures deep in a popover.
      onProjectCreatedAction?.(project.id);
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
      setMessage(`${label} · ${targetIds.length} ${targetIds.length === 1 ? 'asset' : 'assets'}`);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  // Every action here is a write the dispatcher refuses a viewer, so a viewer gets the
  // selection and nothing to press.
  if (!canEdit) {
    return (
      <div className="sticky top-0 z-20 flex items-center gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-sm backdrop-blur">
        <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground">
          <Check className="size-3.5 text-primary" aria-hidden />
          {targetIds.length} selected
        </span>
        <span className="flex-1 text-xs text-muted-foreground">
          View only — your role cannot change these assets.
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

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-sm backdrop-blur">
      <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground">
        <Check className="size-3.5 text-primary" aria-hidden />
        {targetIds.length} selected
      </span>
      {matchingIds === null ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          disabled={Boolean(busy)}
          onClick={() => void selectAllMatching()}
        >
          Select all matching
        </Button>
      ) : null}
      <div className="flex items-center gap-1 rounded-md border border-border bg-background pl-2">
        <UserCheck className="size-3.5 text-muted-foreground" aria-hidden />
        {userFields.length > 1 ? (
          <Select value={assignField?.id ?? ''} onValueChange={setAssignFieldId}>
            <SelectTrigger
              size="sm"
              className="h-7 w-24 border-0 shadow-none"
              aria-label="Assign field"
            >
              <SelectValue
                placeholder="Field"
                items={Object.fromEntries(userFields.map((field) => [field.id, field.name]))}
              />
            </SelectTrigger>
            <SelectContent>
              {userFields.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {field.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {assignField ? (
          <>
            <div className="w-36">
              <CustomFieldValueEditor
                field={assignField}
                value={assignee}
                disabled={Boolean(busy)}
                onChange={setAssignee}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              disabled={Boolean(busy)}
              onClick={() =>
                void run(assignee ? 'Assigned' : 'Unassigned', () =>
                  writeChunked((chunk) =>
                    bulkSetAssetFieldValueOperation(client(), {
                      brandId,
                      assetIds: chunk,
                      fieldId: assignField.id,
                      value: assignee,
                    }),
                  ),
                )
              }
            >
              Assign
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Assignee field added', async () => {
                await createCustomField({ brandId, name: 'Assignee', type: 'user' });
              })
            }
          >
            Add an Assignee field
          </Button>
        )}
      </div>
      <Select value={collectionId} onValueChange={setCollectionId}>
        <SelectTrigger size="sm" className="h-8 w-44" aria-label="Destination collection">
          <SelectValue
            placeholder="Choose collection"
            items={Object.fromEntries(
              collections.map((collection) => [collection.id, collection.name]),
            )}
          />
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
            writeChunked((chunk) =>
              mutateCollectionMembershipOperation(client(), {
                brandId,
                collectionId,
                assetIds: chunk,
                mode: 'add',
              }),
            ),
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
              writeChunked((chunk) =>
                mutateCollectionMembershipOperation(client(), {
                  brandId,
                  collectionId: currentCollectionId,
                  assetIds: chunk,
                  mode: 'remove',
                }),
              ),
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
            <SelectValue
              placeholder="Project"
              items={{
                ...Object.fromEntries(projects.map((project) => [project.id, project.name])),
                [NEW_PROJECT]: 'New project…',
              }}
            />
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
              const addTags = [tag.trim()];
              await writeChunked((chunk) =>
                bulkUpdateAssetTagsOperation(client(), { brandId, assetIds: chunk, addTags }),
              );
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
            <SelectValue
              placeholder="Review status"
              items={{
                draft: 'Draft',
                in_review: 'In review',
                needs_changes: 'Needs changes',
                approved: 'Approved',
              }}
            />
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
              writeChunked((chunk) =>
                bulkTransitionAssetReviewOperation(client(), {
                  brandId,
                  assetIds: chunk,
                  toStatus: reviewStatus as 'draft' | 'in_review' | 'needs_changes' | 'approved',
                }),
              ),
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
              setFieldValue(null);
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-28 border-0 shadow-none"
              aria-label="Custom field"
            >
              <SelectValue
                placeholder="Field"
                items={Object.fromEntries(customFields.map((field) => [field.id, field.name]))}
              />
            </SelectTrigger>
            <SelectContent>
              {customFields.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {field.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedField ? (
            <div className="w-40">
              <CustomFieldValueEditor
                field={selectedField}
                value={fieldValue}
                disabled={Boolean(busy)}
                onChange={setFieldValue}
              />
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={!selectedField || fieldValue === null || Boolean(busy)}
            onClick={() =>
              void run('Field updated', () =>
                writeChunked((chunk) =>
                  bulkSetAssetFieldValueOperation(client(), {
                    brandId,
                    assetIds: chunk,
                    fieldId,
                    value: fieldValue,
                  }),
                ),
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
          void run('Share box ready', async () => {
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
            setShareUrl(url);
          })
        }
      >
        <Link2 className="size-3.5" />
        Share box
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy) || assetIds.length === 0}
        onClick={() =>
          void run('Marked as Element', async () => {
            await createElement({
              brandId,
              name:
                assetIds.length === 1
                  ? 'Library Element'
                  : `Library Element (${Math.min(assetIds.length, ELEMENT_MEMBER_LIMIT)})`,
              category: 'general',
              memberAssetIds: assetIds.slice(0, ELEMENT_MEMBER_LIMIT),
            });
            await queryClient.invalidateQueries({ queryKey: elementsQueryKey(brandId) });
          })
        }
      >
        <Layers className="size-3.5" />
        Mark as Element
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
                  await writeChunked((chunk) =>
                    bulkDeleteAssetsOperation(client(), { brandId, assetIds: chunk }),
                  );
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
        {busy ? (
          <span className="inline-flex items-center gap-1.5">
            {progress}
            <Loader2 className="size-3.5 animate-spin" />
          </span>
        ) : (
          message
        )}
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
      <ShareBoxDialog
        open={shareUrl !== null}
        url={shareUrl}
        onOpenChange={(open) => {
          if (!open) setShareUrl(null);
        }}
      />
    </div>
  );
}
