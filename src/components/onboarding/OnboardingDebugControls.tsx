"use client";

import React, { useState } from "react";
import { Bug, Wand2, Trash2, FastForward, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";

export function OnboardingDebugControls() {
  const { updateState, resetState } = useOnboarding();
  const [isOpen, setIsOpen] = useState(false);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const handleMockStep1 = () => {
    updateState({
      step: 0,
      brand: {
        name: "Acme Corp",
        industry: "Technology",
        website: "https://continuum.ai",
        timezone: "GMT-08:00",
        brandVoice: "Professional, authoritative, yet accessible.",
        targetAudience: "CMOs and Marketing Directors at Series B+ B2B SaaS companies.",
      },
    });
    setIsOpen(false);
  };

  const handleJumpToStep2 = () => {
    updateState({
      step: 1,
      brand: {
        name: "Acme Corp",
        industry: "Technology",
        website: "https://continuum.ai",
        timezone: "GMT-08:00",
        brandVoice: "Professional, authoritative, yet accessible.",
        targetAudience: "CMOs and Marketing Directors at Series B+ B2B SaaS companies.",
      },
    });
    setIsOpen(false);
  };

  const handleJumpToStep3 = () => {
    updateState({
      step: 2,
      brand: {
        name: "Acme Corp",
        industry: "Technology",
        website: "https://continuum.ai",
        timezone: "GMT-08:00",
        brandVoice: "Professional, authoritative, yet accessible.",
        targetAudience: "CMOs and Marketing Directors at Series B+ B2B SaaS companies.",
      },
      connections: {
        googleAds: {
          connected: true,
          accountId: "mock-google-id",
          accounts: [{ id: "mock-google-id", name: "Acme Google Ads", status: "active", selected: true }],
          lastSyncedAt: new Date().toISOString(),
        }
      }
    });
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 opacity-50 hover:opacity-100 transition-opacity">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-full shadow-lg bg-background">
            <Bug className="h-5 w-5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup heading="Navigation & Mocking">
                <CommandItem onSelect={handleMockStep1} className="cursor-pointer">
                  <Wand2 className="mr-2 h-4 w-4" />
                  <span>Fill Step 1 (Magic)</span>
                </CommandItem>
                <CommandItem onSelect={handleJumpToStep2} className="cursor-pointer">
                  <FastForward className="mr-2 h-4 w-4" />
                  <span>Jump to Integrations</span>
                </CommandItem>
                <CommandItem onSelect={handleJumpToStep3} className="cursor-pointer">
                  <CheckSquare className="mr-2 h-4 w-4" />
                  <span>Jump to Review</span>
                </CommandItem>
              </CommandGroup>
              
              <CommandSeparator />
              
              <CommandGroup heading="Actions">
                <CommandItem onSelect={() => { resetState(); setIsOpen(false); }} className="text-destructive cursor-pointer">
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Nuke Brand State</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
