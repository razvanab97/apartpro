import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Staff pages - allow only /staff
  const staffCookie = req.cookies.get('staff_auth')?.value
  const isStaffSession = staffCookie === '1111'

  // If staff session cookie set, block all non-staff pages
  if (isStaffSession && !pathname.startsWith('/staff') && !pathname.startsWith('/api') && !pathname.startsWith('/_next')) {
    return NextResponse.redirect(new URL('/staff', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|icon-192.png).*)'],
}
