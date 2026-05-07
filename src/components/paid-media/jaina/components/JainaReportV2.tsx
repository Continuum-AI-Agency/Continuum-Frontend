"use client";

import { useCallback, useMemo } from "react";
import { Button, Text } from "@radix-ui/themes";
import { FileCode2Icon } from "lucide-react";
import type { CheckpointReportV2 } from "@/lib/jaina/schemas";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useToast } from "@/components/ui/ToastProvider";
import { downloadJainaReportV2Html } from "../reportExport";
import { BlockRenderer } from "../blocks/BlockRenderer";
import { MediaMapProvider } from "../blocks/mediaText";

type JainaReportV2Props = {
  report: CheckpointReportV2;
  isStreaming: boolean;
  onSuggestionClick?: (query: string) => void;
};

export function JainaReportV2({
  report,
  isStreaming,
  onSuggestionClick,
}: JainaReportV2Props) {
  const { show } = useToast();
  const sortedBlocks = useMemo(
    () => [...report.blocks].sort((a, b) => a.priority - b.priority),
    [report.blocks],
  );

  const hasMedia = report._meta.has_media && Object.keys(report.media_map).length > 0;
  const handleHtmlExport = useCallback(() => {
    try {
      downloadJainaReportV2Html(report);
    } catch {
      show({
        title: "Export failed",
        description: "Unable to generate HTML report right now.",
        variant: "error",
      });
    }
  }, [report, show]);

  const content = (
    <section className="mt-4 space-y-4">
      {report.executive_summary ? (
        <SafeMarkdown
          content={report.executive_summary}
          className="text-sm leading-relaxed text-muted-foreground"
          mode={isStreaming ? "streaming" : "static"}
        />
      ) : null}

      {sortedBlocks.map((block) => (
        <BlockRenderer
          key={block.block_id}
          block={block}
          isStreaming={isStreaming}
        />
      ))}

      {report.follow_up_questions.length > 0 ? (
        <div className="space-y-2 pt-2">
          <Suggestions className="pb-1">
            {report.follow_up_questions.map((question, index) => (
              <Suggestion
                key={`${question}-${index}`}
                suggestion={question}
                onClick={onSuggestionClick}
              />
            ))}
          </Suggestions>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <Text size="1" className="text-muted-foreground">
          Export includes narrative, metrics, chart specs, tables, comparisons, and recommendations.
        </Text>
        <Button
          type="button"
          size="1"
          variant="surface"
          color="gray"
          onClick={handleHtmlExport}
          disabled={isStreaming}
          aria-label="Export response as HTML"
        >
          <FileCode2Icon className="size-3.5" />
          Export HTML
        </Button>
      </footer>
    </section>
  );

  if (!hasMedia) return content;

  return (
    <MediaMapProvider mediaMap={report.media_map}>
      {content}
    </MediaMapProvider>
  );
}
