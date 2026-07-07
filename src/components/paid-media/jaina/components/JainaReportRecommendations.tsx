'use client';

import { Task, TaskContent, TaskTrigger } from '@/components/ai-elements/task';
import { Pill } from '@/components/kibo-ui/pill';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import type { RecommendationItem } from '@/lib/jaina/schemas';

interface JainaReportRecommendationsProps {
  recommendations: RecommendationItem[];
  isStreaming?: boolean;
}

export function JainaReportRecommendations({
  recommendations,
  isStreaming,
}: JainaReportRecommendationsProps) {
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div id="recommendations" className="space-y-4 pt-4 border-t border-white/5">
      <h3 className="text-lg font-semibold text-primary/80">Priority Recommendations</h3>
      <div className="space-y-3">
        {recommendations.map((item, index) => (
          <Task
            key={`${item.title || 'rec'}-${index}`}
            status="pending"
            className="bg-white/5 border-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-colors"
          >
            <TaskTrigger title={item.title || 'Recommendation'} />
            <TaskContent>
              <div className="space-y-3 py-2">
                <div className="prose prose-invert max-w-none">
                  <SafeMarkdown
                    content={item.rationale}
                    className="text-base leading-relaxed text-secondary"
                    mode={isStreaming ? 'streaming' : 'static'}
                  />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {item.expected_impact && (
                    <Pill variant="violet" className="text-2xs uppercase">
                      Impact: {item.expected_impact}
                    </Pill>
                  )}
                  {item.priority && (
                    <Pill variant="teal" className="text-2xs uppercase">
                      Priority: {item.priority}
                    </Pill>
                  )}
                </div>
              </div>
            </TaskContent>
          </Task>
        ))}
      </div>
    </div>
  );
}
