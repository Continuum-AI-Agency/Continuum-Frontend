import type { NextRequest } from 'next/server';
import { handleAuthCallbackRequest } from '@/lib/auth/callback-handler';

export async function GET(request: NextRequest) {
  return handleAuthCallbackRequest(request);
}
