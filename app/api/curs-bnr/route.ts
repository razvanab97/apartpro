import { NextResponse } from 'next/server'

type Rates = { EUR: number; USD: number; GBP: number }

// Cache simplu in memoria procesului - cursul BNR se actualizeaza o data pe zi
let cache: { rates: Rates; date: string | null; ts: number } | null = null
const CACHE_MS = 60 * 60 * 1000 // 1 ora
const FALLBACK: Rates = { EUR: 5.0, USD: 4.6, GBP: 5.8 }

function extractRate(txt: string, currency: string): number | null {
  const match = txt.match(new RegExp(`<Rate currency="${currency}"[^>]*>([\\d.]+)</Rate>`))
  return match ? parseFloat(match[1]) : null
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ rates: cache.rates, curs: cache.rates.EUR, date: cache.date, cached: true })
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
    cache = { rates, date, ts: Date.now() }
    return NextResponse.json({ rates, curs: rates.EUR, date, cached: false })
  } catch (err) {
    if (cache) return NextResponse.json({ rates: cache.rates, curs: cache.rates.EUR, date: cache.date, cached: true, stale: true })
    return NextResponse.json({ rates: FALLBACK, curs: FALLBACK.EUR, date: null, cached: false, error: true })
  }
}
