import { NextRequest, NextResponse } from 'next/server'
import { livreazaReamintiri } from '@/lib/reamintiri'

export const dynamic = 'force-dynamic'
const CRON_SECRET = process.env.CRON_SECRET || 'apartpro-cron-2026'

// Reamintirile programate din Asistent („amintește-mi pe 5 decembrie să încasez restul de la X”) - trimise dimineata
// (cron Vercel 07:00 UTC = 9-10 la Bucuresti): push pe telefon + 🔔 clopotel + mesaj in Asistent. Cele puse dupa
// aceasta ora pentru aceeasi zi pleaca la ~16:00, odata cu reamintirea de incasari. ?simulare=1 = doar arata ce ar trimite.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret')
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await livreazaReamintiri(req.nextUrl.origin, { simulare: req.nextUrl.searchParams.get('simulare') === '1' })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'eroare' }, { status: 500 }) }
}
