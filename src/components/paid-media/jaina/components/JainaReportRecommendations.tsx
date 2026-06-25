"use client";

import { Heading, Text, Badge, Flex } from "@radix-ui/themes";
import { Task, TaskTrigger, TaskContent } from "@/components/ai-elements/task";
import { type RecommendationItem } from "@/lib/jaina/schemas";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";

interface JainaReportRecommendationsProps {
  recommendations: RecommendationItem[];
  isStreaming?: boolean;
}

export function JainaReportRecommendations({ recommendations, isStreaming }: JainaReportRecommendationsProps) {
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div id="recommendations" className="space-y-4 pt-4 border-t border-white/5">
      <Heading size="4" className="text-primary/80">
        Priority Recommendations
      </Heading>
      <div className="space-y-3">
        {recommendations.map((item, index) => (
          <Task
            key={`${item.title || "rec"}-${index}`}
            status="pending"
            className="bg-white/5 border-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-colors"
          >
            <TaskTrigger title={item.title || "Recommendation"} />
            <TaskContent>
              <div className="space-y-3 py-2">
                <div className="prose prose-invert max-w-none">
                  <SafeMarkdown
                    content={item.rationale}
                    className="text-base leading-relaxed text-secondary"
                    mode={isStreaming ? "streaming" : "static"}
                  />
                </div>
                <Flex align="center" gap="3" wrap="wrap">
                  {item.expected_impact && (
                    <Badge color="indigo" variant="soft" className="text-2xs uppercase">
                      Impact: {item.expected_impact}
                    </Badge>
                  )}
                  {item.priority && (
                    <Badge color="blue" variant="soft" className="text-2xs uppercase">
                      Priority: {item.priority}
                    </Badge>
                  )}
                </Flex>
              </div>
            </TaskContent>
          </Task>
        ))}
      </div>
    </div>
  );
}
