'use client';

// The rules tab: the list on the left, the rule being edited on the right.
//
// Two panes rather than a dialog because the list answers "what is my account
// sending right now", and that question stays worth seeing while you edit one
// of the answers.

import type { CommentTriggerRule } from '@continuum/contracts';
import React from 'react';
import { CommentRuleForm } from './CommentRuleForm';
import { getApiBaseUrl } from '@/lib/api/config';
import { CommentRulesList } from './CommentRulesList';
import { type RuleFormValues, emptyRuleForm, formToRule, ruleToForm } from './ruleFormSchema';
import {
  useCommentRules,
  useDeleteCommentRule,
  useDisableAllCommentRules,
  useSaveCommentRule,
} from './useCommentRules';

/** Which rule the editor is showing: none, a new one, or an existing one. */
type Editing = { kind: 'none' } | { kind: 'new' } | { kind: 'existing'; rule: CommentTriggerRule };

export function CommentRulesWorkspace({ brandId }: { brandId: string | null }) {
  const { data, isLoading, error } = useCommentRules(brandId);
  const save = useSaveCommentRule(brandId);
  const remove = useDeleteCommentRule(brandId);
  const disableAll = useDisableAllCommentRules(brandId);

  const [editing, setEditing] = React.useState<Editing>({ kind: 'none' });
  const rules = data?.rules ?? [];
  const linkStats = data?.linkStats ?? [];

  // The address the rule being edited actually hands out. Assembled here rather
  // than sent by the server: the code is what identifies the link, and the host
  // it is served from is a property of the environment the browser is in.
  const editedLinkUrl = React.useMemo(() => {
    if (editing.kind !== 'existing') return null;
    const linkId = editing.rule.trackedLinkId;
    if (linkId === null) return null;
    const code = linkStats.find((entry) => entry.linkId === linkId)?.code;
    return code === undefined ? null : `${getApiBaseUrl()}/r/${code}`;
  }, [editing, linkStats]);

  // A new object every render would reset the form on every keystroke, so the
  // defaults are memoised on what actually identifies the edit.
  const defaultValues = React.useMemo<RuleFormValues | null>(() => {
    if (editing.kind === 'new') return emptyRuleForm();
    if (editing.kind === 'existing') return ruleToForm(editing.rule);
    return null;
  }, [editing]);

  const handleSubmit = React.useCallback(
    (values: RuleFormValues) => {
      if (brandId === null || editing.kind === 'none') return;
      const existing = editing.kind === 'existing' ? editing.rule : undefined;
      save.mutate(formToRule(values, { brandId, existing }), {
        onSuccess: () => setEditing({ kind: 'none' }),
      });
    },
    [brandId, editing, save],
  );

  const handleDelete = React.useCallback(() => {
    if (editing.kind !== 'existing') return;
    remove.mutate(editing.rule.id, { onSuccess: () => setEditing({ kind: 'none' }) });
  }, [editing, remove]);

  if (brandId === null) {
    return (
      <p className="px-4 py-8 text-center text-xs text-muted-foreground">
        Pick a brand to manage its comment rules.
      </p>
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-h-0 flex-col gap-2">
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Could not load the rules. Refresh to try again.
          </p>
        ) : null}
        <CommentRulesList
          rules={rules}
          linkStats={linkStats}
          isLoading={isLoading}
          onCreate={() => setEditing({ kind: 'new' })}
          onEdit={(rule) => setEditing({ kind: 'existing', rule })}
          onDisableAll={() => disableAll.mutate()}
          isDisablingAll={disableAll.isPending}
        />
      </div>

      <div className="min-h-0 rounded-md border lg:h-full">
        {defaultValues ? (
          <CommentRuleForm
            // Remounting per rule keeps the form's own state from leaking
            // between two rules opened one after the other.
            key={editing.kind === 'existing' ? editing.rule.id : 'new'}
            defaultValues={defaultValues}
            isEditing={editing.kind === 'existing'}
            onSubmit={handleSubmit}
            onCancel={() => setEditing({ kind: 'none' })}
            onDelete={editing.kind === 'existing' ? handleDelete : undefined}
            isSaving={save.isPending || remove.isPending}
            trackedLinkUrl={editedLinkUrl}
          />
        ) : (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            Pick a rule to edit it, or create a new one.
          </p>
        )}
      </div>
    </div>
  );
}
