import {
  PRESENTATION_ROUTE,
  type PresentationCommand,
  type PresentationEnvelope,
  presentationApplyProposalsRequestSchema,
  presentationApplyRequestSchema,
  presentationCreateRequestSchema,
  presentationEnvelopeSchema,
  presentationExportConfirmRequestSchema,
  presentationExportConfirmResponseSchema,
  presentationExportPreviewRequestSchema,
  presentationExportPreviewResponseSchema,
  presentationHistoryRequestSchema,
  presentationProposalsResponseSchema,
  presentationProposeRequestSchema,
  presentationSaveVariantRequestSchema,
  presentationSaveVariantResponseSchema,
  presentationTemplateRoute,
} from '@continuum/contracts';
import type { z } from 'zod';
import { http } from './http';

export type PresentationScope = { brandId: string; assetId: string; baseVersionId: string };
const bodyScope = ({ brandId, baseVersionId }: PresentationScope) => ({ brandId, baseVersionId });

export const presentationsApi = {
  create(brandId: string, title: string, retryId: string) {
    return http.request<z.infer<typeof presentationSaveVariantResponseSchema>>({
      path: PRESENTATION_ROUTE,
      method: 'POST',
      body: presentationCreateRequestSchema.parse({ brandId, title, retryId }),
      schema: presentationSaveVariantResponseSchema,
    });
  },
  load(scope: PresentationScope, signal?: AbortSignal) {
    const query = new URLSearchParams(bodyScope(scope));
    return http.request<PresentationEnvelope>({
      path: `${presentationTemplateRoute(scope.assetId)}?${query}`,
      schema: presentationEnvelopeSchema,
      cache: 'no-store',
      signal,
    });
  },
  apply(
    scope: PresentationScope,
    expectedRevision: number,
    commands: PresentationCommand[],
    retryId: string,
  ) {
    return http.request<PresentationEnvelope>({
      path: presentationTemplateRoute(scope.assetId),
      method: 'PUT',
      body: presentationApplyRequestSchema.parse({
        ...bodyScope(scope),
        expectedRevision,
        commands,
        retryId,
      }),
      schema: presentationEnvelopeSchema,
    });
  },
  propose(scope: PresentationScope, expectedRevision: number, prompt: string, slideIds?: string[]) {
    return http.request<z.infer<typeof presentationProposalsResponseSchema>>({
      path: `${presentationTemplateRoute(scope.assetId)}/proposals`,
      method: 'POST',
      body: presentationProposeRequestSchema.parse({
        ...bodyScope(scope),
        expectedRevision,
        prompt,
        slideIds,
      }),
      schema: presentationProposalsResponseSchema,
    });
  },
  applyProposals(
    scope: PresentationScope,
    expectedRevision: number,
    proposalIds: string[],
    retryId: string,
  ) {
    return http.request<PresentationEnvelope>({
      path: `${presentationTemplateRoute(scope.assetId)}/proposals/apply`,
      method: 'POST',
      body: presentationApplyProposalsRequestSchema.parse({
        ...bodyScope(scope),
        expectedRevision,
        proposalIds,
        retryId,
      }),
      schema: presentationEnvelopeSchema,
    });
  },
  saveVariant(
    scope: PresentationScope,
    expectedRevision: number,
    name: string,
    proposalId: string | undefined,
    retryId: string,
  ) {
    return http.request<z.infer<typeof presentationSaveVariantResponseSchema>>({
      path: `${presentationTemplateRoute(scope.assetId)}/variants`,
      method: 'POST',
      body: presentationSaveVariantRequestSchema.parse({
        ...bodyScope(scope),
        expectedRevision,
        name,
        proposalId,
        retryId,
      }),
      schema: presentationSaveVariantResponseSchema,
    });
  },
  history(
    scope: PresentationScope,
    expectedRevision: number,
    direction: 'undo' | 'redo',
    retryId: string,
  ) {
    return http.request<PresentationEnvelope>({
      path: `${presentationTemplateRoute(scope.assetId)}/history`,
      method: 'POST',
      body: presentationHistoryRequestSchema.parse({
        ...bodyScope(scope),
        expectedRevision,
        direction,
        retryId,
      }),
      schema: presentationEnvelopeSchema,
    });
  },
  previewExport(
    scope: PresentationScope,
    expectedRevision: number,
    formats: Array<'pptx' | 'pdf'>,
  ) {
    return http.request<z.infer<typeof presentationExportPreviewResponseSchema>>({
      path: `${presentationTemplateRoute(scope.assetId)}/export/preview`,
      method: 'POST',
      body: presentationExportPreviewRequestSchema.parse({
        ...bodyScope(scope),
        expectedRevision,
        formats,
      }),
      schema: presentationExportPreviewResponseSchema,
    });
  },
  confirmExport(scope: PresentationScope, confirmationToken: string) {
    return http.request<z.infer<typeof presentationExportConfirmResponseSchema>>({
      path: `${presentationTemplateRoute(scope.assetId)}/export/confirm`,
      method: 'POST',
      body: presentationExportConfirmRequestSchema.parse({
        ...bodyScope(scope),
        confirmationToken,
      }),
      schema: presentationExportConfirmResponseSchema,
    });
  },
};
