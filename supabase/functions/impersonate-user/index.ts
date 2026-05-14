
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function writeAudit(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  actorUserId: string;
  targetUserId: string;
  before: unknown;
  after: unknown;
  metadata?: Record<string, unknown>;
  status?: "success" | "failed";
}) {
  const { error } = await args.supabaseAdmin
    .schema("brand_profiles")
    .from("admin_audit_log")
    .insert({
      actor_user_id: args.actorUserId,
      action: "admin.user.impersonation_link",
      target_type: "auth_user",
      target_id: args.targetUserId,
      before: args.before,
      after: args.after,
      metadata: args.metadata ?? {},
      request_id: crypto.randomUUID(),
      status: args.status ?? "success",
    });

  if (error) {
    console.error("Impersonation audit write failed:", error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    
    const { data: claimsData, error: authError } = await supabaseAdmin.auth
      .getClaims(authHeader.replace('Bearer ', ''));
    const adminUser = {
      id: claimsData?.claims?.sub,
      app_metadata: claimsData?.claims?.app_metadata as Record<string, unknown> | undefined,
    };
    
    if (authError || !adminUser.id) {
      console.error("Auth error:", authError);
      throw new Error('Invalid authentication');
    }
    if (!Boolean(adminUser.app_metadata?.is_admin)) {
      throw new Error('Forbidden');
    }
    
    console.log("Admin user authenticated:", adminUser.id);
    
    const requestBody = await req.json();
    const { target_id } = requestBody;
    
    if (!target_id) {
      throw new Error('Missing target user ID');
    }
    
    console.log(`Admin ${adminUser.id} attempting to impersonate user ${target_id}`);
    
    const { data: { user: targetUser }, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(target_id);

    if (targetUserError || !targetUser) {
        console.error("Fetch target user error:", targetUserError);
        throw new Error(`Target user not found: ${targetUserError?.message}`);
    }

    const targetEmail = targetUser.email;
    if (!targetEmail) {
        throw new Error("Target user has no email");
    }

    const origin = req.headers.get('origin') || '';
    console.log("Origin for redirect:", origin);
    
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin
    .generateLink({
        type: 'magiclink',
        email: targetEmail,
        options: {
        redirectTo: `${origin}/auth/impersonate`
        }
    });
    
    if (signInError) {
    console.error("Generate sign-in link error:", signInError);
    await writeAudit({
      supabaseAdmin,
      actorUserId: adminUser.id,
      targetUserId: target_id,
      before: { id: target_id, email: targetEmail },
      after: { id: target_id, email: targetEmail },
      metadata: { error: signInError.message },
      status: "failed",
    });
    throw new Error(`Failed to generate sign-in: ${signInError.message}`);
    }

    await writeAudit({
      supabaseAdmin,
      actorUserId: adminUser.id,
      targetUserId: target_id,
      before: { id: target_id, email: targetEmail },
      after: { id: target_id, email: targetEmail, impersonationLinkGenerated: true },
      metadata: { redirectTo: `${origin}/auth/impersonate` },
    });
    
    console.log("Sign-in link generated successfully for email:", targetEmail);
    console.log("Redirect to:", `${origin}/auth/impersonate`);
    
    return new Response(
    JSON.stringify({
        success: true,
        signInLink: signInData.properties.action_link
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Impersonation error:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
