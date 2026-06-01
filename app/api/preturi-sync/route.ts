import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data } = await supabase
    .from('apartamente')
    .select('id,nota,nume,link_booking,link_airbnb')
    .eq('status', 'activ')
    .order('nota')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const { apartament_id, data_checkin, pret_booking, pret_airbnb, pret_booking_original } = await req.json()
  if (!apartament_id || !data_checkin) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  
  const { error } = await supabase.from('preturi_live').upsert({
    apartament_id,
    data_checkin,
    pret_booking: pret_booking || null,
    pret_airbnb: pret_airbnb || null,
    pret_booking_original: pret_booking_original || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'apartament_id,data_checkin' })
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
