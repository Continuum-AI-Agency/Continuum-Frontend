'use client';

// How a share link presents itself: layout (grid, list, reel), the order of its
// assets (drag, or the arrows), the branding over the brand kit's defaults, the
// per-viewer watermark, and the one field a guest may edit. Saved in one
// update_share_link call.

import {
  type CustomField,
  DEFAULT_SHARE_WATERMARK_TEMPLATE,
  isShareFeaturableFieldType,
  listCustomFieldsResponseSchema,
  type ShareLinkBranding,
  type ShareLinkDetailResponse,
  type ShareLinkLayout,
  type ShareLinkWatermark,
  type ShareLinkWatermarkPosition,
} from '@continuum/contracts';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LayoutGrid,
  List,
  Loader2,
  PlaySquare,
} from 'lucide-react';
import { type DragEvent, type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShareLogoPicker } from './ShareLogoPicker';
import { updateShareLinkSettings } from './shareLinkClient';

const LAYOUTS: Array<{ value: ShareLinkLayout; label: string; Icon: typeof List }> = [
  { value: 'grid', label: 'Grid', Icon: LayoutGrid },
  { value: 'list', label: 'List', Icon: List },
  { value: 'reel', label: 'Reel', Icon: PlaySquare },
];

const POSITIONS: Array<{ value: ShareLinkWatermarkPosition; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'top_left', label: 'Top left' },
  { value: 'top_right', label: 'Top right' },
  { value: 'bottom_left', label: 'Bottom left' },
  { value: 'bottom_right', label: 'Bottom right' },
  { value: 'tiled', label: 'Tiled' },
];

const FIELD =
  'h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground';
const LABEL = 'flex flex-col gap-1 text-xs text-muted-foreground';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export function ShareLinkSettings({
  detail,
  onSaved,
}: {
  detail: ShareLinkDetailResponse;
  onSaved: (detail: ShareLinkDetailResponse) => void;
}) {
  const { link } = detail;
  const [layout, setLayout] = useState<ShareLinkLayout>(link.layout);
  const [order, setOrder] = useState(detail.members);
  const [branding, setBranding] = useState<ShareLinkBranding>(link.branding);
  const [watermark, setWatermark] = useState<ShareLinkWatermark | null>(link.watermark ?? null);
  const [featuredFieldId, setFeaturedFieldId] = useState<string | null>(
    link.featuredFieldId ?? null,
  );
  const [fields, setFields] = useState<CustomField[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [allowDownload, setAllowDownload] = useState(link.policy.allowDownload);
  const [allowComments, setAllowComments] = useState(link.policy.allowComments);
  const [allowApproval, setAllowApproval] = useState(link.policy.allowApproval);
  // yyyy-mm-dd, or '' for no expiry.
  // The last saved expiry day: an untouched field is not re-sent, a changed one is.
  const [savedExpiry, setSavedExpiry] = useState(link.expiresAt ? link.expiresAt.slice(0, 10) : '');
  const [expiryDate, setExpiryDate] = useState(savedExpiry);
  const [newPasscode, setNewPasscode] = useState('');
  const [removePasscode, setRemovePasscode] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch(`/api/library/custom-fields?brandId=${encodeURIComponent(link.brandId)}`)
      .then((response) => response.json())
      .then((body) => {
        const parsed = listCustomFieldsResponseSchema.safeParse(body);
        if (live && parsed.success) {
          setFields(parsed.data.fields.filter((field) => isShareFeaturableFieldType(field.type)));
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [link.brandId]);

  const setBrand = (patch: Partial<ShareLinkBranding>) =>
    setBranding((current) => {
      const next = { ...current, ...patch };
      for (const key of Object.keys(next) as Array<keyof ShareLinkBranding>) {
        if (next[key] === undefined || next[key] === '') delete next[key];
      }
      return next;
    });

  const onDrop = (event: DragEvent, to: number) => {
    event.preventDefault();
    if (dragIndex !== null) setOrder((items) => move(items, dragIndex, to));
    setDragIndex(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await updateShareLinkSettings({
        brandId: link.brandId,
        shareLinkId: link.id,
        layout,
        branding,
        watermark,
        featuredFieldId,
        allowDownload,
        allowComments,
        allowApproval,
        // Untouched, the exact expiry stays; a picked day runs to its end (UTC).
        ...(expiryDate !== savedExpiry
          ? { expiresAt: expiryDate ? new Date(`${expiryDate}T23:59:59.000Z`).toISOString() : null }
          : {}),
        ...(newPasscode.trim()
          ? { passcode: newPasscode.trim() }
          : removePasscode
            ? { passcode: null }
            : {}),
        ...(order.length > 1 ? { assetOrder: order.map((member) => member.assetId) } : {}),
      });
      setNewPasscode('');
      setRemovePasscode(false);
      setSavedExpiry(expiryDate);
      setOrder(saved.members);
      onSaved(saved);
      setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-share-settings={link.id}>
      <Section title="Layout">
        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Layout">
          {LAYOUTS.map(({ value, label, Icon }) => (
            <Button
              key={value}
              type="button"
              size="sm"
              role="radio"
              aria-checked={layout === value}
              data-layout-option={value}
              variant={layout === value ? 'default' : 'outline'}
              onClick={() => setLayout(value)}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </Button>
          ))}
        </div>
      </Section>

      {order.length > 1 ? (
        <Section title="Order">
          <ol className="flex flex-col gap-1" data-share-order>
            {order.map((member, index) => (
              <li
                key={member.assetId}
                draggable
                data-order-asset={member.assetId}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, index)}
                className={`flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs ${dragIndex === index ? 'opacity-50' : ''}`}
              >
                <GripVertical
                  className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{member.title}</span>
                <button
                  type="button"
                  aria-label={`Move ${member.title} up`}
                  onClick={() => setOrder((items) => move(items, index, index - 1))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${member.title} down`}
                  onClick={() => setOrder((items) => move(items, index, index + 1))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="Branding">
        <p className="text-2xs text-muted-foreground">
          Empty fields use the brand kit: its name, logo and first colour.
        </p>
        <div className={LABEL}>
          Logo
          <ShareLogoPicker
            brandId={link.brandId}
            value={branding.logoAssetId}
            onChange={(logoAssetId) => setBrand({ logoAssetId })}
          />
        </div>
        <label className={LABEL}>
          Title
          <input
            name="headerTitle"
            className={FIELD}
            value={branding.headerTitle ?? ''}
            maxLength={120}
            onChange={(event) => setBrand({ headerTitle: event.target.value })}
          />
        </label>
        <label className={LABEL}>
          Description
          <textarea
            name="description"
            className={`${FIELD} h-16 py-1`}
            value={branding.description ?? ''}
            maxLength={1000}
            onChange={(event) => setBrand({ description: event.target.value })}
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['accent', 'background'] as const).map((key) => (
            <label key={key} className={LABEL}>
              {key === 'accent' ? 'Accent' : 'Background'}
              <span className="flex items-center gap-1">
                <input
                  type="checkbox"
                  aria-label={`Custom ${key}`}
                  checked={Boolean(branding[key])}
                  onChange={(event) =>
                    setBrand({
                      [key]: event.target.checked
                        ? key === 'accent'
                          ? '#5a48f9'
                          : '#ffffff'
                        : undefined,
                    })
                  }
                />
                <input
                  type="color"
                  name={key}
                  disabled={!branding[key]}
                  value={branding[key] ?? '#000000'}
                  onChange={(event) => setBrand({ [key]: event.target.value })}
                  className="h-7 w-full"
                />
              </span>
            </label>
          ))}
          <label className={LABEL}>
            Theme
            <select
              name="theme"
              className={FIELD}
              value={branding.theme ?? 'system'}
              onChange={(event) =>
                setBrand({ theme: event.target.value as ShareLinkBranding['theme'] })
              }
            >
              <option value="system">Viewer's</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="hideFooter"
            checked={branding.hideFooter === true}
            onChange={(event) => setBrand({ hideFooter: event.target.checked || undefined })}
          />
          Hide "Shared via Continuum"
        </label>
      </Section>

      <Section title="Watermark">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="watermarkEnabled"
            checked={watermark !== null}
            onChange={(event) =>
              setWatermark(
                event.target.checked
                  ? {
                      template: DEFAULT_SHARE_WATERMARK_TEMPLATE,
                      position: 'bottom_right',
                      opacity: 0.5,
                      burnDownloads: true,
                    }
                  : null,
              )
            }
          />
          Show each viewer's name, email and time over the media (asks viewers who they are)
        </label>
        {watermark ? (
          <>
            <label className={LABEL}>
              Text ({'{name}'} {'{email}'} {'{ip}'} {'{time}'})
              <input
                name="watermarkTemplate"
                className={FIELD}
                value={watermark.template}
                maxLength={200}
                onChange={(event) => setWatermark({ ...watermark, template: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={LABEL}>
                Position
                <select
                  name="watermarkPosition"
                  className={FIELD}
                  value={watermark.position}
                  onChange={(event) =>
                    setWatermark({
                      ...watermark,
                      position: event.target.value as ShareLinkWatermarkPosition,
                    })
                  }
                >
                  {POSITIONS.map((position) => (
                    <option key={position.value} value={position.value}>
                      {position.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={LABEL}>
                Opacity {Math.round(watermark.opacity * 100)}%
                <input
                  type="range"
                  name="watermarkOpacity"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={watermark.opacity}
                  onChange={(event) =>
                    setWatermark({ ...watermark, opacity: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="burnDownloads"
                checked={watermark.burnDownloads}
                onChange={(event) =>
                  setWatermark({ ...watermark, burnDownloads: event.target.checked })
                }
              />
              Burn it into downloaded images and videos
            </label>
          </>
        ) : null}
      </Section>

      <Section title="Access">
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          {(
            [
              ['allowDownload', 'Downloads', allowDownload, setAllowDownload],
              ['allowComments', 'Comments', allowComments, setAllowComments],
              ['allowApproval', 'Approval', allowApproval, setAllowApproval],
            ] as const
          ).map(([name, label, checked, set]) => (
            <label key={name} className="flex items-center gap-2">
              <input
                type="checkbox"
                name={name}
                checked={checked}
                onChange={(event) => set(event.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={LABEL}>
            Expires (blank = never)
            <input
              type="date"
              name="expiresOn"
              className={FIELD}
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </label>
          <label className={LABEL}>
            {link.policy.hasPasscode ? 'New passcode' : 'Passcode'}
            <input
              type="password"
              name="newPasscode"
              autoComplete="new-password"
              minLength={4}
              maxLength={128}
              className={FIELD}
              value={newPasscode}
              placeholder={link.policy.hasPasscode ? 'Set to rotate' : 'Optional'}
              onChange={(event) => setNewPasscode(event.target.value)}
            />
          </label>
        </div>
        {link.policy.hasPasscode ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              name="removePasscode"
              checked={removePasscode}
              onChange={(event) => setRemovePasscode(event.target.checked)}
            />
            Remove the passcode (changing or removing it signs current reviewers out)
          </label>
        ) : null}
      </Section>

      <Section title="Guest-editable field">
        <select
          name="featuredField"
          aria-label="Guest-editable field"
          className={FIELD}
          value={featuredFieldId ?? ''}
          onChange={(event) => setFeaturedFieldId(event.target.value || null)}
        >
          <option value="">None</option>
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </Section>

      <div className="flex items-center justify-end gap-2">
        {message ? (
          <span role="status" className="text-xs text-muted-foreground">
            {message}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={saving}
          data-share-save
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Save presentation
        </Button>
      </div>
    </div>
  );
}
