import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url, platform, checkin, checkout } = await req.json()
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  // Foloseste datele primite sau azi/maine
  const ciDate = checkin ? new Date(checkin+'T12:00:00') : new Date()
  const coDate = checkout ? new Date(checkout+'T12:00:00') : new Date(ciDate.getTime()+86400000)
  const today = ciDate
  const tomorrow = coDate
  try {
    let fetchUrl = url

    // Booking: adauga date de azi daca nu sunt in URL
    if (platform === 'booking' || url.includes('booking.com')) {
      if (!url.includes('checkin=')) {
        const sep = url.includes('?') ? '&' : '?'
        fetchUrl = url + sep + `checkin=${fmt(today)}&checkout=${fmt(tomorrow)}&group_adults=2&no_rooms=1`
      }
    }

    // Airbnb: adauga date de azi
    if (platform === 'airbnb' || url.includes('airbnb.')) {
      if (!url.includes('check_in=')) {
        const sep = url.includes('?') ? '&' : '?'
        fetchUrl = url + sep + `check_in=${fmt(today)}&check_out=${fmt(tomorrow)}&adults=2`
      }
    }

    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      }
    })

    const html = await res.text()
    let pret: number | null = null
    let pretOriginal: number | null = null

    if (url.includes('booking.com') || platform === 'booking') {
      // Cauta pretul in HTML Booking
      // Pattern: "192 lei" sau similar
      const patterns = [
        /(\d+)\s*lei[\s\S]{0,50}?Include taxe/i,
        /Preț actual[\s\S]{0,20}?(\d+)\s*lei/i,
        /"displayPrice"[^}]*"amount":(\d+)/,
        /data-price="(\d+)"/,
        /"price":\s*(\d+)/,
        /(\d{2,4})\s*RON/i,
      ]
      for (const p of patterns) {
        const m = html.match(p)
        if (m) { pret = parseInt(m[1]); break }
      }
      // Cauta pret original (barat)
      const origM = html.match(/Preț inițial[^\d]*(\d+)\s*lei/i)
      if (origM) pretOriginal = parseInt(origM[1])
    }

    if (url.includes('airbnb.') || platform === 'airbnb') {
      const patterns = [
        /"price":\s*\{[^}]*"amount":\s*(\d+)/,
        /(\d+)\s*lei\s*\/\s*noapte/i,
        /"lowestPrice":\s*(\d+)/,
        /"discountedPrice":\s*(\d+)/,
        /class="[^"]*price[^"]*"[^>]*>(\d+)/i,
      ]
      for (const p of patterns) {
        const m = html.match(p)
        if (m) { pret = parseInt(m[1]); break }
      }
    }

    console.log(`[preturi-live] ${platform} ${fmt(today)}: pret=${pret}, url=${fetchUrl.slice(0,80)}`)
    return NextResponse.json({
      pret,
      pretOriginal,
      url: fetchUrl,
      data: fmt(today),
      ok: pret !== null,
      debug: pret === null ? 'no price found in HTML' : 'ok'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, pret: null, ok: false })
  }
}
