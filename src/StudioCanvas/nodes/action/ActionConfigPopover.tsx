// The knobs for whatever op the node is set to, drawn from `configFieldsFor` descriptors.
// No per-op branch here either: a new op with a new config schema gets its controls for
// free, and an op whose schema grows a key gets the extra control on the next render.

import type { ActionId } from '@continuum/contracts';
import { Settings2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

export function ActionConfigPopover({
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

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="nodrag size-7 shrink-0"
            aria-label="Operation settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Settings2 className="size-3.5" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="nodrag nowheel max-h-80 w-64 overflow-y-auto"
        onMouseDown={(event) => event.stopPropagation()}
      >
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
      </PopoverContent>
    </Popover>
  );
}
