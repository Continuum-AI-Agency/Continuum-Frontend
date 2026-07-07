import { LightbulbIcon } from 'lucide-react';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';

interface JainaReportInsightsProps {
  insights: string[];
}

export function JainaReportInsights({ insights }: JainaReportInsightsProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <div id="strategic-insights" className="space-y-4 pt-4 border-t border-white/5">
      <h3 className="text-lg font-semibold text-primary/80">Strategic Insights</h3>
      <div className="rounded-lg border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 p-4">
        <div className="flex gap-4 items-start p-2">
          <div className="mt-1 p-2 bg-indigo-500/20 rounded-full text-indigo-400">
            <LightbulbIcon size={20} />
          </div>
          <div className="space-y-3 flex-1">
            {insights.map((insight, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="mt-2 size-1.5 rounded-full bg-indigo-400 shrink-0" />
                <SafeMarkdown
                  content={insight}
                  className="text-base leading-relaxed text-secondary/90"
                  mode="static"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
