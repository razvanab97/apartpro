import { NextRequest, NextResponse } from 'next/server'

// Adresa pentru oaspeti (cerut direct: „să nu apară apartpro.work în link, ca poate ajunge în sistemul nostru dacă
// șterge terminația”). Pe ea se servesc DOAR ghidurile: ghid.abhomesiasi.ro/GS08 -> pagina ghidului; orice alta
// pagina (Dashboard, rezervari, /admin, proxy-ul bazei de date...) nu exista acolo.
const GAZDE_GHID = ['ghid.abhomesiasi.ro']
const STATIC_PERMIS = /^\/(_next\/|favicon\.ico$|manifest\.json$|tema-luminoasa\.js$|logo\.jpg$|icon-\d+\.png$|api\/ghid\/[^/]+$)/

function gazdaOaspeti(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (STATIC_PERMIS.test(pathname)) return NextResponse.next()
  if (pathname === '/') return NextResponse.redirect('https://abhomesiasi.ro', 302)
  const vechi = /^\/ghid\/([A-Za-z0-9-]{2,60})\/?$/.exec(pathname)
  if (vechi) return NextResponse.redirect(new URL('/' + vechi[1], req.url), 301)
  const m = /^\/([A-Za-z0-9-]{2,60})\/?$/.exec(pathname)
  if (m) {
    const res = NextResponse.rewrite(new URL('/ghid/' + m[1], req.url))
    res.headers.set('Cache-Control', 'no-store, must-revalidate')
    return res
  }
  return new NextResponse('Pagina nu există.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const gazda = (req.headers.get('host') || '').split(':')[0].toLowerCase()
  if (GAZDE_GHID.includes(gazda)) return gazdaOaspeti(req)

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
