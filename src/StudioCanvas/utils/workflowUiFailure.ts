import { isStudioGenerationErrorCode } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api/errors';
import { generationErrorCopy } from './generationErrorCopy';
import { translateStudioMetadata } from './studioPresentation';

export const workflowMessageKeys = [
  'batchRefusalKind',
  'batchRefusalCap',
  'batchSelectBrand',
  'batchUploadFailed',
  'batchPasteCap',
  'workflow_the_connected_node_f357d836',
  'workflow_the_reference_on_value0_could__81d076b5',
  'workflow_the_value0_input_is_waiting_on_d9483d34',
  'workflow_the_value0_input_is_wired_to_v_7169ff27',
  'workflow_nothing_is_connected_to_this_a_3067954c',
  'workflow_the_input_on_value0_has_no_rea_168dc297',
  'workflow_could_not_read_the_clip_on_val_12c287e4',
  'workflow_missing_required_prompt_fd8a0824',
  'workflow_upstream_dependency_failed_69bca120',
  'workflow_waiting_on_an_upstream_video_e_fa42e665',
  'workflow_missing_required_video_input_4e4d436c',
  'workflow_connect_at_least_one_clip_or_i_92b06028',
  'workflow_a_timeline_clip_references_a_d_9fbc3c25',
  'workflow_a_timeline_clip_has_no_resolva_287b7da8',
  'workflow_awaiting_manual_edit_open_the__9ab01241',
  'workflow_connect_clips_or_stills_to_the_4a032864',
  'workflow_connect_one_music_bed_an_audio_2081a519',
  'workflow_hyperframes_agent_is_still_wor_64cf8ed7',
  'workflow_add_or_connect_a_prompt_e95829ba',
  'workflow_pick_an_operation_for_this_act_1a72d079',
  'workflow_connect_value0_to_value1_998a2f82',
  'workflow_connect_something_to_route_c984d030',
  'workflow_waiting_on_the_upstream_node_848f54dc',
  'workflow_add_items_or_connect_something_f74d8de1',
  'workflow_connect_something_to_export_9e23de65',
  'workflow_connect_at_least_one_image_to__b07c2dbc',
  'workflow_awaiting_manual_edit_open_the__685d3e25',
  'workflow_missing_connected_input_for_va_70bd5b80',
  'workflow_missing_required_inputs_or_pro_3eca3adf',
  'workflow_reference_image_required_44615c1c',
  'workflow_flow_needs_input_7f90e70f',
  'workflow_add_a_reference_image_to_run_t_a4724533',
  'workflow_value0_fix_the_selected_node_t_09a22143',
  'workflow_nothing_to_run_170a141e',
  'workflow_this_flow_has_no_runnable_node_9e7b6955',
  'workflow_publisher_nodes_are_delivery_h_f9da5afd',
  'workflow_the_run_generates_the_media_a__502931ad',
  'workflow_no_brand_selected_reload_ai_st_88c4474b',
  'workflow_enrichment_execution_unavailab_eb587b97',
  'workflow_nothing_to_enrich_this_prompt__ca80766b',
  'workflow_enrichment_failed_8396f34c',
  'workflow_enrichment_returned_no_text_1381ca15',
  'workflow_omni_execution_unavailable_96628acb',
  'workflow_omni_generation_failed_0c757f6c',
  'workflow_missing_connected_video_input_4927612f',
  'workflow_this_browser_could_not_decode__edada005',
  'workflow_authentication_session_require_b6705a60',
  'workflow_video_decode_failed_2dbbafdc',
  'workflow_no_response_body_9fc4fcab',
  'workflow_video_decode_returned_empty_ou_e3c23160',
  'workflow_video_extension_execution_unav_37a747a1',
  'workflow_could_not_read_the_connected_c_96ea01cf',
  'workflow_generation_failed_78257562',
  'workflow_no_output_received_e490da0d',
  'workflow_ai_studio_workspace_is_unavail_8ba152e7',
  'workflow_the_fast_cut_could_not_be_rend_5272b4cb',
  'workflow_nothing_is_connected_to_this_r_0a628d9e',
  'workflow_nothing_is_connected_to_export_358ce627',
  'workflow_export_failed_e94d3ee0',
  'workflow_this_batch_has_no_items_to_run_81e8c9cd',
  'workflow_batch_truncated_e0e299b5',
  'workflow_only_the_first_value0_items_wi_69c7dd2d',
  'workflow_value0_of_value1_items_failed_858fc89a',
  'workflow_value0_finished_the_rest_567e2097',
  'workflow_value0_produced_nothing_for_an_361e6695',
  'workflow_this_batch_produced_nothing_fo_a808c2ae',
  'workflow_the_rest_of_the_batch_finished_ad5d57b5',
  'workflow_this_node_could_not_complete_r_4bbf0954',
  'workflow_your_session_expired_sign_in_a_14f32048',
  'workflow_you_don_t_have_permission_to_r_6fbeb6b7',
  'workflow_the_service_is_busy_wait_a_mom_814cd728',
  'workflow_the_selected_node_needs_input__74f52cc9',
] as const;
export type WorkflowMessageCode = (typeof workflowMessageKeys)[number];
export type WorkflowUiFailure = {
  code: WorkflowMessageCode;
  values?: Record<string, string | number>;
  metadataValues?: Record<string, string>;
};
export type WorkflowText = ReturnType<typeof useTranslations<'studio'>>;

export function workflowFailure(
  code: WorkflowMessageCode,
  values?: Record<string, string | number>,
  metadataValues?: Record<string, string>,
): WorkflowUiFailure {
  return { code, ...(values ? { values } : {}), ...(metadataValues ? { metadataValues } : {}) };
}

/** Diagnostic prose stays on Error.message; neutral UI metadata is never persisted or broadcast. */
export class WorkflowUiError extends Error {
  constructor(
    message: string,
    readonly uiFailure: WorkflowUiFailure,
  ) {
    super(message);
    this.name = 'WorkflowUiError';
  }
}

export function workflowUiText(failure: WorkflowUiFailure, t: WorkflowText): string {
  const values = { ...failure.values };
  for (const [name, source] of Object.entries(failure.metadataValues ?? {}))
    values[name] = translateStudioMetadata(source, t);
  return t(failure.code, values);
}

const codeSet: ReadonlySet<string> = new Set(workflowMessageKeys);
function isWorkflowUiFailure(value: unknown): value is WorkflowUiFailure {
  if (
    !value ||
    typeof value !== 'object' ||
    !('code' in value) ||
    typeof value.code !== 'string' ||
    !codeSet.has(value.code)
  )
    return false;
  for (const [name, isMetadata] of [
    ['values', false],
    ['metadataValues', true],
  ] as const) {
    const entries = name in value ? value[name as keyof typeof value] : undefined;
    if (
      entries !== undefined &&
      (!entries ||
        typeof entries !== 'object' ||
        Array.isArray(entries) ||
        Object.values(entries).some(
          (entry) =>
            typeof entry !== 'string' &&
            (isMetadata || typeof entry !== 'number' || !Number.isFinite(entry)),
        ))
    )
      return false;
  }
  return true;
}

export function workflowFailureFromError(
  error: unknown,
  fallback = workflowFailure('workflow_this_node_could_not_complete_r_4bbf0954'),
): WorkflowUiFailure {
  if (error instanceof WorkflowUiError) return error.uiFailure;
  if (error instanceof ApiError) {
    if (error.status === 401)
      return workflowFailure('workflow_your_session_expired_sign_in_a_14f32048');
    if (error.status === 403)
      return workflowFailure('workflow_you_don_t_have_permission_to_r_6fbeb6b7');
    if (error.status === 429 || error.status >= 500)
      return workflowFailure('workflow_the_service_is_busy_wait_a_mom_814cd728');
  }
  return fallback;
}

/** Uses the current translator at render time; raw diagnostics remain on the node. */
export function workflowNodeError(
  data: { error?: unknown; errorCode?: unknown; uiFailure?: unknown },
  t: WorkflowText,
): string | undefined {
  if (isWorkflowUiFailure(data.uiFailure)) {
    if (
      data.uiFailure.code !== 'workflow_this_node_could_not_complete_r_4bbf0954' ||
      !isStudioGenerationErrorCode(data.errorCode)
    )
      return workflowUiText(data.uiFailure, t);
  }
  if (isStudioGenerationErrorCode(data.errorCode))
    return generationErrorCopy(data.errorCode, undefined, t).guidance;
  return typeof data.error === 'string' ? data.error : undefined;
}
