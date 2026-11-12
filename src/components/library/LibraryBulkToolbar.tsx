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
  Columns2,
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
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { createElement, elementsQueryKey } from '@/lib/ai-studio/elements';
import {
  BULK_CHUNK_SIZE,
  fetchAllMatchingAssetIds,
  writeInChunksSkippingVanished,
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
import { mediaSchema } from '@/lib/media/supabase-media';
import { useProjectMutations } from '@/lib/projects';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { CompareAssetsDialog } from './detail/compare/CompareAssetsDialog';
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
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

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
  const { canEdit } = useLibraryAccess(brandId, {
    collectionId: currentCollectionId,
  });
  const userFields = customFields.filter((field) => field.type === 'user');
  const assignField =
    userFields.find((field) => field.id === assignFieldId) ?? userFields[0] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
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

  // How many assets the last chunked write actually reached; run() reports it.
  const writtenCount = useRef<number | null>(null);

  // A chunk refused because a teammate deleted one of its assets is rewritten without it.
  const writeChunked = async (write: (chunk: string[]) => Promise<unknown>) => {
    writtenCount.current = await writeInChunksSkippingVanished(
      targetIds,
      write,
      async (chunk) => {
        const { data } = await mediaSchema(client())
          .from('assets')
          .select('id')
          .in('id', chunk)
          .is('deleted_at', null);
        return ((data ?? []) as { id: string }[]).map((row) => row.id);
      },
      (count, total) => setProgress(total > BULK_CHUNK_SIZE ? `${count} / ${total}` : null),
    );
  };

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
      setMessage(
        translateUi('all_value0_matching_selected_2325c7e7', {
          count: Number(ids.length),
        }),
      );
    } catch (error) {
      setMessage(uiErrorText(error));
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
      const project = await createProject.mutateAsync({
        name,
        adAccountIds: [],
        campaignIds: [],
      });
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
    writtenCount.current = null;
    try {
      await operation();
      const count = writtenCount.current ?? targetIds.length;
      setMessage(translateUi('bulkActionCompleted', { action: label, count }));
      onCompleted();
    } catch (error) {
      setMessage(uiErrorText(error));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  // Two hand-picked assets can be compared side by side; comparing is a read, so a viewer
  // gets it too.
  const compare =
    assetIds.length === 2 && matchingIds === null ? (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="bulk-compare"
          onClick={() => setCompareOpen(true)}
        >
          <Columns2 className="size-3.5" /> {translateUi('compare_e888155d')}{' '}
        </Button>
        <CompareAssetsDialog
          brandId={brandId}
          assetIds={assetIds}
          open={compareOpen}
          onOpenChange={setCompareOpen}
        />
      </>
    ) : null;

  // Every write here is one the dispatcher refuses a viewer, so a viewer gets the
  // selection and the read-only Compare.
  if (!canEdit) {
    return (
      <div className="sticky top-0 z-20 flex items-center gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-sm backdrop-blur">
        <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground">
          <Check className="size-3.5 text-primary" aria-hidden />
          {targetIds.length} {translateUi('selected_d7cbbb68')}{' '}
        </span>
        <span className="flex-1 text-xs text-muted-foreground">
          {' '}
          {translateUi('view_only_your_role_cannot_change_t_f08a89b7')}{' '}
        </span>
        {compare}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onClear}
          aria-label={translateUi('clear_selection_cea4d2e0')}
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
        {targetIds.length} {translateUi('selected_d7cbbb68')}{' '}
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
          {' '}
          {translateUi('select_all_matching_76f5ac0c')}{' '}
        </Button>
      ) : null}
      <div className="flex items-center gap-1 rounded-md border border-border bg-background pl-2">
        <UserCheck className="size-3.5 text-muted-foreground" aria-hidden />
        {userFields.length > 1 ? (
          <Select value={assignField?.id ?? ''} onValueChange={setAssignFieldId}>
            <SelectTrigger
              size="sm"
              className="h-7 w-24 border-0 shadow-none"
              aria-label={translateUi('assign_field_9819a6bf')}
            >
              <SelectValue
                placeholder={translateUi('field_f45fc1df')}
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
              {' '}
              {translateUi('assign_8ece895c')}{' '}
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
                await createCustomField({
                  brandId,
                  name: 'Assignee',
                  type: 'user',
                });
              })
            }
          >
            {' '}
            {translateUi('add_an_assignee_field_323c3103')}{' '}
          </Button>
        )}
      </div>
      <Select value={collectionId} onValueChange={setCollectionId}>
        <SelectTrigger
          size="sm"
          className="h-8 w-44"
          aria-label={translateUi('destination_collection_220d2418')}
        >
          <SelectValue
            placeholder={translateUi('choose_collection_61a0d014')}
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
        <FolderInput className="size-3.5" /> {translateUi('add_9fd728c6')}{' '}
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
          {' '}
          {translateUi('remove_here_29f81498')}{' '}
        </Button>
      ) : null}
      {/* Rendered unconditionally, including at zero projects. It used to disappear when the
          brand had none — which is every brand — so the only way to reach a project from the
          Library was to leave for Settings, create one, and come back to a lost selection.
          NEW_PROJECT below turns that round trip into one gesture. */}
      <div className="flex items-center gap-1 rounded-md border border-border bg-background pl-2">
        <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden />
        <Select value={projectId} onValueChange={onProjectChange}>
          <SelectTrigger
            size="sm"
            className="h-7 w-32 border-0 shadow-none"
            aria-label={translateUi('project_98595978')}
          >
            <SelectValue
              placeholder={translateUi('project_98595978')}
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
            <SelectItem value={NEW_PROJECT}>{translateUi('new_project_cf8d3c2d')}</SelectItem>
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
          {' '}
          {translateUi('tag_1503916a')}{' '}
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
          {' '}
          {translateUi('untag_fecbff32')}{' '}
        </Button>
      </div>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{translateUi('new_project_a41eb2bf')}</DialogTitle>
            <DialogDescription>
              {' '}
              {translateUi('creates_the_project_and_adds_the_37a255f0')} {assetIds.length}{' '}
              {translateUi('selected_d7cbbb68')}{' '}
              {assetIds.length === 1
                ? translateUi('asset_d59386e0')
                : translateUi('assets_8bf729ff')}{' '}
              {translateUi('to_it_661b490b')}{' '}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newProjectName}
            placeholder={translateUi('winter_challenge_c7c41dc0')}
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
              {' '}
              {translateUi('create_and_add_1f0cce16')}{' '}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex items-center rounded-md border border-border bg-background pl-2">
        <Tag className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder={translateUi('add_tag_3e10b08c')}
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
                bulkUpdateAssetTagsOperation(client(), {
                  brandId,
                  assetIds: chunk,
                  addTags,
                }),
              );
              setTag('');
            })
          }
        >
          {' '}
          {translateUi('apply_31e392d1')}{' '}
        </Button>
      </div>
      <div className="flex items-center gap-1 rounded-md border border-border bg-background pl-2">
        <Workflow className="size-3.5 text-muted-foreground" aria-hidden />
        <Select value={reviewStatus} onValueChange={setReviewStatus}>
          <SelectTrigger
            size="sm"
            className="h-7 w-32 border-0 shadow-none"
            aria-label={translateUi('review_status_a410d701')}
          >
            <SelectValue
              placeholder={translateUi('review_status_a410d701')}
              items={{
                draft: 'Draft',
                in_review: 'In review',
                needs_changes: 'Needs changes',
                approved: 'Approved',
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">{translateUi('draft_ebf12ef4')}</SelectItem>
            <SelectItem value="in_review">{translateUi('in_review_c3905914')}</SelectItem>
            <SelectItem value="needs_changes">{translateUi('needs_changes_17fa92a7')}</SelectItem>
            <SelectItem value="approved">{translateUi('approved_87b42e40')}</SelectItem>
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
          {' '}
          {translateUi('apply_31e392d1')}{' '}
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
              aria-label={translateUi('custom_field_6163a41c')}
            >
              <SelectValue
                placeholder={translateUi('field_f45fc1df')}
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
            {' '}
            {translateUi('set_b6f6f3ad')}{' '}
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
        <Link2 className="size-3.5" /> {translateUi('share_box_21c716f6')}{' '}
      </Button>
      {compare}
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
            await queryClient.invalidateQueries({
              queryKey: elementsQueryKey(brandId),
            });
          })
        }
      >
        <Layers className="size-3.5" /> {translateUi('mark_as_element_29af581b')}{' '}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={Boolean(busy)}
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 className="size-3.5" /> {translateUi('delete_e2d0a549')}{' '}
      </Button>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {' '}
              {translateUi('delete_e2d0a549')}{' '}
              {assetIds.length === 1
                ? translateUi('this_asset_ad2fbd56')
                : translateUi('these_value0_assets_52f4e3c8', {
                    count: Number(assetIds.length),
                  })}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {' '}
              {translateUi('they_leave_your_library_along_with__6d5939fa')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('cancel_19766ed6')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingDelete(false);
                void run('Deleted', async () => {
                  await writeChunked((chunk) =>
                    bulkDeleteAssetsOperation(client(), {
                      brandId,
                      assetIds: chunk,
                    }),
                  );
                  onClear();
                });
              }}
            >
              {' '}
              {translateUi('delete_e2d0a549')}{' '}
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
        aria-label={translateUi('clear_selection_cea4d2e0')}
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
