import { SafeMarkdown } from "@/components/ui/SafeMarkdown";

export function StreamFallback({ text }: { text: string }) {
  if (!text) return <p className="m-0 italic text-[#94a3b8]">Drafting…</p>;
  return <SafeMarkdown content={text} />;
}
