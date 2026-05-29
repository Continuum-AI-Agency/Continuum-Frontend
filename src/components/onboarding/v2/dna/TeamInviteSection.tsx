"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleNotch, Envelope, Sparkle, Users, X } from "@phosphor-icons/react";

import { createMagicLinkAction } from "@/app/(post-auth)/settings/actions";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/ToastProvider";
import { trackOnboardingEvent } from "@/lib/onboarding/telemetry";
import type { BrandInvite, BrandRole } from "@/lib/onboarding/state";
import { cn } from "@/lib/utils";

type AssignableRole = Exclude<BrandRole, "owner">;

const ASSIGNABLE_ROLES: AssignableRole[] = ["admin", "operator", "viewer"];

const ROLE_LABEL: Record<AssignableRole, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
};

const ROLE_BLURB: Record<AssignableRole, string> = {
  admin: "Full access + billing",
  operator: "Plan and launch campaigns",
  viewer: "Read-only access",
};

const ENTER_EASE = [0.16, 1, 0.3, 1] as const;

function initialsFor(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "?";
  const local = trimmed.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local.slice(0, 2) || "?").toUpperCase();
}

function gradientFor(email: string): string {
  // Stable per-email hue without crypto: simple djb2-ish hash.
  let hash = 5381;
  for (let i = 0; i < email.length; i += 1) hash = (hash * 33) ^ email.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  const hueB = (hue + 35) % 360;
  return `linear-gradient(135deg, hsl(${hue} 78% 58%) 0%, hsl(${hueB} 80% 52%) 100%)`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const chipVariants = {
  hidden: { opacity: 0, y: 6, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: ENTER_EASE } },
  exit: { opacity: 0, y: -4, scale: 0.96, transition: { duration: 0.16, ease: ENTER_EASE } },
};

export function TeamInviteSection() {
  const { brandId, state, updateState } = useOnboarding();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("operator");
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const sentInvites: BrandInvite[] = state.invites ?? [];

  const trimmed = email.trim();
  const emailValid = trimmed.length > 0 && isValidEmail(trimmed);
  const previewInitials = useMemo(() => initialsFor(trimmed), [trimmed]);
  const previewGradient = useMemo(() => gradientFor(trimmed || "preview"), [trimmed]);

  const handleInvite = async () => {
    if (!emailValid) {
      show({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "error",
      });
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
        const nextInvite: BrandInvite = {
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
          ? `We emailed ${trimmed}.`
          : `Share the link with ${trimmed} to grant access.`,
        variant: "success",
      });
      setEmail("");
      setJustSent(true);
      window.setTimeout(() => setJustSent(false), 1200);
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

  const handleRemove = async (inviteId: string) => {
    const next = sentInvites.filter((invite) => invite.id !== inviteId);
    await updateState({ invites: next });
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_18%,var(--border))] bg-card/80 shadow-[0_1px_3px_oklch(0%_0_0/0.06),inset_0_1px_0_oklch(100%_0_0/0.6)] text-foreground">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Users className="h-4 w-4 text-[var(--cs-violet,#5a39ff)]" />
            Invite your team
          </div>
          <p className="text-[12px] leading-snug text-muted-foreground">
            Magic-link invites. They can join with one click.
          </p>
        </div>
        <AnimatePresence>
          {sentInvites.length > 0 ? (
            <motion.span
              key={`count-${sentInvites.length}`}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.22, ease: ENTER_EASE }}
              className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--cs-teal,#0daea2)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--cs-teal,#0daea2)]"
            >
              <Check className="h-2.5 w-2.5" weight="bold" />
              {sentInvites.length} sent
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="space-y-2.5">
          <div className="relative">
            <Label htmlFor="onboarding-invite-email" className="sr-only">
              Email
            </Label>
            <motion.div
              aria-hidden
              animate={{
                background: emailValid ? previewGradient : "transparent",
                color: emailValid ? "#ffffff" : "var(--muted-foreground)",
                borderColor: emailValid
                  ? "transparent"
                  : "color-mix(in srgb, var(--cs-violet,#5a39ff) 18%, var(--border))",
              }}
              transition={{ duration: 0.18, ease: ENTER_EASE }}
              className={cn(
                "pointer-events-none absolute left-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed text-[10.5px] font-semibold",
              )}
            >
              {emailValid ? previewInitials : <Envelope className="h-3.5 w-3.5" aria-hidden />}
            </motion.div>
            <Input
              id="onboarding-invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleInvite();
                }
              }}
              placeholder="teammate@company.com"
              disabled={submitting}
              className="h-11 rounded-lg border-input bg-background pl-12 text-[13.5px] text-foreground focus-visible:border-primary focus-visible:ring-primary/20"
            />
          </div>

          <div
            role="radiogroup"
            aria-label="Role"
            className="relative flex items-center gap-1 rounded-full border border-border bg-muted p-1"
          >
            {ASSIGNABLE_ROLES.map((option) => {
              const selected = role === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRole(option)}
                  disabled={submitting}
                  className={cn(
                    "relative flex-1 rounded-full px-3 py-1.5 text-[12px] font-medium",
                    "motion-safe:transition-colors motion-safe:duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cs-violet,#5a39ff)] focus-visible:ring-offset-1",
                    selected ? "text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {selected ? (
                    <motion.span
                      layoutId="role-pill-active"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 -z-0 rounded-full bg-[var(--cs-violet,#5a39ff)] shadow-[0_1px_2px_oklch(0%_0_0/0.18),inset_0_1px_0_oklch(100%_0_0/0.22)]"
                    />
                  ) : null}
                  <span className="relative">{ROLE_LABEL[option]}</span>
                </button>
              );
            })}
          </div>
          <p
            key={role}
            className="px-1 text-[11px] leading-snug text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
          >
            {ROLE_BLURB[role]}
          </p>

          <Button
            type="button"
            variant="default"
            onClick={handleInvite}
            disabled={submitting || !emailValid}
            className={cn(
              "h-11 w-full text-[13.5px]",
              "motion-safe:transition-transform motion-safe:duration-150 active:translate-y-px",
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {submitting ? (
                <motion.span
                  key="sending"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-2"
                >
                  <CircleNotch className="h-3.5 w-3.5 animate-spin" />
                  Sending invite…
                </motion.span>
              ) : justSent ? (
                <motion.span
                  key="sent"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: ENTER_EASE }}
                  className="inline-flex items-center gap-2"
                >
                  <Check className="h-4 w-4" weight="bold" />
                  Invite sent
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-2"
                >
                  <Sparkle className="h-3.5 w-3.5" />
                  Send invite
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <AnimatePresence initial={false} mode="wait">
            {sentInvites.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5 rounded-lg bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_5%,transparent)] px-3 py-2.5"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_12%,transparent)]">
                  <Users className="h-3.5 w-3.5 text-[var(--cs-violet,#5a39ff)]" />
                </div>
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  No invites yet. Add teammates now or later from Settings.
                </p>
              </motion.div>
            ) : (
              <motion.ul
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-1.5"
              >
                <AnimatePresence initial={false}>
                  {sentInvites.map((invite) => {
                    const grad = gradientFor(invite.email);
                    const inits = initialsFor(invite.email);
                    const inviteRole = invite.role as AssignableRole;
                    return (
                      <motion.li
                        key={invite.id}
                        layout
                        variants={chipVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        whileHover={{ y: -1 }}
                        className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 motion-safe:transition-shadow motion-safe:duration-150 hover:shadow-[0_1px_3px_oklch(0%_0_0/0.05),inset_0_1px_0_oklch(100%_0_0/0.7)] text-foreground"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white shadow-[inset_0_1px_0_oklch(100%_0_0/0.25)]"
                            style={{ background: grad }}
                            aria-hidden
                          >
                            {inits}
                          </div>
                          <span className="truncate text-[12.5px] text-foreground">{invite.email}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="rounded-full bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_10%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--cs-violet,#5a39ff)]">
                            {ROLE_LABEL[inviteRole] ?? invite.role}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 motion-safe:transition-opacity motion-safe:duration-150 group-hover:opacity-100"
                            onClick={() => handleRemove(invite.id)}
                            title="Revoke invite"
                          >
                            <X className="h-3 w-3 text-muted-foreground hover:text-rose-600" />
                          </Button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
