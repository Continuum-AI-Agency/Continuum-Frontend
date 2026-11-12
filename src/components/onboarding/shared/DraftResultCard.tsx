'use client';

import { AlertTriangle, CheckCircle2, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useEffect, useId, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';

type DraftResultCardProps = {
  voice: string;
  audience: string;
  isDrafting: boolean;
  onSave: (voice: string, audience: string) => void;
};

export function DraftResultCard({ voice, audience, isDrafting, onSave }: DraftResultCardProps) {
  const tUi = useTranslations('onboarding');
  const voiceId = useId();
  const audienceId = useId();

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
              {tUi('m_e63991ef35')}
            </CardTitle>
            <CardDescription>
              {isDrafting ? tUi('m_54bd9e6ef8') : tUi('m_77f41f261d')}
            </CardDescription>
          </div>
          {isDrafting && (
            <Badge variant="secondary" className="animate-pulse">
              {tUi('analyzing')}
            </Badge>
          )}
          {!isDrafting && hasContent && (
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {tUi('m_54b2ffa9fd')}
            </Badge>
          )}
        </div>
        {isDrafting && <Progress value={voice.length > 0 ? 60 : 10} className="h-1 mt-2" />}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label
              htmlFor={voiceId}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {tUi('m_879e54c0b9')}
            </label>
            <Textarea
              id={voiceId}
              value={localVoice}
              onChange={(e) => {
                setLocalVoice(e.target.value);
                onSave(e.target.value, localAudience);
              }}
              className="min-h-[250px] resize-none focus-visible:ring-1"
              placeholder={tUi('m_41f0718f5c')}
              readOnly={isDrafting}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor={audienceId}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {tUi('m_5cc6318e21')}
            </label>
            <Textarea
              id={audienceId}
              value={localAudience}
              onChange={(e) => {
                setLocalAudience(e.target.value);
                onSave(localVoice, e.target.value);
              }}
              className="min-h-[250px] resize-none focus-visible:ring-1"
              placeholder={tUi('m_aa406dbc72')}
              readOnly={isDrafting}
            />
          </div>
        </div>

        {!isDrafting && !voice && !audience && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{tUi('m_ed120bd8f0')}</AlertTitle>
            <AlertDescription>{tUi('m_fb588872c5')}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
