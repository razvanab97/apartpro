import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const OUR = ['ab homes','abhomes','ab-homes','ex59','gs08','hd02','l83','l88','l94','l99','n32','n33','nt9','vm07','c64','cg40']

// POST — Claude in Chrome trimite rezultatele JSON aici
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { jobId, checkin, checkout, rawJson } = body

    // Parseaza JSON-ul trimis de Claude in Chrome
    let parsed: any = null
    try {
      const s = rawJson.indexOf('{'), e = rawJson.lastIndexOf('}')
      if (s !== -1 && e !== -1) parsed = JSON.parse(rawJson.slice(s, e + 1))
    } catch {
      try { parsed = JSON.parse(rawJson) } catch {}
    }

    if (!parsed?.results?.length) {
      return NextResponse.json({ error: 'JSON invalid sau fără rezultate' }, { status: 400 })
    }

    const results = parsed.results.slice(0, 20).map((r: any, i: number) => {
      const lower = (r.name || '').toLowerCase()
      const match = OUR.find(id => lower.includes(id))
      return {
        rank: i + 1, name: r.name,
        price: typeof r.price === 'number' ? r.price : parseInt(r.price) || 0,
        priceText: r.priceText || `${r.price} lei`,
        isOurs: !!match, matchedCode: match?.toUpperCase(),
      }
    })

    // total poate veni ca numar, ca string cu separator de mii ("1.234"/"1,234") sau lipsi complet
    const totalRaw = parsed.total
    let total = typeof totalRaw === 'number' ? totalRaw
      : typeof totalRaw === 'string' ? (parseInt(totalRaw.replace(/[^\d]/g, ''), 10) || 0)
      : 0
    // Fallback: daca "total" nu a fost completat corect, mai cautam textul exact de pe
    // pagina Booking ("Iaşi: au fost găsite NUMĂR proprietăţi" / "X properties found")
    // in cazul in care agentul a trimis si bucati de text brut in rawJson
    if (!total) {
      const m = rawJson.match(/g[aă]site\s*([\d.,\s]+)\s*propriet[aă]ț/i) || rawJson.match(/([\d.,\s]+)\s*properties found/i)
      if (m) total = parseInt(m[1].replace(/[^\d]/g, ''), 10) || 0
    }
    const lowestPrice = Math.min(...results.map((r: any) => r.price))
    const ourResults = results.filter((r: any) => r.isOurs)
    const weAreLowest = ourResults.some((r: any) => r.price === lowestPrice)
    const ourLowestRank = ourResults.length ? Math.min(...ourResults.map((r: any) => r.rank)) : null

    const db = getSupabase()

    // Salveaza in istoric
    await db.from('booking_monitor_history').insert({
      checkin, checkout,
      total_properties: total || null,
      lowest_price: lowestPrice,
      top5: results,
      we_are_lowest: weAreLowest,
      our_lowest_rank: ourLowestRank || null,
    })

    // Actualizeaza job-ul ca done (pentru polling din pagina)
    if (jobId) {
      await db.from('booking_monitor_jobs').update({
        status: 'done',
        results,
        total_properties: total,
        lowest_price: lowestPrice,
        we_are_lowest: weAreLowest,
        our_lowest_rank: ourLowestRank || null,
        finished_at: new Date().toISOString(),
      }).eq('id', jobId)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — pagina face polling pe jobId
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId lipsește' }, { status: 400 })

  const db = getSupabase()
  const { data } = await db.from('booking_monitor_jobs')
    .select('*').eq('id', jobId).single()

  return NextResponse.json(data || { status: 'pending' })
}
