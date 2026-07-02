import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const res = NextResponse.next()
  // Safari pastreaza in cache de disc paginile vechi mai agresiv decat Chrome,
  // chiar si peste hard-refresh - fortam no-store ca sa nu serveasca niciodata
  // un HTML/bundle vechi dupa un deploy nou.
  if (!pathname.startsWith('/_next/static')) {
    res.headers.set('Cache-Control', 'no-store, must-revalidate')
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|icon-192.png).*)'],
}
