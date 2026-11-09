// PR 029: server-side first gate. Every page except /login needs a session: without a session cookie pages are
// redirected to /login?redirect=… before any HTML is sent, and the Next route handlers under /api (e.g. /api/gfs)
// answer 401. /api/v1 and /api/auth are proxied to the backend, which enforces the session itself. The cookie is only checked for presence here; AuthGuard (client) and the backend
// validate the session and the role permissions.
import { NextResponse, type NextRequest } from 'next/server'
import { routeNeed } from '@/lib/access'

const COOKIE = process.env.SESSION_COOKIE_NAME || 'skdr_session'

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (routeNeed(pathname).kind === 'public') return NextResponse.next()
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next()
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu', code: 'SESSION_REQUIRED' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?redirect=${encodeURIComponent(pathname + search)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/', '/((?!_next/|api/v1/|api/auth/|osm-tiles/|boundaries|wilayah-data|wind-data|fonts/|favicon|icon|.*\\.(?:png|jpg|jpeg|webp|svg|ico|json|geojson|woff2?)$).*)'],
}
