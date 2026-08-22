export function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // Vercel injects this at build time. It is the deploy anchor the monorepo's
    // `factory:deploy:status` reads to tell a shipped commit from a merged one.
    rev: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
  });
}
