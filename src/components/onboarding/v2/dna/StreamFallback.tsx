import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { Skeleton } from "@/components/ui/skeleton";

type StreamFallbackProps = {
  text: string;
  loading?: boolean;
};

export function StreamFallback({ text, loading }: StreamFallbackProps) {
  if (text) return <SafeMarkdown content={text} />;
  if (loading) {
    return (
      <div className="space-y-2" aria-label="Loading">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[92%]" />
        <Skeleton className="h-3 w-[78%]" />
      </div>
    );
  }
  return <p className="m-0 italic text-[#94a3b8]">Drafting…</p>;
}
