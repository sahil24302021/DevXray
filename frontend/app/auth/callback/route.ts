// app/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    console.error('[Auth Callback] OAuth Error:', error, errorDescription)
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(errorDescription || error)}`)
  }
  
  if (code) {
    try {
      const cookieStore = await cookies()
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createServerClient(
          supabaseUrl,
          supabaseAnonKey,
          {
            cookies: {
              getAll() {
                return cookieStore.getAll()
              },
              setAll(cookiesToSet) {
                try {
                  cookiesToSet.forEach(({ name, value, options }) => {
                    cookieStore.set({ name, value, ...options })
                  })
                } catch {
                  // Avoid throwing in Server Component context
                }
              },
            },
          }
        )
        
        await supabase.auth.exchangeCodeForSession(code)
      }
    } catch (e) {
      console.error('[Auth Callback] Exchange code error:', e)
    }
  }

  // Redirect to requested next page or home
  const target = next.startsWith('/') ? next : '/'
  return NextResponse.redirect(`${origin}${target}`)
}