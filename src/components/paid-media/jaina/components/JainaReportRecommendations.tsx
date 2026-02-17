import { Heading, Text, Badge, Flex } from "@radix-ui/themes";
import { Task, TaskTrigger, TaskContent } from "@/components/ai-elements/task";
import { recommendationSchema } from "@/lib/jaina/schemas";
import { z } from "zod";

type Recommendation = z.infer<typeof recommendationSchema>;

interface JainaReportRecommendationsProps {
  recommendations: Recommendation[];
}

export function JainaReportRecommendations({ recommendations }: JainaReportRecommendationsProps) {
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div id="recommendations" className="space-y-4 pt-4 border-t border-white/5">
      <Heading size="4" className="text-primary/80">
        Priority Recommendations
      </Heading>
      <div className="space-y-3">
        {recommendations.map((item, index) => (
          <Task
            key={`${item.action || item.title || "rec"}-${index}`}
            status="pending"
            className="bg-white/5 border-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-colors"
          >
            <TaskTrigger title={item.action || item.title || "Recommendation"} />
            <TaskContent>
              <div className="space-y-3 py-2">
                <Text size="2" className="text-secondary leading-relaxed block">
                  {item.description || item.rationale || ""}
                </Text>
                <Flex align="center" gap="3" wrap="wrap">
                  {item.type && (
                    <Badge color="violet" variant="soft" className="text-[10px] uppercase">
                      {item.type}
                    </Badge>
                  )}
                  {(item.impact || item.expected_impact) && (
                    <Badge color="indigo" variant="soft" className="text-[10px] uppercase">
                      Impact: {item.impact || item.expected_impact}
                    </Badge>
                  )}
                  {item.effort && (
                    <Badge color="gray" variant="soft" className="text-[10px] uppercase">
                      Effort: {item.effort}
                    </Badge>
                  )}
                  {item.priority && (
                    <Badge color="blue" variant="soft" className="text-[10px] uppercase">
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
