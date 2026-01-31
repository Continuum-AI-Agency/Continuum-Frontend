-- Enable full row replication for canvas_sessions to support realtime updates
alter table brand_profiles.canvas_sessions replica identity full;

-- Add canvas_sessions to the realtime publication
alter publication supabase_realtime add table brand_profiles.canvas_sessions;
