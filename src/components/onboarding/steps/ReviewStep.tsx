"use client";

import React, { useState, useEffect } from "react";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { completeOnboardingAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/ToastProvider";
import { 
  ArrowLeft, 
  Rocket, 
  RefreshCw, 
  FileText, 
  Link2, 
  Sparkles,
  MessageSquare,
  Target,
  BarChart3,
  Search
} from "lucide-react";
import { useRouter } from "next/navigation";
import { runOnboardingPreview } from "@/lib/onboarding/agentClient";
import { runStrategicAnalysis } from "@/lib/api/strategicAnalyses.client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";

type ReportSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: string;
  isStreaming: boolean;
  source?: "brand_profile" | "voice" | "audience" | "website" | "business";
};

export function ReviewStep() {
  const { state, updateState, brandId } = useOnboarding();
  const { show } = useToast();
  const router = useRouter();
  
  const [guidance, setGuidance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [hasGeneratedReport, setHasGeneratedReport] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [sections, setSections] = useState<ReportSection[]>([
    { id: "voice", title: "Brand Voice & Tone", icon: <MessageSquare className="w-4 h-4" />, content: state.brand.brandVoice || "", isStreaming: false, source: "voice" },
    { id: "audience", title: "Target Audience", icon: <Target className="w-4 h-4" />, content: state.brand.targetAudience || "", isStreaming: false, source: "audience" },
    { id: "market", title: "Market Analysis", icon: <BarChart3 className="w-4 h-4" />, content: "", isStreaming: false, source: "business" },
    { id: "competitive", title: "Competitive Landscape", icon: <Search className="w-4 h-4" />, content: "", isStreaming: false, source: "website" },
  ]);

  useEffect(() => {
    if (state.brand.logoPath) {
      createSignedAssetUrl(state.brand.logoPath, 3600).then(setLogoUrl).catch(() => setLogoUrl(null));
    }
  }, [state.brand.logoPath]);

  const triggerReportAgent = async (userGuidance?: string) => {
    setIsRegenerating(true);
    setHasGeneratedReport(false);
    
    setSections(prev => prev.map(s => 
      ["market", "competitive"].includes(s.id) ? { ...s, content: "", isStreaming: true } : s
    ));

    try {
      await runOnboardingPreview({
        payload: {
          brandProfile: {
            id: brandId,
            brand_name: state.brand.name || "",
            description: userGuidance,
            brand_voice: { tone: state.brand.brandVoice || "" },
            target_audience: { summary: state.brand.targetAudience || "" },
            website_url: state.brand.website || undefined,
          },
          runContext: {
            user_id: "current-user", 
            brand_name: state.brand.name || "",
            created_at: new Date().toISOString(),
            platform_urls: [],
            integrated_platforms: [],
            brand_voice_tags: [],
            integration_account_ids: Object.values(state.connections)
              .flatMap(c => c.accounts || [])
              .filter(a => a.selected)
              .map(a => a.id),
          }
        },
          onEvent: (event) => {
            if (event.type === "stream") {
              setSections(prev => prev.map(s => {
                if (s.source === event.section) {
                  return { ...s, content: s.content + event.delta, isStreaming: true };
                }
                return s;
              }));
            } else if (event.type === "voice" || event.type === "audience" || event.type === "website" || event.type === "business") {
              const typeToSource = { voice: "voice", audience: "audience", website: "website", business: "business" };
              const source = (typeToSource as any)[event.type];
              if (source) {
                const content = typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload, null, 2);
                setSections(prev => prev.map(s => s.source === source ? { ...s, content, isStreaming: false } : s));
              }
            } else if (event.type === "complete") {
              setSections(prev => prev.map(s => ({ ...s, isStreaming: false })));
              setHasGeneratedReport(true);
            }
          }
      });
    } catch (error) {
      show({ title: "Agent Error", description: "Could not generate report.", variant: "error" });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleLaunch = async () => {
    setIsSubmitting(true);
    try {
      await updateState({
        brand: {
          brandVoice: sections.find(s => s.id === "voice")?.content || state.brand.brandVoice,
          targetAudience: sections.find(s => s.id === "audience")?.content || state.brand.targetAudience,
        }
      });

      await completeOnboardingAction(brandId);
      await runStrategicAnalysis(brandId);
      
      show({ title: "Strategy Launched", description: "Your analysis is processing.", variant: "success" });
      router.push("/dashboard");
    } catch (error) {
      show({ title: "Launch Failed", description: "Check your connections and try again.", variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAccountsCount = Object.values(state.connections)
    .flatMap(c => c.accounts || [])
    .filter(a => a.selected).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32 animate-in fade-in duration-500">
      <Card className="bg-muted/30 border-dashed overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-8 items-center justify-center">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                <AvatarImage src={logoUrl || ""} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {state.brand.name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold leading-none mb-1">{state.brand.name}</p>
                <p className="text-xs text-muted-foreground">{state.brand.industry}</p>
              </div>
            </div>
            
            <div className="h-8 w-px bg-border hidden md:block" />

            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Link2 className="w-4 h-4 text-primary" />
              </div>
              <div className="text-sm">
                <span className="font-bold tabular-nums">{selectedAccountsCount}</span>
                <span className="text-muted-foreground ml-1">Accounts</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="text-sm">
                <span className="font-bold tabular-nums">{state.documents.length}</span>
                <span className="text-muted-foreground ml-1">Documents</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.filter(s => ["voice", "audience"].includes(s.id)).map((section) => (
          <Card key={section.id} className="border-muted-foreground/10 bg-card/50">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-sm bg-muted text-muted-foreground">
                  {section.icon}
                </div>
                <CardTitle className="text-sm font-bold uppercase tracking-wider">{section.title}</CardTitle>
              </div>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-bold">Grounding Input</Badge>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <SafeMarkdown content={section.content || "No input provided."} mode="static" className="text-xs leading-relaxed text-foreground/80" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.filter(s => ["market", "competitive"].includes(s.id)).map((section) => {
          const shouldShowSkeleton = section.isStreaming && !section.content;
          return (
            <Card key={section.id} className="overflow-hidden border-muted-foreground/10 flex flex-col">
              <CardHeader className="bg-muted/10 py-3 px-6 flex flex-row items-center justify-between space-y-0 border-b border-muted-foreground/5">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                    {section.icon}
                  </div>
                  <CardTitle className="text-base font-bold">{section.title}</CardTitle>
                  {section.isStreaming && <Sparkles className="w-4 h-4 text-primary animate-pulse" />}
                </div>
              </CardHeader>
              <CardContent className="p-6 flex-1">
                {shouldShowSkeleton ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[92%]" />
                    <Skeleton className="h-4 w-[85%]" />
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <SafeMarkdown 
                      content={section.content || "Waiting for agent analysis…"} 
                      mode={section.isStreaming ? "streaming" : "static"} 
                      className="text-sm leading-relaxed text-foreground/90" 
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t p-4 z-50">
        <div className="max-w-4xl mx-auto flex gap-4 items-center">
          <Button variant="ghost" onClick={() => updateState({ step: 1 })} disabled={isSubmitting}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          
          <div className="flex-1 relative">
            <Textarea 
              placeholder={hasGeneratedReport ? "Refine report with guidance…" : "Optional guidance before generating…"}
              className="min-h-[44px] max-h-[44px] py-3 resize-none pr-12 text-sm bg-background border-primary/20 focus-visible:ring-primary/30"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
            />
            {!hasGeneratedReport && !isRegenerating && (
              <Button 
                className="absolute right-1 top-1 h-8 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                onClick={() => triggerReportAgent(guidance)}
              >
                Go
              </Button>
            )}
            {hasGeneratedReport && !isRegenerating && (
              <Button 
                size="icon" 
                variant="ghost" 
                className="absolute right-1 top-1 h-8 w-8"
                onClick={() => triggerReportAgent(guidance)}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
            {isRegenerating && (
              <div className="absolute right-3 top-2.5">
                <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              </div>
            )}
          </div>

          <Button 
            className={`min-w-[200px] h-11 font-bold shadow-xl transition-all duration-300 ${
              hasGeneratedReport 
                ? "bg-indigo-600 hover:bg-indigo-700 text-white" 
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
            }`}
            onClick={handleLaunch}
            disabled={isSubmitting || isRegenerating || !hasGeneratedReport}
          >
            {isSubmitting ? "Launching…" : (
              <>Approve & Launch <Rocket className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
