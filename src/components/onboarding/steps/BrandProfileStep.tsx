"use client";

import React, { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { useBrandDraftStream } from "@/components/onboarding/hooks/useBrandDraftStream";
import { LogoUploader } from "@/components/onboarding/shared/LogoUploader";
import { DocumentUploader } from "@/components/onboarding/shared/DocumentUploader";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Globe, Sparkles, Loader2, Wand2, RefreshCw, Edit3, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";

const INDUSTRIES = [
  "Advertising",
  "E-commerce",
  "Finance",
  "Health & Wellness",
  "Hospitality",
  "Media & Entertainment",
  "SaaS",
  "Technology",
  "Other",
];

const TIMEZONES = [
  "GMT-12:00", "GMT-11:00", "GMT-10:00", "GMT-09:00", "GMT-08:00", "GMT-07:00",
  "GMT-06:00", "GMT-05:00", "GMT-04:00", "GMT-03:00", "GMT-02:00", "GMT-01:00",
  "GMT+00:00", "GMT+01:00", "GMT+02:00", "GMT+03:00", "GMT+04:00", "GMT+05:00",
  "GMT+05:30", "GMT+06:00", "GMT+07:00", "GMT+08:00", "GMT+09:00", "GMT+10:00",
  "GMT+11:00", "GMT+12:00"
];

const REFERRAL_SOURCES = [
  "Search Engine (Google, Bing)",
  "Social Media (LinkedIn, Twitter)",
  "Friend or Colleague",
  "Blog or Article",
  "Podcast",
  "Other"
];

const formSchema = z.object({
  name: z.string().min(2, "Brand name is required"),
  industry: z.string().min(1, "Industry is required"),
  website: z.string().optional().or(z.literal("")), 
  timezone: z.string().min(1, "Timezone is required"),
  brandVoice: z.string().optional().or(z.literal("")),
  targetAudience: z.string().optional().or(z.literal("")),
  brandVoiceTags: z.array(z.string()).optional(),
  referralSource: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function BrandProfileStep() {
  const { state, updateState, brandId } = useOnboarding();
  const { brand } = state;
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
  const [isEditingAI, setIsEditingAI] = useState(false);
  
  const { 
    startDraft: triggerDraft, 
    voice,
    audience,
    isDrafting
  } = useBrandDraftStream(brandId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: brand.name || "",
      industry: brand.industry || "",
      website: brand.website || "",
      timezone: brand.timezone || "GMT+00:00",
      brandVoice: brand.brandVoice || "",
      targetAudience: brand.targetAudience || "",
      brandVoiceTags: brand.brandVoiceTags || [],
      referralSource: "", 
    },
  });

  const website = form.watch("website");

  useEffect(() => {
    if (isDrafting) {
      if (voice) form.setValue("brandVoice", voice, { shouldValidate: true });
      if (audience) form.setValue("targetAudience", audience, { shouldValidate: true });
    } else if (analysisStarted && !isDrafting) {
      setStreamComplete(true);
    }
  }, [voice, audience, isDrafting, form, analysisStarted]);

  const handlePrimaryAction = async (e: React.MouseEvent) => {
    e.preventDefault(); 

    if (!analysisStarted && !streamComplete) {
      const url = form.getValues("website");
      if (url && url.length > 4) {
        setAnalysisStarted(true);
        triggerDraft(url);
      }
      return;
    }

    if (streamComplete && !isDrafting) {
      form.handleSubmit(onSubmit)();
    }
  };

  const onSubmit = async (values: FormValues) => {
    await updateState({
      step: 1,
      brand: {
        name: values.name,
        industry: values.industry,
        timezone: values.timezone,
        website: values.website || null,
        brandVoice: values.brandVoice || null,
        targetAudience: values.targetAudience || null,
        brandVoiceTags: (values.brandVoiceTags || []) as any,
      },
    });
  };

  const showAIFields = analysisStarted || (brand.brandVoice && brand.brandVoice.length > 0) || isDrafting;
  const isReadyToAnalyze = website && website.length > 4;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create your Brand Profile</h1>
        <p className="text-muted-foreground">
          Let's set up your brand identity to personalize your AI agents.
        </p>
      </div>

      <Card className="max-w-4xl mx-auto border-none shadow-none bg-transparent">
        <CardContent className="p-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex flex-col items-center gap-4 min-w-[160px]">
                  <FormLabel>Brand Logo</FormLabel>
                  <LogoUploader />
                </div>

                <div className="flex-1 space-y-4 w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Brand Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Corp" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Industry</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select industry" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INDUSTRIES.map((ind) => (
                                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timezone</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select timezone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TIMEZONES.map((tz) => (
                                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="referralSource"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>How did you hear about us?</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select source" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {REFERRAL_SOURCES.map((src) => (
                                <SelectItem key={src} value={src}>{src}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Globe className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                              className="pl-9" 
                              placeholder="https://example.com" 
                              {...field} 
                              value={field.value || ""}
                              disabled={isDrafting}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className={showAIFields ? "block animate-in fade-in slide-in-from-top-4 duration-700" : "hidden"}>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  <h3 className="text-lg font-semibold">AI Generated Insights</h3>
                  {isDrafting && <Progress value={30} className="w-[100px] h-2 animate-pulse" />}
                  
                  {!isDrafting && (form.getValues("brandVoice") || form.getValues("targetAudience")) && (
                    <div className="flex gap-2 ml-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setIsEditingAI(!isEditingAI)}
                      >
                        {isEditingAI ? <><Eye className="mr-2 h-3 w-3" /> Preview</> : <><Edit3 className="mr-2 h-3 w-3" /> Edit</>}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          if (website) triggerDraft(website);
                        }}
                      >
                        <RefreshCw className="mr-2 h-3 w-3" />
                        Regenerate
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[300px]">
                  <FormField
                    control={form.control}
                    name="brandVoice"
                    render={({ field }) => (
                      <FormItem className="flex flex-col h-full">
                        <FormLabel>Brand Voice</FormLabel>
                        <FormControl className="flex-1">
                          {isEditingAI || isDrafting ? (
                            <Textarea 
                              {...field} 
                              placeholder="AI will generate your brand voice here..."
                              className="h-full min-h-[250px] font-mono text-sm leading-relaxed resize-none"
                            />
                          ) : (
                            <div className="h-full min-h-[250px] p-3 rounded-md border border-input bg-muted/20 prose prose-sm dark:prose-invert max-w-none overflow-y-auto">
                              <SafeMarkdown content={field.value || "AI will generate your brand voice here..."} mode="static" />
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetAudience"
                    render={({ field }) => (
                      <FormItem className="flex flex-col h-full">
                        <FormLabel>Target Audience</FormLabel>
                        <FormControl className="flex-1">
                          {isEditingAI || isDrafting ? (
                            <Textarea 
                              {...field} 
                              placeholder="AI will identify your target audience here..."
                              className="h-full min-h-[250px] font-mono text-sm leading-relaxed resize-none"
                            />
                          ) : (
                            <div className="h-full min-h-[250px] p-3 rounded-md border border-input bg-muted/20 prose prose-sm dark:prose-invert max-w-none overflow-y-auto">
                              <SafeMarkdown content={field.value || "AI will identify your target audience here..."} mode="static" />
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="pt-4 border-t">
                <DocumentUploader />
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  type="button" 
                  onClick={handlePrimaryAction}
                  size="lg" 
                  className="min-w-[150px]"
                  disabled={!isReadyToAnalyze || isDrafting} 
                >
                  {isDrafting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</>
                  ) : streamComplete ? (
                    <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>
                  ) : (
                    <><Wand2 className="mr-2 h-4 w-4" /> Analyze Website</>
                  )}
                </Button>
              </div>

            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
