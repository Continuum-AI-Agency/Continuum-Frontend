import type { AutomationValidationIssue } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';

const keys = {
  duplicate_node_id: 'validation_duplicate_node_id',
  duplicate_edge_id: 'validation_duplicate_edge_id',
  dangling_edge: 'validation_dangling_edge',
  self_connection: 'validation_self_connection',
  incompatible_ports: 'validation_incompatible_ports',
  cycle: 'validation_cycle',
  missing_trigger: 'validation_missing_trigger',
  missing_outcome: 'validation_missing_outcome',
  unreachable_node: 'validation_unreachable_node',
  dead_end: 'validation_dead_end',
  missing_input: 'validation_missing_input',
  invalid_branch_handle: 'validation_invalid_branch_handle',
  unsafe_webhook: 'validation_unsafe_webhook',
  invalid_action: 'validation_invalid_action',
  contract_mismatch: 'validation_contract_mismatch',
  invalid_output_schema: 'validation_invalid_output_schema',
  schema_drift: 'validation_schema_drift',
  validation_stale: 'validation_validation_stale',
} as const satisfies Record<AutomationValidationIssue['code'], string>;

export function automationValidationMessage(
  issue: AutomationValidationIssue,
  translate: ReturnType<typeof useTranslations<'automations'>>,
): string {
  return translate(keys[issue.code]);
}
