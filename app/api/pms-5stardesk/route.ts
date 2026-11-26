import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { roomTypes, citesteRezervare, tokenEgal, CHEIE_JURNAL, MAX_JURNAL } from '@/lib/pms5sd'

// 5starDesk PMS Connect - endpoint-ul nostru (URL-ul dat la 5starDesk la activare), MOD TEST - vezi lib/pms5sd.ts.
// 5starDesk -> noi: { action: 'GetRooms' } si { Method: 'reservation', Body: {...} }, cu „Authorization: Bearer <token>”.
// Tokenul NU e in cod: variabila de mediu FIVESTAR_PMS_TOKEN (Vercel). Fara ea endpoint-ul refuza tot.
// IN TEST: nicio scriere in `rezervari` - rezervarile primite merg doar in jurnalul de test (setari „pms5sd_test_rezervari”).

export const dynamic = 'force-dynamic'
const fara = { 'Cache-Control': 'no-store' }
const tokenServer = () => String(process.env.FIVESTAR_PMS_TOKEN || '').trim()

async function jurnal(intrare: Record<string, any>) {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_JURNAL).maybeSingle()
  let l: any[] = []; try { const v = JSON.parse(data?.valoare || '[]'); if (Array.isArray(v)) l = v } catch {}
  const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_JURNAL, valoare: JSON.stringify([{ la: new Date().toISOString(), ...intrare }, ...l].slice(0, MAX_JURNAL)) }, { onConflict: 'cheie' })
  if (error) throw new Error(error.message)
}

// starea conexiunii pentru pagina de test (fara secrete: doar daca exista)
export async function GET() {
  return NextResponse.json({ ok: true, mod: 'test', token_configurat: !!tokenServer(), url_5sd_configurat: !!String(process.env.FIVESTAR_PMS_URL || '').trim() }, { headers: fara })
}

export async function POST(req: NextRequest) {
  const tk = tokenServer()
  if (!tk) return NextResponse.json({ status: 'Eroare: conexiunea PMS nu este configurata' }, { status: 503, headers: fara })
  const body = await req.json().catch(() => null)
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!tokenEgal(bearer, tk) && !tokenEgal(String(body?.Token || ''), tk)) {
    try { await jurnal({ tip: 'refuzat', detaliu: 'token lipsă sau greșit' }) } catch {}
    return NextResponse.json({ status: 'Eroare: token invalid' }, { status: 401, headers: fara })
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ status: 'Eroare: corp JSON invalid' }, { status: 400, headers: fara })

  const actiune = String(body.action || body.Method || '')
  if (/^getrooms$/i.test(actiune)) {
    const { data } = await supabase.from('apartamente').select('id,nume,status,capacitate_max').order('nume')
    const rt = roomTypes((data || []) as any[])
    try { await jurnal({ tip: 'GetRooms', detaliu: `${rt.length} apartamente trimise`, hotel_id: String(body.hotel_id || '') }) } catch {}
    return NextResponse.json({ status: 'OK', body: { RoomTypes: rt } }, { headers: fara })
  }
  if (/^reservation$/i.test(actiune)) {
    const c = citesteRezervare(body)
    // salvam intai, raspundem OK doar dupa (5starDesk nu reincearca)
    try { await jurnal(c.ok ? { tip: 'reservation', r: c.r } : { tip: 'reservation_invalida', detaliu: c.eroare }) }
    catch (e: any) { return NextResponse.json({ status: 'Eroare: nu am putut salva (' + String(e?.message || e).slice(0, 80) + ')' }, { status: 500, headers: fara }) }
    return NextResponse.json(c.ok ? { status: 'OK' } : { status: 'Eroare: ' + c.eroare }, { status: c.ok ? 200 : 400, headers: fara })
  }
  return NextResponse.json({ status: 'Eroare: actiune necunoscuta' }, { status: 400, headers: fara })
}
