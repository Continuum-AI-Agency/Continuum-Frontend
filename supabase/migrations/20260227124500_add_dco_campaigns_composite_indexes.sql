-- Query-pattern indexes for DCO_Campaigns selector + timeline endpoints.

create index if not exists idx_ral_brand_occurred_at_desc
  on "DCO_Campaigns".rule_action_logs (brand_id, occurred_at desc);

create index if not exists idx_ral_brand_account_occurred_at_desc
  on "DCO_Campaigns".rule_action_logs (brand_id, meta_account_id, occurred_at desc)
  where meta_account_id is not null;

create index if not exists idx_ral_brand_account_campaign_occurred_at_desc
  on "DCO_Campaigns".rule_action_logs (brand_id, meta_account_id, meta_campaign_id, occurred_at desc)
  where meta_campaign_id is not null;

create index if not exists idx_ta_brand_account
  on "DCO_Campaigns".timeline_accounts (brand_id, account_id);

create index if not exists idx_tb_brand_account_start
  on "DCO_Campaigns".timeline_blocks (brand_id, account_id, block_start);

create index if not exists idx_tb_brand_account_end
  on "DCO_Campaigns".timeline_blocks (brand_id, account_id, block_end);
