"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";

export default function ImpersonatePage() {
  const router = useRouter();
  const [status, setStatus] = useState("Initializing authentication...");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const supabase = createSupabaseBrowserClient();

  const addLog = (msg: string) => {
    console.log(`[Impersonate] ${msg}`);
    setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    let mounted = true;
    
    const timeout = setTimeout(() => {
      if (mounted && !errorMsg && status !== "Redirecting to dashboard...") {
        addLog("Authentication timed out after 10 seconds.");
        setErrorMsg("Authentication timed out. The link may have expired or there is a connectivity issue.");
      }
    }, 10000);

    const handleAuth = async () => {
      try {
        addLog("Starting auth check...");
        
        const params = new URLSearchParams(window.location.search);
        
        const errorCode = params.get("error");
        const errorDescription = params.get("error_description");
        if (errorCode) {
          addLog(`Error detected in URL: ${errorCode} - ${errorDescription}`);
          throw new Error(errorDescription || errorCode);
        }

        const code = params.get("code");
        if (code) {
          addLog("Authorization code found. Redirecting to callback handler...");
          if (mounted) setStatus("Exchanging authorization code...");
          router.replace(`/auth/callback?code=${code}&next=/dashboard&impersonate=true`);
          return;
        }

        if (window.location.hash && window.location.hash.includes("access_token")) {
          addLog("Hash with access_token found. Attempting manual session update...");
          if (mounted) setStatus("Manually verifying credentials...");
          
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            addLog("Calling setSession manually...");
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              addLog(`setSession error: ${error.message}`);
              throw error;
            }

            if (data.session) {
              addLog("Session set successfully. Redirecting...");
              if (mounted) setStatus("Redirecting to dashboard...");
              router.replace("/dashboard");
              return;
            }
          }
        }

        addLog("Checking current session...");
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          addLog(`Session error: ${error.message}`);
          throw error;
        }

        if (session) {
           addLog(`Session found for user: ${session.user.id}. Redirecting...`);
           if (mounted) setStatus("Redirecting to dashboard...");
           router.replace("/dashboard");
           return;
        } else {
           addLog("No active session found yet.");
           if (!window.location.hash && !params.get("code")) {
             addLog("No auth markers found in URL.");
             if (mounted) setStatus("Waiting for authentication...");
           }
        }

      } catch (err: any) {
        addLog(`Caught error: ${err.message}`);
        if (mounted) setErrorMsg(err.message || "Authentication failed");
      }
    };

    handleAuth();

    addLog("Registering auth state change listener...");
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      addLog(`Auth event triggered: ${event}`);
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session) {
          addLog(`User signed in: ${session.user.id}`);
          if (mounted) setStatus("Redirecting to dashboard...");
          router.replace("/dashboard");
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  if (errorMsg) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-xl border border-red-100 max-w-md w-full text-center">
          <div className="bg-red-50 p-3 rounded-full">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Authentication Failed</h1>
          <p className="text-sm text-gray-600">{errorMsg}</p>
          
          <div className="w-full mt-4 p-3 bg-gray-50 rounded-lg text-left overflow-hidden">
            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2">Debug Logs</p>
            {debugLogs.map((log, i) => (
              <p key={i} className="text-[10px] font-mono text-gray-500 truncate">{log}</p>
            ))}
          </div>

          <button 
            onClick={() => router.push('/login')}
            className="mt-6 w-full py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-lg"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="flex flex-col items-center gap-6 p-10 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-100 rounded-full blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 relative z-10" />
        </div>
        <div className="space-y-2 text-center">
          <h1 className="text-lg font-bold text-gray-900">Finalizing Impersonation</h1>
          <p className="text-sm text-gray-500 font-medium">{status}</p>
        </div>
        
        <div className="w-full mt-4 p-3 bg-gray-50 rounded-lg text-left overflow-hidden opacity-50">
          {debugLogs.slice(-3).map((log, i) => (
            <p key={i} className="text-[10px] font-mono text-gray-400 truncate">{log}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
