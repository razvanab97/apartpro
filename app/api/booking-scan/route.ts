import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function parsePrice(text: string): number {
  const cleaned = text.replace(/\./g, '').replace(',', '.').replace(/[^\d]/g, '')
  return parseInt(cleaned) || 0
}

function buildUrl(checkin: string, checkout: string): string {
  return `https://www.booking.com/searchresults.ro.html?ss=Ia%C8%99i%2C+Rom%C3%A2nia&checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1&order=price`
}

function extractFromHtml(html: string): { total: number; results: any[] } {
  let total = 0
  const totalMatch = html.match(/au fost găsite?\s*(\d+)\s*proprietăț/i) ||
                     html.match(/(\d+)\s*proprietăț.*găsite?/i) ||
                     html.match(/>(\d+)\s*proprietăț/i)
  if (totalMatch) total = parseInt(totalMatch[1])

  const results: any[] = []

  const cardRegex = /data-testid="property-card"([\s\S]*?)(?=data-testid="property-card"|id="sr_pagination|<footer)/g
  let match
  while ((match = cardRegex.exec(html)) !== null && results.length < 5) {
    const block = match[1]
    const nameMatch = block.match(/data-testid="title"[^>]*>\s*([^<]+)\s*</) ||
                      block.match(/class="[^"]*f6431b446c[^"]*"[^>]*>\s*([^<]+)\s*</) ||
                      block.match(/class="[^"]*fcab3ed991[^"]*"[^>]*>\s*([^<]+)\s*</)
    const priceMatch = block.match(/data-testid="price-and-discounted-price"[^>]*>[\s\S]*?<[^>]*>\s*([\d.,]+)\s*lei/) ||
                       block.match(/aria-label="Prețul curent este:\s*([\d.,]+)\s*lei"/) ||
                       block.match(/class="[^"]*f894d5f9dc[^"]*"[^>]*>[\s\S]*?([\d.,]+)\s*lei/) ||
                       block.match(/<span[^>]*>\s*([\d.,]+)\s*<\/span>\s*lei/)
    if (nameMatch && priceMatch) {
      const name = nameMatch[1].replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim()
      const price = parsePrice(priceMatch[1])
      if (name && price > 50 && price < 10000 && !results.find(r => r.name === name)) {
        results.push({ rank: results.length + 1, name, price, priceText: `${price} lei` })
      }
    }
  }

  if (results.length < 3) {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
      .split('\n').map(l => l.trim()).filter(Boolean)

    const fallback: any[] = []
    for (let i = 0; i < text.length && fallback.length < 5; i++) {
      const pm = text[i].match(/^(\d[\d.]+)\s*lei$/) ||
                 text[i].match(/Preț actual\s+([\d.]+)\s*lei/) ||
                 text[i].match(/^([\d.]+)\s*lei\s*$/)
      if (!pm) continue
      const price = parsePrice(pm[1])
      if (price < 50 || price > 10000) continue
      let name = ''
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        const c = text[j]
        if (c.length < 5 || c.length > 120) continue
        if (/^\d/.test(c)) continue
        if (/^(Iaşi|Iași|Arată|Include|Anulare|Rezerv|Camere|Preț|Nou|Vizib|Aceast|Proprietate|Studio întreg|Apart|Cameră|Dormitor|1 noapte|Se deschide|Locaţie|Superb|Fabulos|Bine|Excep|Plăcut|Scor|Suită)/i.test(c)) continue
        if (c.includes('km de centru') || c.includes('m de centru') || c.includes('paturi') || c.includes('baie') || c.includes('bucătărie') || c.includes('evaluări')) continue
        name = c; break
      }
      if (name && !fallback.find(r => r.name === name) && !results.find(r => r.name === name)) {
        fallback.push({ rank: fallback.length + 1, name, price, priceText: `${price} lei` })
      }
    }
    if (fallback.length > results.length) {
      return { total, results: fallback.slice(0, 5).map((r, i) => ({ ...r, rank: i + 1 })) }
    }
  }

  return { total, results: results.slice(0, 5) }
}

export async function POST(req: NextRequest) {
  try {
    const { checkin, checkout } = await req.json()
    if (!checkin || !checkout) {
      return NextResponse.json({ error: 'checkin și checkout sunt obligatorii' }, { status: 400 })
    }

    const bookingUrl = buildUrl(checkin, checkout)
    const resp = await fetch(bookingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      }
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `Booking.com error: ${resp.status}` }, { status: 502 })
    }

    const html = await resp.text()
    const { total, results } = extractFromHtml(html)

    const OUR = ['ab homes','abhomes','ab-homes','ex59','gs08','hd02','l83','l88','l94','l99','n32','n33','nt9','vm07','c64','cg40']
    const enriched = results.map(r => {
      const lower = r.name.toLowerCase()
      const match = OUR.find(id => lower.includes(id))
      return { ...r, isOurs: !!match, matchedCode: match?.toUpperCase() }
    })

    const lowestPrice = enriched.length ? Math.min(...enriched.map(r => r.price)) : null
    const ourResults = enriched.filter(r => r.isOurs)
    const weAreLowest = ourResults.some(r => r.price === lowestPrice)
    const ourLowestRank = ourResults.length ? Math.min(...ourResults.map(r => r.rank)) : null

    // Salveaza in Supabase - initializat in functie, nu la nivel de modul
    const db = getSupabase()
    await db.from('booking_monitor_history').insert({
      checkin, checkout,
      total_properties: total || null,
      lowest_price: lowestPrice,
      top5: enriched,
      we_are_lowest: weAreLowest,
      our_lowest_rank: ourLowestRank || null,
    })

    return NextResponse.json({ results: enriched, total, lowestPrice, weAreLowest, ourLowestRank })
  } catch (err: any) {
    console.error('[booking-scan]', err)
    return NextResponse.json({ error: err.message || 'Eroare internă' }, { status: 500 })
  }
}
