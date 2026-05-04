import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = "Continuum <product@trycontinuum.ai>";
const SEND_EMAIL_HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.replace("v1,whsec_", "");

interface AuthHookPayload {
  user: {
    email: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

function buildLoginUrl(redirectTo: string, token: string): string {
  const trimmed = redirectTo.trim();
  const hasProtocol = /^https?:\/\//i.test(trimmed);

  try {
    const parsed = new URL(trimmed, "https://continuum.local");
    if (!parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", token);
    }

    if (hasProtocol) {
      return parsed.toString();
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const separator = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${separator}token=${encodeURIComponent(token)}`;
  }
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        headers: { "Content-Type": "application/json" },
        status: 405,
      });
    }

    if (!SEND_EMAIL_HOOK_SECRET) {
      throw new Error("Missing SEND_EMAIL_HOOK_SECRET");
    }

    const rawPayload = await req.text();
    const webhook = new Webhook(SEND_EMAIL_HOOK_SECRET);
    const payload = webhook.verify(
      rawPayload,
      Object.fromEntries(req.headers),
    ) as AuthHookPayload;
    const { user, email_data } = payload;
    const { email } = user;
    const { token, email_action_type, redirect_to } = email_data;

    console.log(`Sending ${email_action_type} email to ${email}`);

    if (!RESEND_API_KEY) {
      throw new Error("Missing RESEND_API_KEY");
    }

    let subject = "Sign in to Continuum";
    let html = "";

    const loginUrl = buildLoginUrl(redirect_to, token);

    if (email_action_type === "magiclink" || email_action_type === "login_otp") {
      subject = "Sign in to Continuum";
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #111;">Sign in to Continuum</h2>
          <p>Click the button below to sign in to your account.</p>
          <p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Sign in</a></p>
          <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #666; font-size: 14px; word-break: break-all;"><a href="${loginUrl}">${loginUrl}</a></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.</p>
        </div>
      `;
    } else if (email_action_type === "signup") {
      subject = "Welcome to Continuum";
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #111;">Welcome to Continuum</h2>
          <p>Thanks for signing up! Click the button below to verify your email and get started.</p>
          <p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Verify Email</a></p>
          <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #666; font-size: 14px; word-break: break-all;"><a href="${loginUrl}">${loginUrl}</a></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `;
    } else {
      subject = "Authentication Email";
      html = `<p>Click here to continue: <a href="${loginUrl}">${loginUrl}</a></p>`;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Resend API error: ${error}`);
    }

    return new Response(JSON.stringify({ status: "success" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in auth-send-email hook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
