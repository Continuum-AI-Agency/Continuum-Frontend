'use client';

import { useTranslations } from 'next-intl';

// How a judge picks the best of several attempts, as a tournament: two at a time, the one it
// prefers moves on and the other fades. Once the final is decided the champion's way through
// lights up, and any match opens both sides with their scores and the judge's reason.

import { Check, Scale, Trophy } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { type BracketEntrant, type BracketMatch, bracketRounds, championPath } from './model';
import { initials } from './parts';

const MATCH_REM = 4.25;

function roundName(round: number, total: number): string {
  return ['Final', 'Semifinal', 'Quarterfinal'][total - 1 - round] ?? `Round ${round + 1}`;
}

/** The match being judged, else the last one decided. */
function liveMatch(rounds: BracketMatch[][]): { key?: string; judging: boolean } {
  let last: string | undefined;
  for (const [r, matches] of rounds.entries()) {
    for (const [i, m] of matches.entries()) {
      if (!m.winner && m.b) return { key: `${r}:${i}`, judging: true };
      if (m.winner) last = `${r}:${i}`;
    }
  }
  return { key: last, judging: false };
}

function EntrantAvatar({ entrant, won }: { entrant?: BracketEntrant; won?: boolean }) {
  return (
    <Avatar className="size-5 rounded-md">
      <AvatarFallback
        className={cn(
          'rounded-md text-3xs font-semibold',
          won ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {initials(entrant?.label ?? '?')}
      </AvatarFallback>
    </Avatar>
  );
}

export function JudgeBracket({
  entrants,
  rounds,
  className,
}: {
  entrants: BracketEntrant[];
  /** Matches per round, first round first; rounds not yet drawn are left out. */
  rounds: BracketMatch[][];
  className?: string;
}) {
  const uiText = useTranslations('common');
  const counts = bracketRounds(entrants.length);
  const byId = new Map(entrants.map((e) => [e.id, e]));
  const { champion, keys } = championPath(rounds, counts.length);
  const live = liveMatch(rounds);
  const [chosen, setChosen] = useState<string>();
  const openKey = chosen ?? live.key;
  const [openRound, openIndex] = (openKey ?? '').split(':').map(Number);
  const open = openKey ? rounds[openRound]?.[openIndex] : undefined;
  const [liveRound] = (live.key ?? '0').split(':').map(Number);
  const name = (id?: string) => (id ? (byId.get(id)?.label ?? id) : 'a bye');

  if (counts.length === 0) return null;

  return (
    <AgentArtifactCard className={cn('mt-0', className)}>
      <AgentCardHeader
        action={
          champion ? (
            <StatusLabel tone="done">
              {uiText('m_3e2f7cc0f0')}
              {name(champion)}
            </StatusLabel>
          ) : live.judging ? (
            <StatusLabel tone="running">
              {uiText('m_bd498ec1aa')}
              {roundName(liveRound, counts.length).toLowerCase()}
            </StatusLabel>
          ) : (
            <StatusLabel>{uiText('waiting_6e293a8')}</StatusLabel>
          )
        }
      >
        <AgentCardEyebrow label={uiText('m_e16d3d8fa3')} />
        <AgentCardTitle>
          {uiText('m_1cf2d9cb12')}
          {entrants.length}
        </AgentCardTitle>
      </AgentCardHeader>
      <AgentCardBody className="flex flex-col gap-2 pt-3 pb-4">
        <div className="flex min-w-0 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          {counts.map((_, r) => (
            <Fragment key={r}>
              {r > 0 && <span className="w-5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{roundName(r, counts.length)}</span>
            </Fragment>
          ))}
        </div>
        <div className="flex min-w-0" style={{ height: `${counts[0] * MATCH_REM}rem` }}>
          {counts.map((count, r) => (
            <Fragment key={r}>
              {r > 0 && (
                <div aria-hidden="true" className="flex w-5 shrink-0 flex-col justify-around">
                  {Array.from({ length: count }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'relative w-1/2 rounded-r-md border-y border-r transition-colors after:absolute after:top-1/2 after:left-full after:h-px after:w-full',
                        keys.has(`${r}:${i}`)
                          ? 'border-primary after:bg-primary'
                          : 'border-border after:bg-border',
                      )}
                      style={{ height: `${100 / counts[r - 1]}%` }}
                    />
                  ))}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-around">
                {Array.from({ length: count }, (_, i) => {
                  const key = `${r}:${i}`;
                  const match = rounds[r]?.[i];
                  if (!match) {
                    return (
                      <div
                        key={key}
                        className="grid h-[3.25rem] place-items-center rounded-md border border-dashed border-border text-3xs text-muted-foreground"
                      >
                        {r === counts.length - 1
                          ? uiText('m_4e3adcfe37')
                          : uiText('waiting_6e293a8')}
                      </div>
                    );
                  }
                  const judging = !match.winner && Boolean(match.b);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChosen(key)}
                      aria-pressed={key === openKey}
                      data-on-path={keys.has(key) || undefined}
                      aria-label={uiText('m_3f011bf7f6', {
                        v0: String(roundName(r, counts.length)),
                        v1: String(name(match.a)),
                        v2: String(name(match.b)),
                      })}
                      className={cn(
                        'relative flex h-[3.25rem] min-w-0 flex-col justify-center rounded-md border bg-card text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring',
                        keys.has(key)
                          ? 'border-primary/70'
                          : 'border-border hover:border-foreground/25',
                        judging && 'border-primary/50 ring-2 ring-primary/15',
                        key === openKey && !judging && 'ring-2 ring-ring/40',
                      )}
                    >
                      {judging && (
                        <span className="absolute -top-2 -right-2 grid size-4 place-items-center rounded-full border border-border bg-card">
                          <Spinner className="size-2.5 text-primary" />
                        </span>
                      )}
                      {[match.a, match.b].map((id, side) => {
                        const won = Boolean(id) && match.winner === id;
                        const lost = Boolean(id && match.winner) && !won;
                        return (
                          <span
                            key={id ?? `bye-${side}`}
                            className={cn(
                              'flex h-[1.625rem] min-w-0 items-center gap-1.5 px-1.5 text-xs transition-opacity',
                              side === 1 && 'border-t border-border/60',
                              won && 'font-medium',
                              lost && 'opacity-45',
                              !id && 'text-muted-foreground italic',
                            )}
                          >
                            {id ? (
                              <EntrantAvatar entrant={byId.get(id)} won={won} />
                            ) : (
                              <span className="size-5" />
                            )}
                            <span className="truncate">
                              {id ? name(id) : uiText('m_78c9a53e2f')}
                            </span>
                            <span className="ml-auto flex shrink-0 items-center gap-1">
                              {id && match.scores?.[id] !== undefined && (
                                <span className="font-mono text-2xs text-muted-foreground tabular-nums">
                                  {match.scores[id]}
                                </span>
                              )}
                              {won &&
                                (id === champion && r === counts.length - 1 ? (
                                  <Trophy className="size-3 text-primary" />
                                ) : (
                                  <Check className="size-3 text-primary" />
                                ))}
                            </span>
                          </span>
                        );
                      })}
                    </button>
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
      </AgentCardBody>
      {open && (
        <section
          aria-label={uiText('m_f33e8d0dc8')}
          className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-3"
        >
          <div className="grid grid-cols-2 gap-4">
            {[open.a, open.b].map((id, side) => {
              const entrant = id ? byId.get(id) : undefined;
              const score = id ? open.scores?.[id] : undefined;
              const scale = Math.max(10, ...Object.values(open.scores ?? {}));
              const won = Boolean(id) && open.winner === id;
              return (
                <div
                  key={id ?? `bye-${side}`}
                  className={cn(
                    'flex min-w-0 flex-col gap-1.5 text-xs',
                    open.winner && !won && 'opacity-60',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <EntrantAvatar entrant={entrant} won={won} />
                    <span className="truncate font-medium">
                      {entrant?.label ?? id ?? uiText('m_78c9a53e2f')}
                    </span>
                    {won && (
                      <Badge variant="violet" className="px-1.5 text-3xs">
                        <Trophy />
                        {uiText('m_4e3adcfe37')}
                      </Badge>
                    )}
                    {score !== undefined && (
                      <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                        {score}
                      </span>
                    )}
                  </div>
                  {score !== undefined && (
                    <Progress value={(score / scale) * 100} className="h-1" />
                  )}
                  {entrant?.detail && (
                    <p className="truncate text-2xs text-muted-foreground">{entrant.detail}</p>
                  )}
                  {entrant?.summary && (
                    <p className="line-clamp-3 text-muted-foreground">{entrant.summary}</p>
                  )}
                </div>
              );
            })}
          </div>
          <blockquote className="flex gap-2 border-l-2 border-primary/40 pl-3 text-xs">
            <Scale className="mt-0.5 size-3.5 shrink-0 text-primary" />
            {open.winner ? (
              <span>{open.reason}</span>
            ) : (
              <span className="animate-pulse text-muted-foreground motion-reduce:animate-none">
                {uiText('m_6a6851f502')}
              </span>
            )}
          </blockquote>
        </section>
      )}
    </AgentArtifactCard>
  );
}
