CREATE SCHEMA IF NOT EXISTS auth_hooks;

CREATE OR REPLACE FUNCTION auth_hooks.send_email_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN event;
END;
$$;
