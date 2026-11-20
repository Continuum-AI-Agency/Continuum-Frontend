import type { useTranslations } from 'next-intl';

const keys = {
  'Slack delivery isn’t available yet.': 'm_abd6354223',
  'No Slack workspace is connected to this brand yet.': 'm_1cc499c036',
  'The Continuum app is no longer installed in this brand’s Slack workspace. Reinstall it to add a channel.':
    'm_de679ff7f1',
  'That channel is gone — pick another.': 'm_741d64c091',
  'Only brand owners, admins and operators can add a Slack channel.': 'm_3242bd91a6',
  'That room is already gone. Refresh the list.': 'm_f73a866cb1',
  'Slack rooms could not be read. Try again.': 'm_49666c8c86',
  'That room could not be saved. Try again.': 'm_13ab333129',
  'That Slack room is gone. Pick another.': 'm_430dbcd6c5',
  'Continuum hit an unexpected error talking to Slack. Try again; if it keeps failing, tell your Continuum contact.':
    'm_9495117320',
  'Slack did not answer. Try again.': 'm_069ddfac23',
  Ops: 'm_907a54c2b2',
  Client: 'm_1bdd79b126',
  Alerts: 'm_d0efe0b2c7',
  DM: 'm_05a3b9fa04',
  'Every finished render': 'm_b815e2b6ab',
  'Renders that passed their check': 'm_df9ff1a127',
  'Delivery problems and unanswered approvals': 'm_1aaf8c4b21',
  'A direct message, not a channel': 'm_a14e545f65',
} as const;
export function settingsSlackCopy(
  source: string,
  t: ReturnType<typeof useTranslations<'settings'>>,
  fallback: string,
): string {
  return Object.hasOwn(keys, source) ? t(keys[source as keyof typeof keys]) : fallback;
}
