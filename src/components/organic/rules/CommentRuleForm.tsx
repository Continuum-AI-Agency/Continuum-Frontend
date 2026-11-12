'use client';

import { useTranslations } from 'next-intl';
import { useValidationErrorMap } from '@/i18n/validation';

// The rule editor, ordered the way the thing actually happens rather than the
// way it is stored: where it listens, what fires it, what the commenter sees in
// public, what they get in private, and when it stops. Read top to bottom, it
// is the sequence the audience experiences. A two-column grid would fill the
// panel better and destroy that order, so only semantic pairs sit side by side.
//
// Decisions worth knowing before changing this file:
// - The tracked short address is shown, not just the destination. It is the only
//   one whose clicks are counted, and while it was hidden nobody could check it
//   or put it in a bio. It appears only on a saved rule, because the link is
//   minted on save.
// - No link means no button-label field. A button reading "Open the guide" that
//   goes nowhere is a mistake, never a choice; a message with no link at all is
//   a real use, so that stays allowed and unremarked.
// - The window error is read off the synthetic `activeWindow` path because it
//   belongs to the pair of dates, not to either one.
// - The editor is remounted per rule by its caller, so fields follow the
//   selection rather than keeping the first rule opened.
// - Field widths answer to a container query, not the viewport: this panel is
//   half the window, so what the window measures is not what the fields fit in.
// - Public replies are keyed by index, and the lint rule for that is suppressed.
//   They are plain strings with no reorder affordance and each input reads its
//   value from the array, so the index is the identity. Stable ids would mean
//   holding objects in the form value — which is the shape useFieldArray forced
//   here before, and it was worse.

import {
  MAX_KEYWORDS_PER_RULE,
  MAX_LINK_BUTTON_LABEL_LENGTH,
  MAX_PUBLIC_REPLY_VARIATIONS,
  MAX_REPLY_MESSAGE_LENGTH,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Plus, X } from 'lucide-react';
import React from 'react';
import { type Control, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ButtonReachNote } from './ButtonReachNote';
import { CommentRulePreview } from './CommentRulePreview';
import { PostPicker } from './PostPicker';
import { PANEL_HEADER_FRAME, PANEL_TITLE } from './panelHeader';
import { createRuleFormSchema, type RuleFormValues } from './ruleFormSchema';
import { usePublishedPosts } from './usePublishedPosts';

function KeywordField({ control }: { control: Control<RuleFormValues> }) {
  const uiText = useTranslations('organic');
  const [pending, setPending] = React.useState('');

  return (
    <FormField
      control={control}
      name="keywords"
      render={({ field }) => {
        const add = () => {
          const value = pending.trim();
          setPending('');
          const clash = field.value.some((k) => k.toLowerCase() === value.toLowerCase());
          if (value === '' || clash || field.value.length >= MAX_KEYWORDS_PER_RULE) return;
          field.onChange([...field.value, value]);
        };

        return (
          <FormItem>
            <FormLabel className="text-xs">{uiText('trigger_words_2a5b03b')}</FormLabel>
            <FormControl>
              <div className="flex flex-wrap gap-1.5 rounded-md border p-1.5">
                {field.value.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
                  >
                    {keyword}
                    <button
                      type="button"
                      aria-label={uiText('ruleRemoveKeyword', { keyword })}
                      onClick={() => field.onChange(field.value.filter((k) => k !== keyword))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={pending}
                  onChange={(event) => setPending(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault();
                      add();
                    }
                    if (event.key === 'Backspace' && pending === '' && field.value.length > 0) {
                      field.onChange(field.value.slice(0, -1));
                    }
                  }}
                  onBlur={add}
                  placeholder={field.value.length === 0 ? uiText('price_info_63d893a') : ''}
                  aria-label={uiText('add_a_trigger_word_f5ac65d')}
                  className="min-w-24 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
            </FormControl>
            <FormDescription className="text-2xs">
              {uiText('whole_words_only_capitals_and_accents_are_ign_2d5f792')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function PublicRepliesField({ control }: { control: Control<RuleFormValues> }) {
  const uiText = useTranslations('organic');
  return (
    <FormField
      control={control}
      name="publicReplyMessages"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs">{uiText('public_replies_b06f896')}</FormLabel>
          <div className="flex flex-col gap-1.5">
            {field.value.map((message, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: see the note at the top of this file
              <div key={`reply-${index}`} className="flex gap-1.5">
                <FormControl>
                  <Input
                    value={message}
                    onChange={(event) => {
                      const next = [...field.value];
                      next[index] = event.target.value;
                      field.onChange(next);
                    }}
                    placeholder={uiText('sent_you_a_dm_4798705')}
                    aria-label={uiText('publicReplyNumber', {
                      number: index + 1,
                    })}
                    className="h-8 text-xs"
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={uiText('removeReplyNumber', {
                    number: index + 1,
                  })}
                  onClick={() => field.onChange(field.value.filter((_, i) => i !== index))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {field.value.length < MAX_PUBLIC_REPLY_VARIATIONS ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 self-start text-xs"
                onClick={() => field.onChange([...field.value, ''])}
              >
                <Plus className="h-3.5 w-3.5" />
                {uiText('add_a_variation_63465df')}
              </Button>
            ) : null}
          </div>
          <FormDescription className="text-2xs">
            {uiText('rotated_between_comments_leave_empty_to_stay__d2b30e9')}
          </FormDescription>
          {field.value.length > 0 && field.value.length < 3 ? (
            <p className="text-2xs text-amber-600 dark:text-amber-400">
              {uiText('with_fewer_than_three_a_busy_post_fills_with__b76b657')}
            </p>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Shown only on a saved rule: the link is minted when the rule is saved. */
function TrackedLinkRow({ url }: { url: string }) {
  const uiText = useTranslations('organic');
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(() => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  }, [url]);

  return (
    <div className="rounded-md border bg-muted/40 px-2.5 py-2">
      <p className="text-2xs text-muted-foreground">
        {uiText('the_link_your_message_sends_490500f')}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-2xs">{url}</code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copy}
          className="h-6 shrink-0 gap-1 px-1.5 text-2xs"
          aria-label={uiText('copy_the_link_53132f0')}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? uiText('copied_8d525e5') : uiText('copy_e21f935')}
        </Button>
      </div>
    </div>
  );
}

export function CommentRuleForm({
  defaultValues,
  isEditing,
  onSubmit,
  onCancel,
  onDelete,
  isSaving,
  trackedLinkUrl = null,
  brandId = null,
  instagramAccountId = null,
}: {
  defaultValues: RuleFormValues;
  isEditing: boolean;
  onSubmit: (values: RuleFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  /** The shortened address this rule hands out. Null until the rule has been saved once. */
  trackedLinkUrl?: string | null;
  brandId?: string | null;
  /** Which connected account's posts the picker offers. */
  instagramAccountId?: string | null;
}) {
  const uiText = useTranslations('organic');
  const validationErrorMap = useValidationErrorMap();
  const validationSchema = React.useMemo(() => createRuleFormSchema(uiText), [uiText]);
  const form = useForm<RuleFormValues>({
    resolver: zodResolver(validationSchema, { error: validationErrorMap }),
    defaultValues,
    mode: 'onChange',
  });

  React.useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const previewValues = form.watch();
  const postScope = previewValues.postScope;
  const publishedPosts = usePublishedPosts({
    brandId,
    accountId: instagramAccountId,
    enabled: postScope === 'specific_posts',
  });
  const hasLink = previewValues.destinationUrl.trim() !== '';
  const hasWindowError = 'activeWindow' in form.formState.errors;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex h-full min-h-0 flex-col"
        aria-label={isEditing ? uiText('edit_rule_29d23cb') : uiText('new_rule_99cd24e')}
      >
        <div className={`flex items-center justify-between gap-2 ${PANEL_HEADER_FRAME}`}>
          <h2 className={PANEL_TITLE}>
            {isEditing ? uiText('edit_rule_29d23cb') : uiText('new_rule_99cd24e')}
          </h2>
          <FormField
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormLabel className="text-xs text-muted-foreground">
                  {field.value ? uiText('on_1300117') : uiText('off_ca7981b')}
                </FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="@container/rule-form min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid items-start gap-4 @2xl/rule-form:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="postScope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{uiText('which_posts_81e9607')}</FormLabel>
                    <FormControl>
                      <div className="flex gap-1.5">
                        {(['all_posts', 'specific_posts'] as const).map((scope) => (
                          <Button
                            key={scope}
                            type="button"
                            size="sm"
                            variant={field.value === scope ? 'default' : 'outline'}
                            onClick={() => field.onChange(scope)}
                            className="text-xs"
                          >
                            {scope === 'all_posts'
                              ? uiText('all_posts_3a2e5c2')
                              : uiText('specific_posts_7988e18')}
                          </Button>
                        ))}
                      </div>
                    </FormControl>
                    <FormDescription className="text-2xs">
                      {field.value === 'all_posts'
                        ? uiText('every_post_on_the_account_including_ones_publ_cd53a1a')
                        : uiText('only_the_posts_you_name_be6a9a1')}
                    </FormDescription>
                  </FormItem>
                )}
              />

              {postScope === 'specific_posts' ? (
                <FormField
                  control={form.control}
                  name="platformPostIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{uiText('posts_a80811c')}</FormLabel>
                      <FormControl>
                        <PostPicker
                          posts={publishedPosts.posts}
                          selectedIds={field.value}
                          isLoading={publishedPosts.isLoading}
                          error={publishedPosts.isError}
                          hasAccount={publishedPosts.hasAccount}
                          isRefreshing={publishedPosts.isRefreshing}
                          onRefresh={publishedPosts.refresh}
                          hasMore={publishedPosts.hasMore}
                          isLoadingMore={publishedPosts.isLoadingMore}
                          onLoadMore={publishedPosts.loadMore}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <KeywordField control={form.control} />
              <PublicRepliesField control={form.control} />

              <FormField
                control={form.control}
                name="replyMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{uiText('direct_message_cd3e160')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={uiText('hey_here_s_the_guide_aa14ccc')}
                        className="text-xs"
                      />
                    </FormControl>
                    <FormDescription className="text-2xs">
                      {field.value.length}/{MAX_REPLY_MESSAGE_LENGTH}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className={cn('grid gap-3', hasLink && '@md/rule-form:grid-cols-[2fr_1fr]')}>
                <FormField
                  control={form.control}
                  name="destinationUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{uiText('link_a6a32db')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="url"
                          placeholder="https://yoursite.com/guide"
                          className="h-8 text-xs"
                        />
                      </FormControl>
                      <FormDescription className="text-2xs">
                        {uiText('shortened_automatically_so_its_clicks_can_be__74c9a09')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {hasLink ? (
                  <FormField
                    control={form.control}
                    name="linkButtonLabel"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-1.5">
                          <FormLabel className="text-xs">{uiText('button_text_ec208ea')}</FormLabel>
                          <ButtonReachNote />
                        </div>
                        <FormControl>
                          <Input
                            {...field}
                            maxLength={MAX_LINK_BUTTON_LABEL_LENGTH}
                            placeholder={uiText('open_the_guide_5628ad3')}
                            className="h-8 text-xs"
                          />
                        </FormControl>
                        <FormDescription className="text-2xs">
                          {field.value.trim() === ''
                            ? uiText('ruleLinkInMessage')
                            : uiText('ruleLinkButtonHint', {
                                limit: MAX_LINK_BUTTON_LABEL_LENGTH,
                              })}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>

              {trackedLinkUrl !== null && hasLink ? <TrackedLinkRow url={trackedLinkUrl} /> : null}

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="activeFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{uiText('starts_96dbede')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="datetime-local"
                          aria-invalid={hasWindowError}
                          className="h-8 text-xs"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="activeUntil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{uiText('ends_e98982c')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="datetime-local"
                          aria-invalid={hasWindowError}
                          className="h-8 text-xs"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-2xs text-muted-foreground">
                {uiText('leave_both_empty_to_run_until_you_switch_it_o_98af6b9')}
              </p>
              {hasWindowError ? (
                <p className="text-2xs text-destructive" role="alert">
                  {uiText('the_end_date_is_before_the_start_date_d384bff')}
                </p>
              ) : null}
            </div>

            <div className="@2xl/rule-form:sticky @2xl/rule-form:top-0">
              <CommentRulePreview values={previewValues} trackedLinkUrl={trackedLinkUrl} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-xs text-destructive hover:text-destructive"
            >
              {uiText('delete_e2d0a54')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-xs"
            >
              {uiText('cancel_19766ed')}
            </Button>
            <Button type="submit" size="sm" disabled={isSaving} className="text-xs">
              {isSaving ? uiText('saving_23e3929') : uiText('save_rule_4e62c22')}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
