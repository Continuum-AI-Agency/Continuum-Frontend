import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const authorizationId = req.nextUrl.searchParams.get('authorization_id')
  if (!authorizationId) {
    return new Response('Missing authorization_id', { status: 400 })
  }
  const target = new URL('https://api.trycontinuum.ai/oauth/consent')
  target.searchParams.set('authorization_id', authorizationId)
  return Response.redirect(target.toString(), 302)
}
