"use client";

import { useState } from "react";
import { Loader2, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/ToastProvider";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { createMagicLinkAction } from "@/app/(post-auth)/settings/actions";
import { trackOnboardingEvent } from "@/lib/onboarding/telemetry";
import type { BrandRole } from "@/lib/onboarding/state";

const ASSIGNABLE_ROLES: Exclude<BrandRole, "owner">[] = ["admin", "operator", "viewer"];

const ROLE_LABEL: Record<Exclude<BrandRole, "owner">, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
};

export function TeamInviteSection() {
  const { brandId, state, updateState } = useOnboarding();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<BrandRole, "owner">>("operator");
  const [submitting, setSubmitting] = useState(false);
  const sentInvites = state.invites ?? [];

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      show({ title: "Invalid email", description: "Please enter a valid email address.", variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await createMagicLinkAction(brandId, trimmed, role);
      trackOnboardingEvent("onboarding_member_invited", {
        role,
        email_sent: result.emailSent,
        existing_user: result.existingUser ?? false,
      });

      if (result.inviteId) {
        const nextInvite = {
          id: result.inviteId,
          email: trimmed,
          role,
          token: result.link.split("/").pop() ?? result.inviteId,
          createdAt: new Date().toISOString(),
          expiresAt: null,
        };
        await updateState({ invites: [...sentInvites, nextInvite] });
      }

      show({
        title: result.emailSent ? "Invite sent" : "Invite link created",
        description: result.emailSent
          ? `We emailed ${trimmed} an invitation.`
          : `Share the link with ${trimmed} to grant access.`,
        variant: "success",
      });
      setEmail("");
    } catch (error) {
      show({
        title: "Couldn't send invite",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-dashed border-2 border-[#e5e7eb] bg-muted/10 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Invite your team
            </CardTitle>
            <CardDescription>
              Optional. Anyone you invite gets access to this brand. You can also do this later in Settings.
            </CardDescription>
          </div>
          {sentInvites.length > 0 ? (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {sentInvites.length} sent
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto]">
          <div className="space-y-1">
            <Label htmlFor="onboarding-invite-email" className="sr-only">
              Email
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="onboarding-invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleInvite();
                  }
                }}
                placeholder="teammate@company.com"
                className="h-10 pl-9"
                disabled={submitting}
              />
            </div>
          </div>
          <Select value={role} onValueChange={(next) => setRole(next as Exclude<BrandRole, "owner">)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((option) => (
                <SelectItem key={option} value={option}>
                  {ROLE_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={handleInvite} disabled={submitting || !email.trim()} className="h-10">
            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Send invite
          </Button>
        </div>

        {sentInvites.length > 0 ? (
          <ul className="space-y-1.5 pt-1">
            {sentInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-md border bg-background px-2.5 py-1.5 text-[12px]"
              >
                <span className="truncate text-foreground">{invite.email}</span>
                <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                  {ROLE_LABEL[invite.role as Exclude<BrandRole, "owner">] ?? invite.role}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
