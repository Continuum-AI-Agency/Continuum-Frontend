'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type AuthorizationDetails = {
  authorization_id: string
  redirect_uri: string
  client: { id: string; name: string; uri: string; logo_uri: string }
  user: { id: string; email: string }
  scope: string
}

function ConsentContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const authorizationId = searchParams.get('authorization_id')

  const [details, setDetails] = useState<AuthorizationDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!authorizationId) {
      setError('Missing authorization_id')
      setLoading(false)
      return
    }

    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!sessionData.session) {
        const returnPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
        router.replace(`/login?redirectTo=${encodeURIComponent(returnPath)}`)
        return
      }

      supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: detailsError }) => {
        if (detailsError || !data) {
          setError(detailsError?.message ?? 'Invalid or expired authorization request')
          setLoading(false)
          return
        }
        if ('redirect_url' in data) {
          // User already consented — follow the redirect immediately
          window.location.href = data.redirect_url
          return
        }
        setDetails(data as AuthorizationDetails)
        setLoading(false)
      })
    })
  }, [authorizationId, router])

  async function approve() {
    if (!authorizationId || submitting) return
    setSubmitting(true)
    const supabase = createSupabaseBrowserClient()
    const { error: approveError } = await supabase.auth.oauth.approveAuthorization(authorizationId)
    if (approveError) {
      setError(approveError.message)
      setSubmitting(false)
    }
    // On success the SDK auto-redirects the browser
  }

  async function deny() {
    if (!authorizationId || submitting) return
    setSubmitting(true)
    const supabase = createSupabaseBrowserClient()
    const { error: denyError } = await supabase.auth.oauth.denyAuthorization(authorizationId)
    if (denyError) {
      setError(denyError.message)
      setSubmitting(false)
    }
    // On success the SDK auto-redirects the browser
  }

  if (loading) return <ConsentSkeleton />

  if (error) {
    return (
      <ConsentShell>
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-red-500">
              <path d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Authorization failed</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
        </div>
      </ConsentShell>
    )
  }

  if (!details) return null

  const scopes = details.scope ? details.scope.split(' ').filter(Boolean) : []

  return (
    <ConsentShell>
      <div className="text-center space-y-3">
        {details.client.logo_uri ? (
          <img
            src={details.client.logo_uri}
            alt={details.client.name}
            className="h-12 w-12 rounded-xl object-contain mx-auto border border-zinc-200 dark:border-zinc-700 p-1"
          />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-[#5A48F9]/10 flex items-center justify-center mx-auto">
            <span className="text-[#5A48F9] font-semibold text-lg">
              {details.client.name.charAt(0)}
            </span>
          </div>
        )}
        <div>
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Authorize {details.client.name}
          </h1>
          {details.client.uri && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{details.client.uri}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        Authorizing as{' '}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{details.user.email}</span>
      </div>

      {scopes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            Permissions requested
          </p>
          <ul className="space-y-1.5">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[#5A48F9]">
                  <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {scope}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 pt-1">
        <button
          onClick={approve}
          disabled={submitting}
          className="w-full rounded-lg bg-[#5A48F9] hover:bg-[#4a38e9] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 transition-colors"
        >
          {submitting ? 'Authorizing…' : 'Allow access'}
        </button>
        <button
          onClick={deny}
          disabled={submitting}
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-300 text-sm font-medium py-2.5 px-4 transition-colors"
        >
          Deny
        </button>
      </div>
    </ConsentShell>
  )
}

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-6">
        {children}
      </div>
    </div>
  )
}

function ConsentSkeleton() {
  return (
    <ConsentShell>
      <div className="space-y-4 animate-pulse">
        <div className="h-12 w-12 rounded-xl bg-zinc-200 dark:bg-zinc-800 mx-auto" />
        <div className="h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-800 mx-auto" />
        <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800/50" />
        <div className="space-y-2 pt-2">
          <div className="h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800/50" />
        </div>
      </div>
    </ConsentShell>
  )
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<ConsentSkeleton />}>
      <ConsentContent />
    </Suspense>
  )
}
