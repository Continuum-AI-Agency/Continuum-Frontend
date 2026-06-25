'use client';

// Composer for turning a canvas-node selection into a reusable creative skill. It
// projects the selected nodes, asks the Backend translator for a draft, lets the
// user edit it, and saves via the brand-skill CRUD. Saving stays user-gated — the
// translator never persists.

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/ToastProvider';
import { brandSkillsQueryKey, createBrandSkill } from '@/lib/organic/skills';
import { draftSkillFromSelection } from '@/lib/ai-studio/creativeSkills';
import { projectSkillSelection } from '../utils/projectSkillSelection';
import type { StudioNode } from '../types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId?: string;
  nodes: StudioNode[];
};

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);

export function CreateSkillFromSelectionDialog({ open, onOpenChange, brandId, nodes }: Props) {
  const { show } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [directives, setDirectives] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [instructions, setInstructions] = React.useState('');
  const [isDrafting, setIsDrafting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selection = React.useMemo(
    () => (brandId ? projectSkillSelection(nodes, brandId) : null),
    [brandId, nodes],
  );
  const hasUsableNodes = (selection?.nodes.length ?? 0) > 0;

  const generateDraft = React.useCallback(async () => {
    if (!selection || selection.nodes.length === 0) return;
    setIsDrafting(true);
    setError(null);
    try {
      const draft = await draftSkillFromSelection(
        instructions.trim() ? { ...selection, instructions: instructions.trim() } : selection,
      );
      setName(draft.name);
      setDescription(draft.description ?? '');
      setDirectives(draft.directives);
      setTags((draft.tags ?? []).join(', '));
    } catch {
      setError('Could not draft a skill from this selection. Try again.');
    } finally {
      setIsDrafting(false);
    }
  }, [selection, instructions]);

  // Draft once when the dialog opens with a usable selection.
  const draftedRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      draftedRef.current = false;
      setName('');
      setDescription('');
      setDirectives('');
      setTags('');
      setInstructions('');
      setError(null);
      return;
    }
    if (draftedRef.current || !hasUsableNodes) return;
    draftedRef.current = true;
    void generateDraft();
  }, [open, hasUsableNodes, generateDraft]);

  const canSave = name.trim().length > 0 && directives.trim().length > 0 && !isSaving && !isDrafting;

  const save = React.useCallback(async () => {
    if (!brandId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await createBrandSkill({
        brandId,
        name: name.trim(),
        kind: 'creative_direction',
        description: description.trim() || null,
        directives: directives.trim(),
        tags: parseTags(tags),
      });
      await queryClient.invalidateQueries({ queryKey: brandSkillsQueryKey(brandId) });
      show({ title: 'Creative skill saved', description: `"${name.trim()}" is in your brand library.`, variant: 'success' });
      onOpenChange(false);
    } catch {
      setError('Could not save the skill. Try again.');
    } finally {
      setIsSaving(false);
    }
  }, [brandId, canSave, name, description, directives, tags, queryClient, show, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create skill from selection</DialogTitle>
          <DialogDescription>
            Distill the selected nodes into reusable creative direction you can apply to future generations.
          </DialogDescription>
        </DialogHeader>

        {!hasUsableNodes ? (
          <p className="py-4 text-sm text-muted-foreground">
            Select nodes that contain prompts or reference roles, then try again.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-instructions">Steer (optional)</Label>
              <Input
                id="skill-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="e.g. focus on the lighting and color grade"
                disabled={isDrafting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-name">Name</Label>
              <Input
                id="skill-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                placeholder={isDrafting ? 'Drafting…' : 'Skill name'}
                disabled={isDrafting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-description">Description</Label>
              <Input
                id="skill-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                placeholder="Short description (when to use it)"
                disabled={isDrafting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-directives">Directives</Label>
              <Textarea
                id="skill-directives"
                value={directives}
                onChange={(event) => setDirectives(event.target.value)}
                rows={8}
                placeholder={isDrafting ? 'Drafting creative direction…' : 'Reusable creative direction'}
                disabled={isDrafting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-tags">Tags</Label>
              <Input
                id="skill-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Tags (comma separated)"
                disabled={isDrafting}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {hasUsableNodes && (
            <Button type="button" variant="outline" onClick={() => void generateDraft()} disabled={isDrafting || isSaving}>
              {isDrafting ? 'Drafting…' : 'Regenerate'}
            </Button>
          )}
          <Button type="button" onClick={() => void save()} disabled={!canSave}>
            {isSaving ? 'Saving…' : 'Save skill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
