import { handleAuthCallbackRequest } from "@/lib/auth/callback-handler";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return handleAuthCallbackRequest(request);
}
