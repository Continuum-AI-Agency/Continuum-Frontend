import { ScrollArea } from "@/components/ui/scroll-area";
import { BulletList, ChipRow } from "./listprimitives";
import type { AgentPreviewBuckets } from "../state/agentPreview";

type Props = {
  voice: NonNullable<AgentPreviewBuckets["voice"]>;
};

export function VoiceDetail({ voice }: Props) {
  const tags = [
    voice.tone ? { label: "Tone", value: voice.tone } : null,
    voice.voice_style ? { label: "Style", value: voice.voice_style } : null,
    voice.emoji_usage ? { label: "Emoji", value: voice.emoji_usage } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const hasExpandable =
    (voice.core_values && voice.core_values.length > 0) ||
    (voice.keywords && voice.keywords.length > 0) ||
    (voice.key_messaging && voice.key_messaging.length > 0);

  return (
    <div className="space-y-3">
      {tags.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {tags.map((t) => (
            <div key={t.label} className="rounded-md border border-[#e5e7eb] bg-[#f7f8fb] p-2.5">
              <p className="text-2xs font-semibold uppercase tracking-wide text-[#94a3b8]">{t.label}</p>
              <p className="mt-1 text-sm text-[#0b1220]">{t.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {voice.mission ? (
        <div>
          <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-[#94a3b8]">Mission</p>
          <p>{voice.mission}</p>
        </div>
      ) : null}
      {voice.vision ? (
        <div>
          <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-[#94a3b8]">Vision</p>
          <p>{voice.vision}</p>
        </div>
      ) : null}
      {hasExpandable ? (
        <ScrollArea className="h-52">
          <div className="space-y-3 pr-3">
            {voice.core_values && voice.core_values.length > 0 ? (
              <ChipRow label="Core values" values={voice.core_values} variant="teal" />
            ) : null}
            {voice.keywords && voice.keywords.length > 0 ? (
              <ChipRow label="Keywords" values={voice.keywords} variant="violet" />
            ) : null}
            {voice.key_messaging && voice.key_messaging.length > 0 ? (
              <BulletList label="Key messaging" items={voice.key_messaging} />
            ) : null}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
}
