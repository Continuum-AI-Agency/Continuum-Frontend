'use client';

import {
  type ApiRenderDeliveryDestination,
  type ForgeRenderSet,
  type ForgeRenderSetSettings,
  forgeRenderSetSettingsSchema,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import {
  ApprovalDestinationsField,
  approvalRoomName,
} from '@/components/forge/ApprovalDestinationsField';
import {
  AdAccountSelect,
  AdDrillDown,
  adSetName,
  type MetaPickerState,
} from '@/components/forge/DeliveryTargetPicker';
import { approvalDestinationsKey } from '@/components/forge/DestinationApproversPanel';
import { FORGE_STALE_MS } from '@/components/forge/queryKeys';
import {
  SlackDestinationPicker,
  type SlackPickerState,
} from '@/components/forge/SlackDestinationPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { fetchApprovalDestinations } from '@/lib/library/renderApprovals';

// Where one render set's renders go, chosen once before render and kept with the set: a default
// ad set (new PAUSED ads only — replacing an ad is a row's own choice), a Slack room, approval
// rooms, Proof or Final. Nothing here renders or writes to Meta; the render's confirmation lists
// every ad it would touch, and every Meta-bound render still parks for approval.

/** The set's destinations as a line: `Library · #launch · Campaign › Ad set · Final`. */
export function deliverySummary(
  settings: ForgeRenderSetSettings,
  slackName: string | null,
  roomNames: string[],
): string {
  return [
    'Library',
    ...(slackName ? [`#${slackName}`] : []),
    ...roomNames.map((name) => `${name} approval`),
    ...(settings.metaTarget ? [`new paused ads in ${adSetName(settings.metaTarget)}`] : []),
    settings.final ? 'Final' : 'Proof',
  ].join(' · ');
}

/**
 * The rooms a set's renders are posted to for approval, from the same cached read the approval
 * field makes. A set that saved none uses the brand's default rooms — what the approval field
 * seeds every time it opens empty, and what the review tray sent before sets kept settings.
 * `saved` null (a web component) is no rooms at all. `ready` is false until the brand's rooms
 * have loaded, so a render is never checked against rooms it is about to gain.
 */
export function useSetApprovalRooms(
  brandId: string,
  saved: readonly string[] | null,
): { ids: string[]; names: string[]; ready: boolean } {
  const query = useQuery({
    queryKey: approvalDestinationsKey(brandId),
    queryFn: () => fetchApprovalDestinations(brandId),
    staleTime: FORGE_STALE_MS.active,
    retry: false,
    enabled: saved !== null,
  });
  if (saved === null) return { ids: [], names: [], ready: true };
  const ids = saved.length ? [...saved] : (query.data?.defaultDestinationIds ?? []);
  const rooms = query.data?.destinations ?? [];
  return {
    ids,
    names: rooms.filter((room) => ids.includes(room.id)).map(approvalRoomName),
    ready: !query.isPending,
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function RenderSetSettingsDialog({
  brandId,
  set,
  meta,
  slack,
  web,
  finalBlocked,
  metaWritesAllowed,
  onOpenChange,
  onSave,
}: {
  brandId: string;
  /** The set being configured; null closes the dialog. */
  set: ForgeRenderSet | null;
  meta: MetaPickerState;
  slack: SlackPickerState;
  /** A web component lands in the Library only: no Slack, Meta or approval rooms. */
  web: boolean;
  /** Why this person cannot ask for a Final render. Null when they can. */
  finalBlocked: string | null;
  /** The brand's arming switch, when the page read it. */
  metaWritesAllowed?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the settings onto the set; resolves once saved, throws to keep the dialog open. */
  onSave: (settings: ForgeRenderSetSettings) => Promise<void>;
}) {
  const translateUi = useUiTranslations('forge');

  const [draft, setDraft] = useState<ForgeRenderSetSettings>(() =>
    forgeRenderSetSettingsSchema.parse(set?.settings ?? {}),
  );
  const [slackRoom, setSlackRoom] = useState<ApiRenderDeliveryDestination | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const known = meta !== 'loading' && meta !== 'unknown' ? meta : null;
  const connected = meta === 'unknown' || Boolean(known?.connected);
  const adAccountId =
    pickedAccount ?? draft.metaTarget?.adAccountId ?? known?.adAccountId ?? undefined;

  // A new set to configure starts from what that set saved, never from the last one's edits.
  useEffect(() => {
    if (!set) return;
    setDraft(forgeRenderSetSettingsSchema.parse(set.settings ?? {}));
    setPicking(false);
    setPickedAccount(null);
  }, [set]);
  // The saved room id, shown as the room it names once the brand's rooms have loaded.
  useEffect(() => {
    const rooms = typeof slack === 'object' && 'destinations' in slack ? slack.destinations : [];
    setSlackRoom(rooms.find((room) => room.id === draft.slackDestinationId) ?? null);
  }, [slack, draft.slackDestinationId]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch {
      // The caller said why; the dialog stays open with the person's choices.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={set !== null} onOpenChange={(open) => (saving ? undefined : onOpenChange(open))}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translateUi('delivery_for_f6fa1449')}
            {set?.name}”
          </DialogTitle>
          <DialogDescription>
            {' '}
            {translateUi('where_every_render_of_this_set_goes_333394e7')}{' '}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto text-xs">
          <Section title={translateUi('library_dc20b3d5')}>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Check className="size-3.5 text-success" aria-hidden />{' '}
              {translateUi('every_render_is_saved_to_this_brand_ffb52ac1')}{' '}
            </p>
          </Section>
          {web ? null : (
            <>
              <Section title={translateUi('meta_ads_default_ad_set_3b2bf12d')}>
                {!connected ? (
                  <p className="text-muted-foreground">
                    {' '}
                    {translateUi('no_meta_ad_account_is_connected_to__bc2eeb85')}{' '}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        {draft.metaTarget ? (
                          <>
                            {' '}
                            {translateUi('new_18fdd549')}{' '}
                            <strong>{translateUi('paused_a7a9dc5b')}</strong>{' '}
                            {translateUi('ad_per_file_in_c44559ce')}{' '}
                            <span className="font-medium">{adSetName(draft.metaTarget)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {' '}
                            {translateUi('none_rows_without_an_ad_of_their_ow_6f58c08d')}{' '}
                          </span>
                        )}
                      </span>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => setPicking((current) => !current)}
                      >
                        {draft.metaTarget
                          ? translateUi('change_c0bf75bd')
                          : translateUi('choose_ad_set_bfd9301d')}
                      </Button>
                      {draft.metaTarget ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          aria-label={translateUi('remove_the_default_ad_set_2e560070')}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              metaTarget: null,
                            }))
                          }
                        >
                          <X aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                    {picking ? (
                      <>
                        <AdAccountSelect
                          meta={meta}
                          value={adAccountId}
                          onChange={setPickedAccount}
                        />
                        <AdDrillDown
                          key={adAccountId}
                          brandId={brandId}
                          adAccountId={adAccountId}
                          createOnly
                          onCancel={() => setPicking(false)}
                          onPick={(target) => {
                            if (target.action !== 'create') return;
                            setDraft((current) => ({
                              ...current,
                              metaTarget: { ...target, adStatus: 'PAUSED' },
                            }));
                            setPicking(false);
                          }}
                        />
                      </>
                    ) : null}
                    <p className="text-muted-foreground">
                      {' '}
                      {translateUi('a_row_can_still_replace_a_specific__d34d074a')}{' '}
                      {translateUi('adApprovalExplanation')}
                    </p>
                    {metaWritesAllowed === false ? (
                      <p role="status" className="text-warning">
                        {' '}
                        {translateUi('meta_writes_are_off_for_this_brand__791f2ff2')}{' '}
                      </p>
                    ) : null}
                  </>
                )}
              </Section>
              <Section title={translateUi('slack_b27fb38b')}>
                <SlackDestinationPicker
                  brandId={brandId}
                  slack={slack}
                  value={slackRoom}
                  onChange={(room) => {
                    setSlackRoom(room);
                    setDraft((current) => ({
                      ...current,
                      slackDestinationId: room?.id ?? null,
                    }));
                  }}
                />
              </Section>
              <Section title={translateUi('approval_147fb813')}>
                <ApprovalDestinationsField
                  brandId={brandId}
                  value={draft.approvalDestinationIds}
                  onChange={(ids) =>
                    setDraft((current) => ({
                      ...current,
                      approvalDestinationIds: ids,
                    }))
                  }
                />
              </Section>
            </>
          )}
          <Section title={translateUi('render_as_b696ffa7')}>
            <RadioGroup
              aria-label={translateUi('render_as_b696ffa7')}
              value={draft.final ? 'final' : 'proof'}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  final: value === 'final',
                }))
              }
              className="flex flex-wrap gap-x-6 gap-y-1.5"
            >
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs">
                  <RadioGroupItem value="proof" /> {translateUi('proof_7fbb3ccf')}{' '}
                </Label>
                <span className="pl-6 text-muted-foreground">
                  {translateUi('for_review_recorded_as_a_proof_be78783b')}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs">
                  <RadioGroupItem value="final" disabled={finalBlocked !== null && !draft.final} />{' '}
                  {translateUi('final_f4ed8fa6')}{' '}
                </Label>
                <span className="pl-6 text-muted-foreground">
                  {finalBlocked ?? translateUi('ready_to_go_recorded_as_final_b4448611')}
                </span>
              </div>
            </RadioGroup>
          </Section>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {' '}
            {translateUi('cancel_19766ed6')}{' '}
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{' '}
            {translateUi('save_1509f561')}{' '}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
