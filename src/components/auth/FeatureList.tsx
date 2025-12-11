import { Card } from "@radix-ui/themes";
import { CheckCircle } from "lucide-react";

interface Feature {
  title: string;
  description: string;
}

interface FeatureListProps {
  title: string;
  subtitle: string;
  features: Feature[];
  securityBadge?: string;
  variant?: "light" | "dark";
}

export function FeatureList({ title, subtitle, features, securityBadge, variant = "dark" }: FeatureListProps) {
  const isLight = variant === "light";
  const headingClass = isLight ? "text-slate-900" : "text-white";
  const subtitleClass = isLight ? "text-slate-700" : "text-gray-300";
  const featureTitleClass = isLight ? "text-slate-900" : "text-white";
  const featureDescClass = isLight ? "text-slate-600" : "text-gray-400";
  const badgeBorderClass = isLight ? "border-gray-200" : "border-gray-700";
  const badgeTextClass = isLight ? "text-slate-600" : "text-gray-400";
  const checkBgClass = isLight ? "bg-emerald-500/15" : "bg-emerald-500/20";
  const containerText = isLight ? "text-slate-900" : "text-white";
  const cardBg = isLight ? "bg-white" : "bg-slate-900/95";
  const cardShadow = "shadow-2xl";

  return (
    <Card
      className={`relative w-full max-w-2xl overflow-hidden border border-gray-200 ${cardBg} ${cardShadow} p-12 lg:p-14 rounded-[28px]`}
      style={{ borderRadius: "28px" }}
    >
      <div className={`space-y-8 ${containerText}`}>
        <div>
          <h1 className={`text-5xl font-bold leading-tight mb-6 ${headingClass}`}>
            {title}
          </h1>
          <p className={`text-xl leading-relaxed ${subtitleClass}`}>
            {subtitle}
          </p>
        </div>

        <div className="space-y-6 mt-12">
          {features.map((feature, index) => (
            <div key={index} className="flex items-start gap-4">
              <div className="flex-shrink-0 mt-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${checkBgClass}`}>
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div>
                <h3 className={`text-lg font-semibold mb-1 ${featureTitleClass}`}>
                  {feature.title}
                </h3>
                <p className={`${featureDescClass} leading-relaxed`}>
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {securityBadge && (
          <div className={`mt-12 pt-8 border-t ${badgeBorderClass}`}>
            <div className={`flex items-center gap-2 ${badgeTextClass}`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">{securityBadge}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
