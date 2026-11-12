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
import { useTranslations as useUiTranslations } from 'next-intl';
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useState,
  useMemo as useUiConfigMemo,
} from 'react';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';
import { ShareLogoPicker } from './ShareLogoPicker';
import { updateShareLinkSettings } from './shareLinkClient';

function useLocalLayoutsMessages() {
  const translateConfig = useUiTranslations('library');
  return useUiConfigMemo(() => {
    const value: Array<{ value: ShareLinkLayout; label: string; Icon: typeof List }> = [
      { value: 'grid', label: translateConfig('grid_0d7d12ac'), Icon: LayoutGrid },
      { value: 'list', label: translateConfig('list_6f202f54'), Icon: List },
      { value: 'reel', label: translateConfig('reel_9cb145e8'), Icon: PlaySquare },
    ];
    return value;
  }, [translateConfig]);
}

function useLocalPositionsMessages() {
  const translateConfig = useUiTranslations('library');
  return useUiConfigMemo(() => {
    const value: Array<{ value: ShareLinkWatermarkPosition; label: string }> = [
      { value: 'center', label: translateConfig('center_d9460674') },
      { value: 'top_left', label: translateConfig('top_left_a0eda50f') },
      { value: 'top_right', label: translateConfig('top_right_d83cbef9') },
      { value: 'bottom_left', label: translateConfig('bottom_left_f5a57b96') },
      { value: 'bottom_right', label: translateConfig('bottom_right_b4b7cb63') },
      { value: 'tiled', label: translateConfig('tiled_381ac933') },
    ];
    return value;
  }, [translateConfig]);
}

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
  const LAYOUTS = useLocalLayoutsMessages();
  const POSITIONS = useLocalPositionsMessages();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

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
      setMessage(translateUi('saved_b5c120b3'));
    } catch (error) {
      setMessage(uiErrorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-share-settings={link.id}>
      <Section title={translateUi('layout_a5119091')}>
        <div
          className="grid grid-cols-3 gap-1"
          role="radiogroup"
          aria-label={translateUi('layout_a5119091')}
        >
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
        <Section title={translateUi('order_6be09082')}>
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
                  aria-label={translateUi('move_value0_up_4f93d150', {
                    value0: String(member.title),
                  })}
                  onClick={() => setOrder((items) => move(items, index, index - 1))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={translateUi('move_value0_down_7c18b9ea', {
                    value0: String(member.title),
                  })}
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

      <Section title={translateUi('branding_d417aa16')}>
        <p className="text-2xs text-muted-foreground">
          {' '}
          {translateUi('empty_fields_use_the_brand_kit_its__95cbc096')}{' '}
        </p>
        <div className={LABEL}>
          {' '}
          {translateUi('logo_d707dc2f')}{' '}
          <ShareLogoPicker
            brandId={link.brandId}
            value={branding.logoAssetId}
            onChange={(logoAssetId) => setBrand({ logoAssetId })}
          />
        </div>
        <label className={LABEL}>
          {' '}
          {translateUi('title_7e8cd205')}{' '}
          <input
            name="headerTitle"
            className={FIELD}
            value={branding.headerTitle ?? ''}
            maxLength={120}
            onChange={(event) => setBrand({ headerTitle: event.target.value })}
          />
        </label>
        <label className={LABEL}>
          {' '}
          {translateUi('description_526e0087')}{' '}
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
              {key === 'accent'
                ? translateUi('accent_a5c6fb18')
                : translateUi('background_ea2b8a87')}
              <span className="flex items-center gap-1">
                <input
                  type="checkbox"
                  aria-label={translateUi('custom_value0_163de06c', { value0: String(key) })}
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
            {' '}
            {translateUi('theme_efb52e71')}{' '}
            <select
              name="theme"
              className={FIELD}
              value={branding.theme ?? 'system'}
              onChange={(event) =>
                setBrand({ theme: event.target.value as ShareLinkBranding['theme'] })
              }
            >
              <option value="system">{translateUi('viewer_s_c0261c67')}</option>
              <option value="light">{translateUi('light_dbcd5e7b')}</option>
              <option value="dark">{translateUi('dark_60acc53f')}</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="hideFooter"
            checked={branding.hideFooter === true}
            onChange={(event) => setBrand({ hideFooter: event.target.checked || undefined })}
          />{' '}
          {translateUi('hide_shared_via_continuum_a83bf4b5')}{' '}
        </label>
      </Section>

      <Section title={translateUi('watermark_3bebd4c4')}>
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
          />{' '}
          {translateUi('show_each_viewer_s_name_email_and_t_3118daa8')}{' '}
        </label>
        {watermark ? (
          <>
            <label className={LABEL}>
              {' '}
              {translateUi('text_102e9b76')}
              {'{name}'} {'{email}'} {'{ip}'} {'{time}'})
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
                {' '}
                {translateUi('position_6d031af1')}{' '}
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
                {' '}
                {translateUi('opacity_6062652e')} {Math.round(watermark.opacity * 100)}%
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
              />{' '}
              {translateUi('burn_it_into_downloaded_images_and__c4c5f09d')}{' '}
            </label>
          </>
        ) : null}
      </Section>

      <Section title={translateUi('access_ec5ba0ab')}>
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
            {' '}
            {translateUi('expires_blank_never_f79a9791')}{' '}
            <input
              type="date"
              name="expiresOn"
              className={FIELD}
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </label>
          <label className={LABEL}>
            {link.policy.hasPasscode
              ? translateUi('new_passcode_b3e041e2')
              : translateUi('passcode_56c37125')}
            <input
              type="password"
              name="newPasscode"
              autoComplete="new-password"
              minLength={4}
              maxLength={128}
              className={FIELD}
              value={newPasscode}
              placeholder={
                link.policy.hasPasscode
                  ? translateUi('set_to_rotate_8857c6bc')
                  : translateUi('optional_59be7133')
              }
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
            />{' '}
            {translateUi('remove_the_passcode_changing_or_rem_34c175a6')}{' '}
          </label>
        ) : null}
      </Section>

      <Section title={translateUi('guest_editable_field_b0e9b6f7')}>
        <select
          name="featuredField"
          aria-label={translateUi('guest_editable_field_b0e9b6f7')}
          className={FIELD}
          value={featuredFieldId ?? ''}
          onChange={(event) => setFeaturedFieldId(event.target.value || null)}
        >
          <option value="">{translateUi('none_dc937b59')}</option>
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
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}{' '}
          {translateUi('save_presentation_16a4ddd5')}{' '}
        </Button>
      </div>
    </div>
  );
}
