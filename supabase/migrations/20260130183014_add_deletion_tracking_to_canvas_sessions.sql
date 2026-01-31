-- Add deletion tracking to canvas_sessions for real-time collaboration
-- Allows distinguishing between "not saved yet" and "intentionally deleted"

ALTER TABLE brand_profiles.canvas_sessions
ADD COLUMN IF NOT EXISTS deleted_node_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS deleted_edge_ids JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN brand_profiles.canvas_sessions.deleted_node_ids IS 'Array of node IDs deleted in this update';
COMMENT ON COLUMN brand_profiles.canvas_sessions.deleted_edge_ids IS 'Array of edge IDs deleted in this update';
