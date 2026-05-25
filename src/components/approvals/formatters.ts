import type { RuleAction } from "@/lib/approvals/types";

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const METRIC_FORMAT: Record<string, Intl.NumberFormatOptions> = {
  spend: { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  cpc: { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 },
  cpm: { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 },
  roas: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  account_avg_roas: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ctr: { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 },
  impressions: { notation: "compact", maximumFractionDigits: 1 },
  clicks: { notation: "compact", maximumFractionDigits: 1 },
};

export function formatMetric(key: string, value: number): string {
  const formatter = new Intl.NumberFormat("en-US", METRIC_FORMAT[key] ?? { maximumFractionDigits: 2 });
  // CTR comes in as 0.71 meaning 0.71% per APPROVALS_API.md fixtures; treat as a raw percent.
  if (key === "ctr") return formatter.format(value / 100);
  return formatter.format(value);
}

const METRIC_LABELS: Record<string, string> = {
  roas: "ROAS",
  account_avg_roas: "Acct avg ROAS",
  spend: "Spend",
  impressions: "Impressions",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
};

export function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key.replace(/_/g, " ");
}

export function scopeLabel(action: RuleAction): string {
  if (action.scope_type === "GLOBAL") return "Global";
  const id = action.scope_id ?? "—";
  const short = id.length > 12 ? `…${id.slice(-8)}` : id;
  const type = action.scope_type.charAt(0) + action.scope_type.slice(1).toLowerCase();
  return `${type} ${short}`;
}

export function whyText(action: RuleAction): string {
  if (action.rule_name) return action.rule_name;
  if (action.flow_run_id) {
    const short = action.flow_run_id.slice(0, 8);
    return `Emitted by flow run · ${short}`;
  }
  return "No rationale provided";
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  PAUSE_AD: "Pause ad",
  PAUSE_ADSET: "Pause ad set",
  PAUSE_CAMPAIGN: "Pause campaign",
  SCALE_ADSET: "Scale ad set",
  SCALE_CAMPAIGN: "Scale campaign",
  SCALE_AD: "Scale ad",
  ACTIVATE_AD: "Activate ad",
  ACTIVATE_ADSET: "Activate ad set",
  ACTIVATE_CAMPAIGN: "Activate campaign",
  ALERT_ACCOUNT: "Account alert",
  ALERT_CAMPAIGN: "Campaign alert",
  SWAP_CREATIVE: "Swap creative",
  NOOP: "No-op",
};

export function actionTypeLabel(type: string): string {
  return ACTION_TYPE_LABELS[type] ?? type;
}

const UNSUPPORTED_ACTIONS = new Set([
  "SCALE_AD",
  "ACTIVATE_AD",
  "ACTIVATE_ADSET",
  "ACTIVATE_CAMPAIGN",
  "ALERT_CAMPAIGN",
  "SWAP_CREATIVE",
]);

export function isExecutorUnsupported(type: string): boolean {
  return UNSUPPORTED_ACTIONS.has(type);
}
