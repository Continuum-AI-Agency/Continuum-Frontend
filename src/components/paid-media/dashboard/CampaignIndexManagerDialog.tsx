"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

type CampaignOption = {
  id: string;
  name: string;
  status: string;
};

type CampaignIndexDraft = {
  id?: string;
  name: string;
  campaignIds: string[];
};

type CampaignIndexManagerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: CampaignOption[];
  initialValue?: CampaignIndexDraft;
  saving?: boolean;
  onSave: (draft: CampaignIndexDraft) => void;
};

export function CampaignIndexManagerDialog({
  open,
  onOpenChange,
  campaigns,
  initialValue,
  saving = false,
  onSave,
}: CampaignIndexManagerDialogProps) {
  const [name, setName] = React.useState("");
  const [selectedCampaignIds, setSelectedCampaignIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;

    setName(initialValue?.name ?? "");
    setSelectedCampaignIds(initialValue?.campaignIds ?? []);
  }, [initialValue, open]);

  const toggleCampaign = React.useCallback((campaignId: string, checked: boolean) => {
    setSelectedCampaignIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, campaignId]));
      }
      return current.filter((id) => id !== campaignId);
    });
  }, []);

  const canSave = name.trim().length > 0 && selectedCampaignIds.length > 0 && !saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initialValue?.id ? "Edit campaign index" : "Create campaign index"}</DialogTitle>
          <DialogDescription>
            Name a campaign index and choose campaigns to aggregate together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaign-index-name">Index name</Label>
            <Input
              id="campaign-index-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Q1 Core Portfolio"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>Campaigns ({selectedCampaignIds.length} selected)</Label>
            <ScrollArea className="h-72 rounded-md border p-2">
              <div className="space-y-1">
                {campaigns.map((campaign) => {
                  const checked = selectedCampaignIds.includes(campaign.id);

                  return (
                    <label
                      key={campaign.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleCampaign(campaign.id, value === true)}
                          aria-label={`Select ${campaign.name}`}
                        />
                        <span className="truncate">{campaign.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{campaign.status}</span>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                id: initialValue?.id,
                name: name.trim(),
                campaignIds: selectedCampaignIds,
              })
            }
            disabled={!canSave}
          >
            {saving ? "Saving..." : initialValue?.id ? "Save index" : "Create index"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
