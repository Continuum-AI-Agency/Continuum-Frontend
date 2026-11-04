'use client';

// The team's goal targets, through the Backend: GET once when the tile mounts, PUT to set one,
// DELETE to remove one. The list changes only when the Backend said a write landed, so a failed
// write can never look saved.
//
// The route may not be deployed yet. A 404, an envelope saying `not_deployed`, or a Backend that
// could not be reached means targets are not here yet: nothing is wrong with the tile, its figure
// is real, and asking again would not help. So none of them is an error, or retried, or logged.

import {
  HOME_READ_PATHS,
  type HomeGoalTarget,
  type HomeGoalTargetsRead,
  type HomeGoalTargetUpsertRequest,
  type HomeGoalTargetUpsertResponse,
  homeGoalTargetDeleteResponseSchema,
  homeGoalTargetsReadSchema,
  homeGoalTargetUpsertResponseSchema,
} from '@continuum/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { request } from '@/lib/api/http';
import { homeReadNotHereYet } from '../../homeRead';
import type { GoalTargetsLoad } from './goalTargetModel';

export type GoalTargetWriteResult = { ok: true } | { ok: false; message: string };

export type GoalTargetsApi = {
  load: GoalTargetsLoad;
  save: (target: HomeGoalTargetUpsertRequest) => Promise<GoalTargetWriteResult>;
  remove: (key: { scope: string; objectiveId: string }) => Promise<GoalTargetWriteResult>;
};

function loadOfRead(read: HomeGoalTargetsRead): GoalTargetsLoad {
  if (read.state === 'ready') return { status: 'ready', targets: read.data.targets };
  // Any other reason from a live route means it holds no target to show.
  return read.missing.reason === 'not_deployed'
    ? { status: 'unavailable' }
    : { status: 'ready', targets: [] };
}

function loadOfFailure(error: unknown): GoalTargetsLoad {
  return { status: homeReadNotHereYet(error) ? 'unavailable' : 'unreadable' };
}

/** The Backend's own words for a refused write: a refused field's message when it names one. */
function wordsOf(error: unknown): string {
  if (error instanceof ApiError) {
    const { details } = error.payload ?? {};
    const [first] = Array.isArray(details) ? (details as { message?: unknown }[]) : [];
    return typeof first?.message === 'string' ? first.message : error.message;
  }
  if (error instanceof ZodError) return 'The Backend answered in a shape this page cannot read.';
  return error instanceof Error ? error.message : 'The Backend did not answer.';
}

const sameTarget =
  (key: { scope: string; objectiveId: string }) =>
  (target: HomeGoalTarget): boolean =>
    target.scope === key.scope && target.objectiveId === key.objectiveId;

export function useGoalTargets(brandId: string, enabled: boolean): GoalTargetsApi {
  const [load, setLoad] = useState<GoalTargetsLoad>({ status: enabled ? 'loading' : 'idle' });

  useEffect(() => {
    if (!enabled) {
      setLoad({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setLoad({ status: 'loading' });
    request<HomeGoalTargetsRead>({
      path: `${HOME_READ_PATHS.goalTargets}?${new URLSearchParams({ brandId })}`,
      schema: homeGoalTargetsReadSchema,
    })
      .then((read) => {
        if (!cancelled) setLoad(loadOfRead(read));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad(loadOfFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, enabled]);

  const save = useCallback(async (target: HomeGoalTargetUpsertRequest) => {
    try {
      const { target: stored } = await request<HomeGoalTargetUpsertResponse>({
        path: HOME_READ_PATHS.goalTargets,
        method: 'PUT',
        body: target,
        schema: homeGoalTargetUpsertResponseSchema,
      });
      setLoad((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              targets: [...current.targets.filter((item) => !sameTarget(stored)(item)), stored],
            }
          : current,
      );
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, message: `Not saved. ${wordsOf(error)}` };
    }
  }, []);

  const remove = useCallback(
    async (key: { scope: string; objectiveId: string }) => {
      try {
        await request({
          path: HOME_READ_PATHS.goalTargets,
          method: 'DELETE',
          body: { brandId, ...key },
          schema: homeGoalTargetDeleteResponseSchema,
        });
        setLoad((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                targets: current.targets.filter((item) => !sameTarget(key)(item)),
              }
            : current,
        );
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, message: `Not removed. ${wordsOf(error)}` };
      }
    },
    [brandId],
  );

  return { load, save, remove };
}
