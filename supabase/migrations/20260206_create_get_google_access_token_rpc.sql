CREATE OR REPLACE FUNCTION public.get_google_access_token(p_customer_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'brand_profiles', 'brand_integrations', 'extensions'
AS $$
DECLARE
    v_token_data bytea;
BEGIN
    SELECT ui.access_token_encrypted INTO v_token_data
    FROM brand_integrations.google_ad_accounts gaa
    JOIN brand_profiles.user_integrations ui ON ui.id = gaa.brand_integration_id
    WHERE gaa.customer_id = p_customer_id;

    IF v_token_data IS NOT NULL THEN
        RETURN brand_profiles.decrypt_token(v_token_data);
    END IF;

    RETURN NULL;
END;
$$;
