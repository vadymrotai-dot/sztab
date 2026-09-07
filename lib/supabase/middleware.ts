import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { WORKSPACE_OWNER_ID } from '@/lib/staff/owner'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── Portal klienta Faza 0 — role-gating (E) ────────────────────────────
  // Portal-user (app_metadata.role='portal') ma dostęp WYŁĄCZNIE do /portal
  // i /auth (+ publiczny /zamowienie). Wszystko inne = admin → redirect /portal.
  // Warstwa autorytatywna (DB) jest w admin-layoutach, na wypadek lagu JWT.
  const path = request.nextUrl.pathname
  const role = (user?.app_metadata as { role?: string } | undefined)?.role
  const isPortalPath = path.startsWith('/portal')
  const isAuthPath = path.startsWith('/auth')
  const isPublicOrder = path.startsWith('/zamowienie')
  // KRYTYCZNE: NIGDY nie przekierowuj żądań /api na /portal — fetch dostałby
  // HTML zamiast JSON ("Unexpected token '<'"). API ma własną autoryzację
  // (token/route-level + RLS). Dotyczy /api/orders/[token]/{cart,submit,last}.
  const isApi = path.startsWith('/api')
  const isStaffPath = path.startsWith('/staff')

  if (
    user &&
    role === 'portal' &&
    !isPortalPath &&
    !isAuthPath &&
    !isPublicOrder &&
    !isApi
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/portal'
    return NextResponse.redirect(url)
  }

  // ── Staff-registration gate (RDZEŃ BEZPIECZEŃSTWA) ─────────────────────────
  // Każdy authenticated, kto NIE jest: portalem, ZATWIERDZONYM staffem
  // (role==='staff'), ani właścicielem (Vadym po uid) → trzymany na
  // /staff/onboard. Łapie: świeży roleless signup, status pending/rejected ORAZ
  // okno wyścigu po /auth/callback (sesja jest, roli jeszcze nie).
  // Działa na WSZYSTKICH grupach tras (dashboard/operacje/fba/intelligence/api),
  // bo middleware biegnie przed każdą. Wyjątki: /staff/* i /auth/* (dojście do
  // onboard/login/callback) + publiczny /zamowienie (token, nie-admin).
  // role='staff' nadawana DOPIERO przy zatwierdzeniu; lag JWT po zatwierdzeniu
  // gasi /staff/onboard (refreshSession, bez relogowania).
  if (
    user &&
    role !== 'portal' &&
    role !== 'staff' &&
    user.id !== WORKSPACE_OWNER_ID &&
    !isStaffPath &&
    !isAuthPath &&
    !isPublicOrder
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/staff/onboard'
    return NextResponse.redirect(url)
  }

  if (!user && isPortalPath && !path.startsWith('/portal/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/portal/login'
    return NextResponse.redirect(url)
  }

  if (!user && isStaffPath && !path.startsWith('/staff/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/staff/login'
    return NextResponse.redirect(url)
  }

  if (
    // if the user is not logged in and the app path, in this case, /protected, is accessed, redirect to the login page
    request.nextUrl.pathname.startsWith('/protected') &&
    !user
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
