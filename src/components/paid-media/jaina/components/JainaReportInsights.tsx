import { Heading, Card, Text, Flex, Box } from "@radix-ui/themes";
import { LightbulbIcon } from "lucide-react";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";

interface JainaReportInsightsProps {
  insights: string[];
}

export function JainaReportInsights({ insights }: JainaReportInsightsProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <div id="strategic-insights" className="space-y-4 pt-4 border-t border-white/5">
      <Heading size="4" className="text-primary/80">
        Strategic Insights
      </Heading>
      <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border-indigo-500/20">
        <Flex gap="4" align="start" p="2">
          <Box className="mt-1 p-2 bg-indigo-500/20 rounded-full text-indigo-400">
            <LightbulbIcon size={20} />
          </Box>
          <div className="space-y-3 flex-1">
            {insights.map((insight, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="mt-2 size-1.5 rounded-full bg-indigo-400 shrink-0" />
                <SafeMarkdown
                  content={insight}
                  className="text-[15px] leading-relaxed text-secondary/90"
                  mode="static"
                />
              </div>
            ))}
          </div>
        </Flex>
      </Card>
    </div>
  );
}
