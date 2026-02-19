
\CREATE OR REPLACE FUNCTION public.impersonate_user(admin_id uuid, target_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  target_email text;
BEGIN
  SELECT email INTO target_email
  FROM auth.users
  WHERE id = target_id;

  IF target_email IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Target user not found');
  END IF;

  RETURN json_build_object('success', true, 'email', target_email);
END;
$function$;
