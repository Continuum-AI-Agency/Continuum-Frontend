import { Plus, X } from '@phosphor-icons/react';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { BRAND_VOICE_TAGS, type BrandVoiceTag } from '@/lib/onboarding/state';
import { EditablePopover } from './EditablePopover';

export function TonePicker() {
  const { state, updateState } = useOnboarding();
  const tags = state.brand.brandVoiceTags;

  const toggle = (tag: BrandVoiceTag) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    void updateState({ brand: { brandVoiceTags: next } });
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="group inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_20%,transparent)] bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_8%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--cs-violet,#5a39ff)]"
        >
          {tag}
          <button
            type="button"
            onClick={() => toggle(tag)}
            aria-label={`Remove ${tag}`}
            className="opacity-50 transition-opacity hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <EditablePopover
        align="start"
        trigger={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/60 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        }
        content={(close) => (
          <div className="space-y-1">
            <p className="px-1 pb-1 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              Tone of voice
            </p>
            {BRAND_VOICE_TAGS.map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    toggle(tag);
                    if (!active) close();
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors ${
                    active
                      ? 'bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_8%,transparent)] text-[var(--cs-violet,#5a39ff)]'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  {tag}
                  {active ? <X className="h-3 w-3 opacity-60" /> : null}
                </button>
              );
            })}
          </div>
        )}
      />
    </div>
  );
}
