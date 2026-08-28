// The knobs for whatever op the node is set to, drawn from `configFieldsFor` descriptors.
// No per-op branch here either: a new op with a new config schema gets its controls for
// free, and an op whose schema grows a key gets the extra control on the next render.

import type { ActionId } from '@continuum/contracts';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useNodeConfigPatch } from '../../hooks/useNodeConfigPatch';
import {
  type ConfigField,
  configFieldsFor,
  parseActionConfig,
} from '../../utils/actions/actionConfig';
import { isOverlayActionId } from '../../utils/actions/overlayOp';
import { BurnInConfig } from './BurnInConfig';
import { OverlayConfig } from './OverlayConfig';
import { SubtitlesConfig } from './SubtitlesConfig';

/** Clears a `nullable` field back to null. `null` means "no window"/"auto" and is NOT
 *  0 or the empty string — five registry fields default to it (`video.subtitles`'s
 *  language, and `startSec`/`endSec` on `video.overlay` and `video.watermark`), so the
 *  UI needs a way to say "unset" that a numeric input cannot express. */
function ClearFieldButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={`Clear ${label}`}
      title="Auto"
      onClick={onClear}
    >
      <X className="size-3" />
    </Button>
  );
}

function ConfigControl({
  field,
  value,
  controlId,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  controlId: string;
  onChange: (next: unknown) => void;
}) {
  if (field.kind === 'boolean') {
    return (
      <Switch
        id={controlId}
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }

  if (field.kind === 'enum') {
    return (
      <div className="flex items-center gap-1">
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(next: string) => onChange(next)}
        >
          <SelectTrigger id={controlId} size="sm" className="h-7 flex-1 text-xs">
            <SelectValue placeholder={field.nullable ? 'Auto' : undefined} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.nullable ? (
          <ClearFieldButton label={field.label} onClear={() => onChange(null)} />
        ) : null}
      </div>
    );
  }

  const isNumber = field.kind === 'number';
  return (
    <div className="flex items-center gap-1">
      <Input
        id={controlId}
        className="h-7 flex-1 text-xs"
        type={isNumber ? 'number' : 'text'}
        placeholder={field.nullable ? 'Auto' : undefined}
        {...(isNumber && field.min !== undefined ? { min: field.min } : {})}
        {...(isNumber && field.max !== undefined ? { max: field.max } : {})}
        {...(isNumber ? { step: field.step } : {})}
        value={
          isNumber
            ? typeof value === 'number'
              ? String(value)
              : ''
            : ((value as string | null) ?? '')
        }
        onChange={(event) => {
          const raw = event.target.value;
          if (!isNumber) {
            onChange(raw);
            return;
          }
          // An emptied numeric input is "unset" when the field allows it, and nothing at
          // all when it does not — writing 0 there would be a value the user never chose.
          if (raw === '') {
            if (field.nullable) onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
      {field.nullable ? (
        <ClearFieldButton label={field.label} onClear={() => onChange(null)} />
      ) : null}
    </div>
  );
}

/**
 * The op's knobs, with no surface of their own.
 *
 * Rendered BOTH inside the on-node popover and inside the selection inspector's
 * action section — the panel is where node configuration lives (image and video
 * nodes already work that way), and the gear stays for reach-without-selecting.
 * One implementation, so a new registry field appears in both places or neither.
 */
export function ActionConfigFields({
  nodeId,
  actionId,
  config,
}: {
  nodeId: string;
  actionId: ActionId;
  config: Record<string, unknown>;
}) {
  const patch = useNodeConfigPatch();
  const fields = configFieldsFor(actionId);
  // The op's defaults merged over what is stored, so an unconfigured node shows the
  // values the runner will actually use rather than empty controls.
  const current = parseActionConfig(actionId, config);

  const write = (key: string, value: unknown) => {
    patch(nodeId, 'action', { config: { ...current, [key]: value } });
  };

  // Body swap only — no early return before useNodeConfigPatch(), because switching a
  // mounted node's op must not change the hook count.
  if (actionId === 'video.subtitles') {
    return <SubtitlesConfig nodeId={nodeId} config={current} onWrite={write} />;
  }
  if (isOverlayActionId(actionId)) {
    return <OverlayConfig nodeId={nodeId} actionId={actionId} config={config} />;
  }
  // Placement is a place on a frame, and ink is a colour. Neither survives contact with the
  // four field kinds above — the attempt is what put design-section enums in the schema.
  if (actionId === 'image.text') {
    return <BurnInConfig nodeId={nodeId} config={config} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        const controlId = `action-config-${nodeId}-${field.key}`;
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <Label htmlFor={controlId} className="text-xs">
              {field.label}
            </Label>
            <ConfigControl
              field={field}
              value={current[field.key]}
              controlId={controlId}
              onChange={(next) => write(field.key, next)}
            />
          </div>
        );
      })}
    </div>
  );
}
