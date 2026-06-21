import { NextResponse } from 'next/server'

// Cache simplu in memoria procesului - cursul BNR se actualizeaza o data pe zi
let cache: { curs: number; ts: number } | null = null
const CACHE_MS = 60 * 60 * 1000 // 1 ora

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ curs: cache.curs, cached: true })
  }
  try {
    const res = await fetch('https://www.bnr.ro/nbrfxrates.xml', { signal: AbortSignal.timeout(8000) })
    const txt = await res.text()
    const match = txt.match(/<Rate currency="EUR">([\d.]+)<\/Rate>/)
    if (!match) throw new Error('Rate EUR not found in BNR response')
    const curs = parseFloat(match[1])
    cache = { curs, ts: Date.now() }
    return NextResponse.json({ curs, cached: false })
  } catch (err) {
    // Daca avem un cache vechi, e mai bun decat fallback-ul fix
    if (cache) return NextResponse.json({ curs: cache.curs, cached: true, stale: true })
    return NextResponse.json({ curs: 5.0, cached: false, error: true })
  }
}
