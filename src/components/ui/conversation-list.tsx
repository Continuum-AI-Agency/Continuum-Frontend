// TUFFUI (https://tuffui.com) · MIT License · Copyright (c) 2026 TUFFUI contributors
// Free to use. If it helps you, you can support it: https://ko-fi.com/yurigokoryan
'use client';

import {
  Archive,
  ArrowUUpLeft,
  ChatsCircle,
  DotsThree,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  PushPin,
  PushPinSlash,
  Trash,
} from '@phosphor-icons/react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconButton } from '@/components/ui/action-button';
import { Menu, type MenuGroup, type MenuItem } from '@/components/ui/action-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loader';
import { Panel, Shell, ShellHeader } from '@/components/ui/surface';
import { SearchField } from '@/components/ui/text-field';
import { enter, exit } from '@/lib/motion-tokens';
import { cn } from '@/lib/utils';

export type Conversation = {
  id: string;
  title: string;
  /** ISO timestamp of the last message; drives the date groups. */
  updatedAt: string;
  pinned?: boolean;
  /** The agent is still working in this chat. */
  running?: boolean;
  /** A muted line under the title, e.g. who started the chat and its tags. */
  meta?: React.ReactNode;
  /** Extra row controls shown beside the actions menu, e.g. a tag editor. */
  actions?: React.ReactNode;
};

export type ConversationListProps = {
  data: Conversation[];
  activeId?: string;
  onSelect?: (conversation: Conversation) => void;
  onNew?: () => void;
  onRename?: (conversation: Conversation, title: string) => void;
  onPin?: (conversation: Conversation, pinned: boolean) => void;
  /** Called once the undo window closes. */
  onArchive?: (conversation: Conversation) => void;
  onDelete?: (conversation: Conversation) => void;
  /** `0` commits archive/delete at once, with no undo bar. */
  undoMs?: number;
  /**
   * `compact` lists titles only, without search or group labels. `embedded` keeps the
   * date groups but drops the header and search, for a host that renders its own.
   */
  variant?: 'sidebar' | 'compact' | 'embedded';
  /** Reference time for the date groups (ISO). Defaults to now. */
  now?: string;
  /** Extra control in the header next to New chat, e.g. a hide-sidebar toggle. */
  headerAction?: React.ReactNode;
  className?: string;
};

type Removal = { conversation: Conversation; action: 'archive' | 'delete' };

const DAY = 86_400_000;

function groupOf(c: Conversation, now: Date) {
  if (c.pinned) return 'Pinned';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const t = new Date(c.updatedAt).getTime();
  if (t >= start.getTime()) return 'Today';
  if (t >= start.getTime() - DAY) return 'Yesterday';
  if (t >= start.getTime() - 7 * DAY) return 'Previous 7 days';
  return 'Older';
}
const ORDER = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older', 'Recent'];

// Day groups depend on the viewer's time zone, which prerendered HTML can't know.
// Until hydration finishes everything unpinned sits under "Recent", so server and
// first client render match; the real groups appear right after.
const noop = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

export function ConversationList({
  data,
  activeId,
  onSelect,
  onNew,
  onRename,
  onPin,
  onArchive,
  onDelete,
  undoMs = 5000,
  variant = 'sidebar',
  headerAction,
  now,
  className,
}: ConversationListProps) {
  const compact = variant === 'compact';
  const embedded = variant === 'embedded';
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Removal | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Commit a removal once its undo window closes.
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => {
      (removed.action === 'archive' ? onArchive : onDelete)?.(removed.conversation);
      setRemoved(null);
    }, undoMs);
    return () => clearTimeout(timer);
  }, [removed, undoMs, onArchive, onDelete]);

  const remove = (conversation: Conversation, action: Removal['action']) => {
    setMenu(null);
    if (!undoMs) {
      (action === 'archive' ? onArchive : onDelete)?.(conversation);
      return;
    }
    // A pending removal commits right away when another one starts.
    if (removed) (removed.action === 'archive' ? onArchive : onDelete)?.(removed.conversation);
    setRemoved({ conversation, action });
  };

  const hydrated = useHydrated();
  const ref = now ? new Date(now) : new Date();
  const visible = data
    .filter((c) => c.id !== removed?.conversation.id)
    .filter((c) => !query || c.title.toLowerCase().includes(query.toLowerCase()));
  const groups = compact
    ? [{ name: '', items: visible }]
    : ORDER.map((name) => ({
        name,
        items: visible.filter((c) => (hydrated || c.pinned ? groupOf(c, ref) : 'Recent') === name),
      })).filter((g) => g.items.length);

  // Arrow keys move between rows; Enter opens the focused one (native button).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? rows.length - 1
          : i + (e.key === 'ArrowDown' ? 1 : -1);
    if (rows[next]) {
      e.preventDefault();
      rows[next].focus();
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <Shell className={cn('w-full', compact ? 'max-w-60' : 'max-w-72', className)}>
        {!embedded && (
          <ShellHeader
            icon={ChatsCircle}
            title="Chats"
            aside={
              (onNew || headerAction) && (
                <span className="flex items-center gap-1">
                  {headerAction}
                  {onNew && (
                    <IconButton
                      icon={NotePencil}
                      label="New chat"
                      variant="secondary"
                      onClick={onNew}
                    />
                  )}
                </span>
              )
            }
          />
        )}
        {!compact && !embedded && (
          <div className="px-1.5 pb-2.5">
            <SearchField
              placeholder="Search chats"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
            />
          </div>
        )}
        <Panel ref={list} onKeyDown={onKeyDown} className="flex flex-col gap-3 p-1.5">
          {groups.length === 0 && (
            <EmptyState
              compact
              icon={query ? MagnifyingGlass : ChatsCircle}
              title={query ? 'No chats found' : 'No chats yet'}
              description={query ? 'Try a different search.' : undefined}
            />
          )}
          {groups.map((group) => (
            <section key={group.name || 'all'} aria-label={group.name || 'Chats'}>
              {group.name && (
                <h4 className="px-2.5 pt-1 pb-1 text-xs font-medium text-muted-foreground">
                  {group.name}
                </h4>
              )}
              <ul className="flex flex-col gap-px">
                <AnimatePresence initial={false}>
                  {group.items.map((c) => (
                    <motion.li
                      key={c.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', transition: enter }}
                      exit={{ opacity: 0, height: 0, transition: exit }}
                      className="group relative"
                    >
                      {renaming === c.id ? (
                        <RenameField
                          initial={c.title}
                          onDone={(title) => {
                            setRenaming(null);
                            if (title && title !== c.title) onRename?.(c, title);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          data-row
                          aria-current={c.id === activeId ? 'page' : undefined}
                          onClick={() => onSelect?.(c)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl pl-2.5 text-left text-[0.8125rem] transition-[background-color,scale] duration-150 ease-out active:scale-[0.99]',
                            c.meta ? 'min-h-9 py-1.5' : 'h-9',
                            c.actions ? 'pr-16' : 'pr-9',
                            c.id === activeId
                              ? 'bg-surface-raised font-medium'
                              : 'text-foreground/80 hover:bg-foreground/[0.04]',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{c.title}</span>
                            {c.meta && (
                              <span className="block truncate text-xs font-normal text-muted-foreground">
                                {c.meta}
                              </span>
                            )}
                          </span>
                          {c.running && (
                            <Spinner size="sm" label="Agent working" className="text-brand" />
                          )}
                        </button>
                      )}
                      {renaming !== c.id && (
                        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
                          {c.actions}
                          <RowMenu
                            conversation={c}
                            open={menu === c.id}
                            onOpenChange={(open) => setMenu(open ? c.id : null)}
                            onPin={onPin && (() => (onPin(c, !c.pinned), setMenu(null)))}
                            onRename={onRename && (() => (setRenaming(c.id), setMenu(null)))}
                            onArchive={onArchive && (() => remove(c, 'archive'))}
                            onDelete={onDelete && (() => remove(c, 'delete'))}
                          />
                        </div>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </Panel>
        <AnimatePresence>
          {removed && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: enter }}
              exit={{ opacity: 0, transition: exit }}
              className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 text-[0.8125rem]"
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {removed.action === 'archive' ? 'Archived' : 'Deleted'} “
                {removed.conversation.title}”
              </span>
              <button
                type="button"
                onClick={() => setRemoved(null)}
                className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-surface-raised px-2.5 font-medium transition-[background-color,scale] duration-150 ease-out active:scale-[0.97]"
              >
                <ArrowUUpLeft weight="bold" className="size-3.5" aria-hidden="true" />
                Undo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <p role="status" aria-live="polite" className="sr-only">
          {removed
            ? `${removed.action === 'archive' ? 'Archived' : 'Deleted'} ${removed.conversation.title}. Undo available.`
            : ''}
        </p>
      </Shell>
    </MotionConfig>
  );
}

function RenameField({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  // Focus once the field replaces its row (onFocus then selects the title).
  useEffect(() => input.current?.focus(), []);
  return (
    <input
      ref={input}
      aria-label="Chat title"
      value={value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value.trim());
        if (e.key === 'Escape') onDone(null);
      }}
      className="h-9 w-full rounded-xl bg-foreground/[0.06] px-2.5 text-[0.8125rem] outline-none"
    />
  );
}

function RowMenu({
  conversation,
  open,
  onOpenChange,
  onPin,
  onRename,
  onArchive,
  onDelete,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPin?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  const main: MenuItem[] = [
    onPin && {
      id: 'pin',
      label: conversation.pinned ? 'Unpin' : 'Pin',
      icon: conversation.pinned ? PushPinSlash : PushPin,
      onSelect: onPin,
    },
    onRename && { id: 'rename', label: 'Rename', icon: PencilSimple, onSelect: onRename },
    onArchive && { id: 'archive', label: 'Archive', icon: Archive, onSelect: onArchive },
  ].filter((item): item is Exclude<typeof item, undefined> => !!item);
  const groups: MenuGroup[] = [
    { id: 'main', items: main },
    ...(onDelete
      ? [
          {
            id: 'danger',
            items: [
              {
                id: 'delete',
                label: 'Delete',
                icon: Trash,
                destructive: true,
                onSelect: onDelete,
              },
            ],
          },
        ]
      : []),
  ].filter((group) => group.items.length);

  if (!groups.length) return null;
  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      groups={groups}
      trigger={
        <IconButton
          icon={DotsThree}
          iconWeight="bold"
          label={`Actions for ${conversation.title}`}
          className={cn(
            'size-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
            open && 'opacity-100',
          )}
        />
      }
    />
  );
}
