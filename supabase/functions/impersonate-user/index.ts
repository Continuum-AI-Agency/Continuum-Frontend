
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }

    // Create Supabase client with the service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the user making the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    
    // Validate the admin user's session
    const { data: { user: adminUser }, error: authError } = await supabaseAdmin.auth
      .getUser(authHeader.replace('Bearer ', ''));
    
    if (authError || !adminUser) {
      console.error("Auth error:", authError);
      throw new Error('Invalid authentication');
    }
    
    console.log("Admin user authenticated:", adminUser.id);
    
    // Check if the user is an admin with root role (using is_root instead of is_impersonator)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, is_root')
      .eq('id', adminUser.id)
      .single();
      
    if (profileError || !profile) {
      console.error("Profile error:", profileError);
      throw new Error('Could not verify authorization');
    }
    
    console.log("Admin profile:", profile);
    
    if (!profile.is_admin || !profile.is_root) {
      throw new Error('Unauthorized: You must be an admin with root role');
    }
    
    const requestBody = await req.json();
    const { target_id } = requestBody;
    
    if (!target_id) {
      throw new Error('Missing target user ID');
    }
    
    // Log the impersonation attempt with detailed information
    console.log(`Admin ${adminUser.id} attempting to impersonate user ${target_id}`);
    
    // Call the impersonate_user function
    const { data, error } = await supabaseAdmin.rpc(
      'impersonate_user',
      { admin_id: adminUser.id, target_id }
    );
    
    if (error) {
      console.error("RPC impersonate_user error:", error);
      throw new Error(`Impersonation failed: ${error.message}`);
    }
    
    console.log("RPC impersonate_user response:", data);
    
    // If successful, create a new sign-in for the target user
    if (data.success) {
      // Get the origin for redirects
      const origin = req.headers.get('origin') || '';
      console.log("Origin for redirect:", origin);
      
      // Generate a one-time sign-in link for the target user
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin
        .generateLink({
          type: 'magiclink',
          email: data.email,
          options: {
            // Directly redirect to reports page after sign-in
            redirectTo: `${origin}/reports`
          }
        });
        
      if (signInError) {
        console.error("Generate sign-in link error:", signInError);
        throw new Error(`Failed to generate sign-in: ${signInError.message}`);
      }
      
      console.log("Sign-in link generated successfully for email:", data.email);
      console.log("Redirect to:", `${origin}/reports`);
      
      // Return the sign-in link
      return new Response(
        JSON.stringify({
          success: true,
          signInLink: signInData.properties.action_link
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(data.message || 'Unknown error during impersonation');
    }
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