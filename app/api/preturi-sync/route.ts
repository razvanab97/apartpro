import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = 'https://lsmraxevzkmupaidianv.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbXJheGV2emttdXBhaWRpYW52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjE3MDc4NCwiZXhwIjoyMDYxNzQ2Nzg0fQ.YoGnB5HgEMomJMVBGDijVRi38sKfQVxVd0jJhBXbhsA'

async function sb(method: string, path: string, body?: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export async function GET() {
  const data = await sb('GET', 'apartamente?select=id,nota,nume,link_booking,link_airbnb&status=eq.activ&order=nota')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const { apartament_id, data_checkin, pret_booking, pret_airbnb, pret_booking_original } = await req.json()
  if (!apartament_id || !data_checkin) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  
  const result = await sb('POST', 'preturi_live', {
    apartament_id,
    data_checkin,
    pret_booking: pret_booking || null,
    pret_airbnb: pret_airbnb || null,
    pret_booking_original: pret_booking_original || null,
    updated_at: new Date().toISOString()
  })
  
  return NextResponse.json({ ok: true, result })
}
