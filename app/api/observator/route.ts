import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Primeste evenimentele adunate de components/Observator.tsx (in pachete) si le scrie in jurnal_activitate.
// Doar observare - nimic nu se automatizeaza pe baza lor pana nu ceri tu (cerut direct: „acum doar să observe”).
const TIPURI = new Set(['pagina', 'click', 'alegere', 'scriere', 'whatsapp', 'eroare', 'agent', 'sync'])

export async function POST(req: NextRequest) {
  let body: any = null
  try { body = JSON.parse(await req.text()) } catch { return NextResponse.json({ ok: false, error: 'json' }, { status: 400 }) }
  const ev = (Array.isArray(body?.evenimente) ? body.evenimente : []).slice(0, 500)
    .filter((e: any) => e && TIPURI.has(e.tip))
    .map((e: any) => ({
      eid: String(e.eid || '').slice(0, 60) || null,
      created_at: typeof e.ts === 'number' ? new Date(e.ts).toISOString() : new Date().toISOString(),
      sesiune: String(e.sesiune || '').slice(0, 40) || null, rol: String(e.rol || '').slice(0, 20) || null,
      dispozitiv: String(e.dispozitiv || '').slice(0, 40) || null, tip: e.tip,
      pagina: String(e.pagina || '').slice(0, 200) || null, tinta: String(e.tinta || '').slice(0, 300) || null,
      detalii: e.detalii && typeof e.detalii === 'object' ? e.detalii : null,
    }))
  if (!ev.length) return NextResponse.json({ ok: true, n: 0 })
  // eid unic -> un pachet retrimis (ex. raspunsul s-a pierdut la inchiderea tabului) nu creeaza dubluri
  const { error } = await supabase.from('jurnal_activitate').upsert(ev, { onConflict: 'eid', ignoreDuplicates: true })
  if (error) return NextResponse.json({ ok: false, error: error.message, lipsa_tabel: /does not exist|schema cache|relation/i.test(error.message) }, { status: 503 })
  return NextResponse.json({ ok: true, n: ev.length })
}
