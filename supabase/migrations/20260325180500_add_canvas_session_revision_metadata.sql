-- Deterministic ordering metadata for canvas realtime sessions
ALTER TABLE brand_profiles.canvas_sessions
ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS editor_session_id UUID,
ADD COLUMN IF NOT EXISTS editor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE brand_profiles.canvas_sessions
SET revision = 1
WHERE revision = 0;

CREATE OR REPLACE FUNCTION brand_profiles.set_canvas_session_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());

  IF TG_OP = 'INSERT' THEN
    IF NEW.revision IS NULL OR NEW.revision < 1 THEN
      NEW.revision = 1;
    END IF;
  ELSE
    NEW.revision = COALESCE(OLD.revision, 0) + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canvas_sessions_set_revision ON brand_profiles.canvas_sessions;
CREATE TRIGGER canvas_sessions_set_revision
BEFORE INSERT OR UPDATE ON brand_profiles.canvas_sessions
FOR EACH ROW
EXECUTE FUNCTION brand_profiles.set_canvas_session_revision();

COMMENT ON COLUMN brand_profiles.canvas_sessions.revision IS 'Monotonic server-side revision used for deterministic merge ordering';
COMMENT ON COLUMN brand_profiles.canvas_sessions.editor_session_id IS 'Client session UUID that last wrote this canvas snapshot';
COMMENT ON COLUMN brand_profiles.canvas_sessions.editor_user_id IS 'Authenticated user that last wrote this canvas snapshot';
