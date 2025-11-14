import { LOGIN_GLOW_GRADIENT } from "@/lib/ui/backgrounds";

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 overflow-hidden" style={{ backgroundImage: LOGIN_GLOW_GRADIENT }}>
      {children}
    </div>
  );
}



