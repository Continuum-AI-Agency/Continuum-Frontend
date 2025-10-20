"use client";

interface PasswordRequirementsProps {
  password: string;
}

export function PasswordRequirements({ password }: PasswordRequirementsProps) {
  const requirements = [
    {
      label: "At least 8 characters",
      met: password.length >= 8,
    },
    {
      label: "At least one lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      label: "At least one uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      label: "At least one number",
      met: /[0-9]/.test(password),
    },
    {
      label: "At least one special character",
      met: /[^a-zA-Z0-9]/.test(password),
    },
  ];

  return (
    <div className="space-y-2 mt-3">
      {requirements.map((req, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
            req.met 
              ? "bg-green-500 dark:bg-green-600" 
              : "bg-gray-300 dark:bg-gray-600"
          }`}>
            {req.met && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className={req.met ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
  );
}

