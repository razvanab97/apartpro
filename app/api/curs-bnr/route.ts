import { NextResponse } from 'next/server'

type Rates = { EUR: number; USD: number; GBP: number }

// Cache simplu in memoria procesului - cursul BNR se actualizeaza o data pe zi
// toate: toate monedele din XML-ul BNR (lei pentru 1 unitate, multiplicatorul aplicat: HUF/JPY etc. sunt la 100)
let cache: { rates: Rates; toate: Record<string, number>; date: string | null; ts: number } | null = null
const CACHE_MS = 60 * 60 * 1000 // 1 ora
const FALLBACK: Rates = { EUR: 5.0, USD: 4.6, GBP: 5.8 }

function toateRatele(txt: string): Record<string, number> {
  const o: Record<string, number> = {}
  for (const m of txt.matchAll(/<Rate currency="([A-Z]{3})"(?:\s+multiplier="(\d+)")?[^>]*>([\d.]+)<\/Rate>/g)) {
    const v = parseFloat(m[3]) / (Number(m[2]) || 1); if (v > 0) o[m[1]] = v
  }
  return o
}

function extractRate(txt: string, currency: string): number | null {
  const match = txt.match(new RegExp(`<Rate currency="${currency}"[^>]*>([\\d.]+)</Rate>`))
  return match ? parseFloat(match[1]) : null
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ rates: cache.rates, toate: cache.toate, curs: cache.rates.EUR, date: cache.date, cached: true })
  }
  try {
    const res = await fetch('https://curs.bnr.ro/nbrfxrates.xml', { signal: AbortSignal.timeout(8000) })
    const txt = await res.text()
    const eur = extractRate(txt, 'EUR')
    const usd = extractRate(txt, 'USD')
    const gbp = extractRate(txt, 'GBP')
    if (!eur || !usd || !gbp) throw new Error('Curs lipsa in raspunsul BNR')
    const dateMatch = txt.match(/<PublishingDate>([\d-]+)<\/PublishingDate>/)
    const rates: Rates = { EUR: eur, USD: usd, GBP: gbp }
    const date = dateMatch ? dateMatch[1] : null
    const toate = toateRatele(txt)
    cache = { rates, toate, date, ts: Date.now() }
    return NextResponse.json({ rates, toate, curs: rates.EUR, date, cached: false })
  } catch (err) {
    if (cache) return NextResponse.json({ rates: cache.rates, toate: cache.toate, curs: cache.rates.EUR, date: cache.date, cached: true, stale: true })
    return NextResponse.json({ rates: FALLBACK, toate: { ...FALLBACK }, curs: FALLBACK.EUR, date: null, cached: false, error: true })
  }
}
