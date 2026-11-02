// Browser client for the Easy Fit "Altas" module on the Backend (`/easyfit/*`). Every answer
// is parsed against its `@continuum/contracts` schema, so a shape drift fails here, at the
// boundary, instead of as an undefined deep inside a chart.

import {
  type EasyfitConfigResponse,
  type EasyfitDashboardResponse,
  type EasyfitPilotConfig,
  easyfitConfigRequestSchema,
  easyfitConfigResponseSchema,
  easyfitDashboardResponseSchema,
} from '@continuum/contracts';
import { ApiError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';

export const EASYFIT_DASHBOARD_PATH = '/easyfit/dashboard';
export const EASYFIT_CONFIG_PATH = '/easyfit/config';

export function getEasyfitDashboard(signal?: AbortSignal): Promise<EasyfitDashboardResponse> {
  return http.request({
    path: EASYFIT_DASHBOARD_PATH,
    schema: easyfitDashboardResponseSchema,
    signal,
  });
}

export function getEasyfitConfig(signal?: AbortSignal): Promise<EasyfitConfigResponse> {
  return http.request({
    path: EASYFIT_CONFIG_PATH,
    schema: easyfitConfigResponseSchema,
    signal,
  });
}

export function putEasyfitConfig(config: EasyfitPilotConfig): Promise<EasyfitConfigResponse> {
  return http.request({
    path: EASYFIT_CONFIG_PATH,
    method: 'PUT',
    body: easyfitConfigRequestSchema.parse(config),
    schema: easyfitConfigResponseSchema,
  });
}

/** The Backend refused the caller (not staff, not a brand admin). */
export function isEasyfitForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
