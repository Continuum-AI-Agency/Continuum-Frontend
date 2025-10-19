import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | Continuum Auth",
    default: "Authentication",
  },
};

export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

