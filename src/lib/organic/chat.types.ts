export type OrganicChatSession = {
  id: number;
  session_id: string;
  brand_id: string;
  user_id: string;
  title: string | null;
  week_start: string | null;
  timezone: string;
  last_message_role: "user" | "assistant" | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganicChatMessage = {
  id: number;
  session_id: string;
  brand_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type OrganicContentPlanStatus =
  | "proposed"
  | "approved"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

export type OrganicContentPlanPlacement = {
  platform: string;
  account_id?: string;
  day: string;
  time: string;
  trend_id?: string;
  post_type?: string;
  concept?: string;
};

export type OrganicContentPlan = {
  id: string;
  session_id: string;
  brand_id: string;
  user_id: string;
  week_start: string;
  timezone: string;
  platform_account_ids: Record<string, string>;
  placements: OrganicContentPlanPlacement[];
  guidance: string | null;
  status: OrganicContentPlanStatus;
  run_idempotency_key: string | null;
  created_at: string;
  updated_at: string;
};
