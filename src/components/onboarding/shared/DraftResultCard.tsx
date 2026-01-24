"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Wand2, AlertTriangle, CheckCircle2 } from "lucide-react";

type DraftResultCardProps = { 
  voice: string; 
  audience: string; 
  isDrafting: boolean;
  onSave: (voice: string, audience: string) => void;
};

export function DraftResultCard({ 
  voice, 
  audience, 
  isDrafting,
  onSave 
}: DraftResultCardProps) {
  const [localVoice, setLocalVoice] = useState(voice);
  const [localAudience, setLocalAudience] = useState(audience);

  useEffect(() => {
    if (isDrafting) {
      setLocalVoice(voice);
      setLocalAudience(audience);
    }
  }, [voice, audience, isDrafting]);

  const hasContent = localVoice || localAudience;

  return (
    <Card className="w-full mt-6 border-muted-foreground/20 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              AI Analysis
            </CardTitle>
            <CardDescription>
              {isDrafting ? "Analyzing website and extracting insights..." : "Review and refine your brand identity."}
            </CardDescription>
          </div>
          {isDrafting && <Badge variant="secondary" className="animate-pulse">Analyzing...</Badge>}
          {!isDrafting && hasContent && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1"/> Ready</Badge>}
        </div>
        {isDrafting && <Progress value={voice.length > 0 ? 60 : 10} className="h-1 mt-2" />}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Brand Voice
            </label>
            <Textarea 
              value={localVoice} 
              onChange={(e) => { setLocalVoice(e.target.value); onSave(e.target.value, localAudience); }}
              className="min-h-[250px] resize-none focus-visible:ring-1"
              placeholder="Brand voice will appear here..."
              readOnly={isDrafting}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Target Audience
            </label>
            <Textarea 
              value={localAudience} 
              onChange={(e) => { setLocalAudience(e.target.value); onSave(localVoice, e.target.value); }}
              className="min-h-[250px] resize-none focus-visible:ring-1"
              placeholder="Target audience segments will appear here..."
              readOnly={isDrafting}
            />
          </div>
        </div>

        {!isDrafting && !voice && !audience && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Analysis Failed</AlertTitle>
            <AlertDescription>
              We couldn't extract enough information. Please enter your details manually.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
