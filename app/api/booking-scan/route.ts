import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Acest endpoint salveaza rezultatele in Supabase
// Scraping-ul se face client-side din browser (Booking blocheaza server-side)
export async function POST(req: NextRequest) {
  try {
    const { checkin, checkout, results, total, lowestPrice, weAreLowest, ourLowestRank } = await req.json()

    if (!checkin || !checkout) {
      return NextResponse.json({ error: 'checkin și checkout sunt obligatorii' }, { status: 400 })
    }

    const db = getSupabase()
    const { error } = await db.from('booking_monitor_history').insert({
      checkin,
      checkout,
      total_properties: total || null,
      lowest_price: lowestPrice || null,
      top5: results || [],
      we_are_lowest: weAreLowest || false,
      our_lowest_rank: ourLowestRank || null,
    })

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[booking-scan]', err)
    return NextResponse.json({ error: err.message || 'Eroare internă' }, { status: 500 })
  }
}
