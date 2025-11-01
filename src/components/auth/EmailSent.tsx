import { Mail } from "lucide-react";
import { Button } from "@radix-ui/themes";

interface EmailSentProps {
  email: string;
  onResend?: () => void;
  isResending?: boolean;
}

export function EmailSent({ email, onResend, isResending }: EmailSentProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-6 py-8">
      <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <Mail className="w-10 h-10 text-emerald-400" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">
          Check your email
        </h2>
        <p className="text-gray-400 max-w-md">
          We sent a magic link to{" "}
          <span className="font-semibold text-white">{email}</span>
        </p>
      </div>

      {onResend && (
        <Button
          onClick={onResend}
          disabled={isResending}
          variant="ghost"
          size="2"
          className="text-white hover:text-gray-200 transition-colors"
        >
          {isResending ? "Sending..." : "Resend email"}
        </Button>
      )}

      <p className="text-sm text-gray-500 max-w-md">
        Click the link in the email to sign in. The link will expire in 1 hour.
      </p>
    </div>
  );
}
