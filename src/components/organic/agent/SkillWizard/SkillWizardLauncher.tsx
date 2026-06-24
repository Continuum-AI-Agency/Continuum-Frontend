'use client';

import type { Skill } from '@continuum/contracts';
import { ChevronLeft, Lock, Wand2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { archiveBrandSkill } from '@/lib/organic/skills';
import { SkillWizardForm } from './SkillWizardForm';
import { SkillWizardList } from './SkillWizardList';

type Props = {
  brandId: string;
  skills: Skill[];
  templates: Skill[];
  onChangedAction: () => void;
};

type Screen =
  | { kind: 'list' }
  | { kind: 'form'; skill: Skill | null }
  | { kind: 'template'; skill: Skill };

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

// Contextual skill wizard anchored at the bottom-right of the chat. The panel
// expands upward from the trigger (so it never clips the composer) into a
// create/edit surface backed by the brand-skill endpoints.
export function SkillWizardLauncher({ brandId, skills, templates, onChangedAction }: Props) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const reduceMotion = useReducedMotion();

  const close = () => {
    setOpen(false);
    setScreen({ kind: 'list' });
  };

  const openSkill = (skill: Skill) =>
    setScreen(skill.isTemplate ? { kind: 'template', skill } : { kind: 'form', skill });

  const title =
    screen.kind === 'form'
      ? screen.skill
        ? 'Edit skill'
        : 'New skill'
      : screen.kind === 'template'
        ? 'Library skill'
        : 'Skills';

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Skill wizard"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-2.5 text-[12.5px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Wand2 className="h-3.5 w-3.5" />
        Manage skills
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 6 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ transformOrigin: 'bottom right' }}
            className="absolute bottom-full right-0 mb-2 z-50 w-80 overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {screen.kind !== 'list' && (
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => setScreen({ kind: 'list' })}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <span className="truncate text-[13px] font-semibold">{title}</span>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[min(28rem,55vh)] overflow-y-auto p-3">
              {screen.kind === 'list' && (
                <SkillWizardList
                  skills={skills}
                  templates={templates}
                  onNewAction={() => setScreen({ kind: 'form', skill: null })}
                  onEditAction={openSkill}
                  onArchiveAction={async (skill) => {
                    await archiveBrandSkill(skill.id);
                    onChangedAction();
                  }}
                />
              )}

              {screen.kind === 'form' && (
                <SkillWizardForm
                  brandId={brandId}
                  initial={screen.skill}
                  onCancelAction={() => setScreen({ kind: 'list' })}
                  onSavedAction={() => {
                    onChangedAction();
                    setScreen({ kind: 'list' });
                  }}
                />
              )}

              {screen.kind === 'template' && (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    First-party library skill — read-only. Tag it in chat to apply it.
                  </p>
                  <span className="text-[13px] font-medium">{screen.skill.name}</span>
                  {screen.skill.description && (
                    <p className="text-[12px] text-muted-foreground">{screen.skill.description}</p>
                  )}
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-foreground">
                    {screen.skill.directives}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
