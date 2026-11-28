import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { payloadRezervare } from '@/lib/rezervareEdit'
import { CHEI_BLOCARE, blocariDinSetari } from '@/lib/mentenanta'
import { cheieOferta, TOKEN_RE, stareEfectiva, valideazaClient, rezervareDinOferta, clientFacturaDinOferta, conflicte, noptiOferta, type Oferta } from '@/lib/ofertaLink'
import { adaugaInbox } from '@/lib/reamintiri'
import { eGazdaGhid } from '@/lib/gazdeGhid'

// API-ul paginii publice /o/<token> (oferta de rezervare trimisa clientului) - vezi lib/ofertaLink.ts.
// GET: doar ce scrie in oferta (apartament, perioada, persoane, pret, valabilitate) - nimic despre alte rezervari.
// POST: clientul confirma cu datele lui -> rezervare noua + domiciliu pentru factura + semnatura + notificare.

export const dynamic = 'force-dynamic'
const fara = { 'Cache-Control': 'no-store' }
const scurt = (n: string) => String(n || '').replace(/\s*by AB HOMES\s*/i, '').trim()
const ziRO = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' })

async function citeste(token: string): Promise<Oferta | null> {
  if (!TOKEN_RE.test(token)) return null
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', cheieOferta(token)).maybeSingle()
  try { const o = JSON.parse(data?.valoare || 'null'); return o && o.token === token ? o : null } catch { return null }
}
async function ore() {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', 'document_confirmare').maybeSingle()
  try { const v = JSON.parse(data?.valoare || '{}'); return { ci: String(v.oraCi || '15:00'), co: String(v.oraCo || '11:00') } } catch { return { ci: '15:00', co: '11:00' } }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await citeste(token)
  if (!o) return NextResponse.json({ ok: false, error: 'Oferta nu există.' }, { status: 404, headers: fara })
  const [{ data: apt }, h] = await Promise.all([supabase.from('apartamente').select('nume').eq('id', o.apartament_id).maybeSingle(), ore()])
  return NextResponse.json({
    ok: true, stare: stareEfectiva(o), apartament: scurt(apt?.nume || ''), checkin: o.checkin, checkout: o.checkout, nopti: noptiOferta(o.checkin, o.checkout),
    adulti: o.adulti, copii: o.copii, total: o.total, moneda: o.moneda || 'RON', expira: o.expira, limba: o.limba || 'ro', nota: o.nota || '',
    salut: o.titlu_client || '', oraCi: h.ci, oraCo: h.co,
  }, { headers: fara })
}

async function anunta(req: NextRequest, titlu: string, corp: string, url: string) {
  await supabase.from('notificari').insert({ mesaj: `${titlu} — ${corp}`, tip: 'rezervare', citit: false, url })
  try { await adaugaInbox([{ text: `${titlu}\n${corp}` }]) } catch {}
  try {
    // pe adresa oaspetilor /api/push-send nu e servit (middleware) - trimitem prin aplicatia interna
    const baza = eGazdaGhid(req.headers.get('host')) ? (process.env.APP_URL || 'https://apartpro.work') : req.url
    await fetch(new URL('/api/push-send', baza), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titlu, body: corp, url, tag: 'oferta-' + Date.now() }), signal: AbortSignal.timeout(6000) })
  } catch {}
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await citeste(token)
  if (!o) return NextResponse.json({ ok: false, error: 'Oferta nu există.' }, { status: 404 })
  const en = o.limba === 'en', t = (ro: string, eng: string) => en ? eng : ro
  const st = stareEfectiva(o)
  if (st === 'confirmata') return NextResponse.json({ ok: true, deja: true })
  if (st === 'anulata') return NextResponse.json({ ok: false, error: t('Oferta a fost retrasă. Vă rugăm să ne contactați.', 'This offer has been withdrawn. Please contact us.') }, { status: 410 })
  if (st === 'expirata') return NextResponse.json({ ok: false, error: t('Oferta a expirat. Vă rugăm să ne contactați pentru o ofertă nouă.', 'This offer has expired. Please contact us for a new one.') }, { status: 410 })

  const b = await req.json().catch(() => ({}))
  const v = valideazaClient(b, o.limba)
  if (!v.ok) return NextResponse.json({ ok: false, camp: v.camp, error: v.mesaj }, { status: 400 })
  const d = v.date

  const { data: apt } = await supabase.from('apartamente').select('*').eq('id', o.apartament_id).maybeSingle()
  if (!apt) return NextResponse.json({ ok: false, error: t('Apartamentul nu mai este disponibil. Vă rugăm să ne contactați.', 'The apartment is no longer available. Please contact us.') }, { status: 409 })

  // perioada inca libera? (intre trimiterea ofertei si confirmare poate intra alta rezervare)
  const [{ data: rez }, { data: bl }] = await Promise.all([
    supabase.from('rezervari').select('data_checkin,data_checkout,status_rezervare,camera_semnalata').eq('apartament_id', o.apartament_id).lt('data_checkin', o.checkout).gt('data_checkout', o.checkin),
    supabase.from('setari').select('cheie,valoare').in('cheie', CHEI_BLOCARE),
  ])
  const c = conflicte(o.checkin, o.checkout, (rez || []) as any[], blocariDinSetari(bl).filter(x => x.apt === o.apartament_id))
  if (!c.liber) {
    await anunta(req, '⚠ Ofertă prin link — perioada nu mai e liberă', `${d.nume} a încercat să confirme ${scurt(apt.nume)} ${ziRO(o.checkin)} – ${ziRO(o.checkout)}, dar perioada e ocupată. Sună-l: ${d.telefon}`, '/calendar')
    return NextResponse.json({ ok: false, error: t('Ne pare rău, între timp perioada a fost rezervată. V-am anunțat echipa și vă vom contacta imediat.', 'Sorry, the period has just been booked. Our team has been notified and will contact you shortly.') }, { status: 409 })
  }

  // marcam intai oferta (ca un dublu-click sa nu creeze doua rezervari), apoi rezervarea
  const acum = new Date().toISOString()
  const { error: e1 } = await supabase.from('setari').upsert({ cheie: cheieOferta(token), valoare: JSON.stringify({ ...o, stare: 'confirmata', confirmat_la: acum }) }, { onConflict: 'cheie' })
  if (e1) return NextResponse.json({ ok: false, error: t('Nu am putut salva. Încercați din nou.', 'Could not save. Please try again.') }, { status: 500 })
  const rand = payloadRezervare(rezervareDinOferta(o, d, apt), [apt])
  const { data: nou, error } = await supabase.from('rezervari').insert(rand).setHeader('x-sursa', 'oferta').select('id').single()
  if (error || !nou) {
    await supabase.from('setari').upsert({ cheie: cheieOferta(token), valoare: JSON.stringify(o) }, { onConflict: 'cheie' })
    return NextResponse.json({ ok: false, error: t('Nu am putut înregistra rezervarea. Încercați din nou sau contactați-ne.', 'Could not register the booking. Please try again or contact us.') }, { status: 500 })
  }
  await Promise.all([
    supabase.from('setari').upsert({ cheie: cheieOferta(token), valoare: JSON.stringify({ ...o, stare: 'confirmata', confirmat_la: acum, rezervare_id: nou.id }) }, { onConflict: 'cheie' }),
    supabase.from('setari').upsert({ cheie: `client_factura_${nou.id}`, valoare: JSON.stringify(clientFacturaDinOferta(d)) }, { onConflict: 'cheie' }),
    d.semnatura ? supabase.from('setari').upsert({ cheie: `semnatura_${nou.id}`, valoare: JSON.stringify({ png: d.semnatura, la: acum }) }, { onConflict: 'cheie' }) : Promise.resolve(),
  ])
  const n = noptiOferta(o.checkin, o.checkout)
  await anunta(req, '✅ Rezervare confirmată prin link', `${d.nume} · ${scurt(apt.nume)} · ${ziRO(o.checkin)} – ${ziRO(o.checkout)} (${n} ${n === 1 ? 'noapte' : 'nopți'}) · ${Number(o.total).toLocaleString('ro-RO')} ${o.moneda || 'RON'}`, '/calendar')
  return NextResponse.json({ ok: true })
}
