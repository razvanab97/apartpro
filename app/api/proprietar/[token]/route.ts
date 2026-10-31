import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CHEIE_LINKURI, CHEIE_BLOCARI, parseBlocari, type Blocare, type LinkProprietar } from '@/lib/blocariProprietar'
import { eGazdaGhid } from '@/lib/gazdeGhid'

// API-ul paginii publice /p/<token> (calendarul proprietarului) - vezi lib/blocariProprietar.ts.
// Proprietarul vede DOAR apartamentele lui si blocarile; zilele rezervate apar doar in mesajul de eroare (fara nume / sume).

export const dynamic = 'force-dynamic'
const ISO = /^\d{4}-\d{2}-\d{2}$/
const aziRO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())
const plusZile = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ziRO = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' })

async function citesteLink(token: string): Promise<LinkProprietar | null> {
  if (!/^[a-z0-9-]{8,80}$/i.test(token)) return null
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_LINKURI).maybeSingle()
  try { return (JSON.parse(data?.valoare || '{}') as Record<string, LinkProprietar>)[token] || null } catch { return null }
}
async function citesteBlocari() {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_BLOCARI).maybeSingle()
  return parseBlocari(data?.valoare)
}
async function rezervari(apts: string[], de: string, pana: string) {
  const { data } = await supabase.from('rezervari').select('apartament_id,data_checkin,data_checkout,status_rezervare,camera_semnalata')
    .in('apartament_id', apts).neq('status_rezervare', 'anulata').lt('data_checkin', pana).gt('data_checkout', de)
  return ((data || []) as any[]).filter(r => r.camera_semnalata !== 'NEALOCAT')
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await citesteLink(token)
  if (!link) return NextResponse.json({ ok: false, error: 'Link invalid' }, { status: 404 })
  const azi = aziRO(), de = plusZile(azi, -62)
  // pagina nu mai arata calendarul (cerut direct: varianta simpla) - nu trimitem rezervarile, doar blocarile
  const [{ data: a }, bl] = await Promise.all([
    supabase.from('apartamente').select('id,nume').in('id', link.apts),
    citesteBlocari(),
  ])
  return NextResponse.json({
    ok: true, nume: link.nume, azi,
    apartamente: link.apts.map(id => ({ id, nume: String((a || []).find((x: any) => x.id === id)?.nume || '').trim() })).filter(x => x.nume),
    blocari: bl.filter(b => link.apts.includes(b.apt) && b.pana_la >= de).map(b => ({ id: b.id, apt: b.apt, de_la: b.de_la, pana_la: b.pana_la, nota: b.nota, al_meu: b.token === token })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

async function anunta(req: NextRequest, mesaj: string, corp: string) {
  await supabase.from('notificari').insert({ mesaj, tip: 'blocare', citit: false, url: '/calendar' })
  try {
    // pe adresa oaspetilor (abhomes-checkin...) /api/push-send nu e servit (middleware) - trimitem prin aplicatia interna
    const baza = eGazdaGhid(req.headers.get('host')) ? (process.env.APP_URL || 'https://apartpro.work') : req.url
    await fetch(new URL('/api/push-send', baza), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: mesaj, body: corp, url: '/calendar', tag: 'blocare-' + Date.now(), tip: 'blocare' }), signal: AbortSignal.timeout(6000) })
  } catch {}
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await citesteLink(token)
  if (!link) return NextResponse.json({ ok: false, error: 'Link invalid' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const { data: aptRows } = await supabase.from('apartamente').select('id,nume').in('id', link.apts)
  const numeApt = (id: string) => String((aptRows || []).find((x: any) => x.id === id)?.nume || '').replace(/\s*by AB HOMES\s*/i, '').trim()
  const blocari = await citesteBlocari()

  if (b.actiune === 'deblocheaza') {
    const x = blocari.find(y => y.id === b.id && y.token === token)
    if (!x) return NextResponse.json({ ok: false, error: 'Blocarea nu există sau nu e a ta.' }, { status: 400 })
    const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_BLOCARI, valoare: JSON.stringify(blocari.filter(y => y.id !== x.id)) }, { onConflict: 'cheie' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    await anunta(req, `🔓 ${link.nume} a deblocat ${numeApt(x.apt)}: ${ziRO(x.de_la)} – ${ziRO(x.pana_la)}`, 'Zilele sunt din nou libere')
    return NextResponse.json({ ok: true })
  }

  if (b.actiune !== 'blocheaza' && b.actiune !== 'verifica') return NextResponse.json({ ok: false, error: 'Acțiune necunoscută' }, { status: 400 })
  const apt = String(b.apt || ''), de_la = String(b.de_la || ''), pana_la = String(b.pana_la || '')
  const nota = String(b.nota || '').trim().slice(0, 200)
  if (!link.apts.includes(apt)) return NextResponse.json({ ok: false, error: 'Apartament invalid' }, { status: 400 })
  if (!ISO.test(de_la) || !ISO.test(pana_la) || pana_la < de_la) return NextResponse.json({ ok: false, error: 'Perioadă invalidă' }, { status: 400 })
  if (de_la < aziRO()) return NextResponse.json({ ok: false, error: 'Nu se pot bloca zile din trecut.' }, { status: 400 })
  if (plusZile(de_la, 366) < pana_la) return NextResponse.json({ ok: false, error: 'Perioada e prea lungă (maxim un an).' }, { status: 400 })
  // nu peste rezervari existente sau peste alte blocari. Pagina nu are calendar, asa ca proprietarul afla din mesaj exact
  // perioada ocupata (cerut direct: „există rezervare pentru perioada x – y”) - noptile rezervate: check-in … check-out − 1
  const ocupate = (await rezervari([apt], de_la, plusZile(pana_la, 1))).sort((x: any, y: any) => x.data_checkin.localeCompare(y.data_checkin))
  const perioada = (de: string, pana: string) => de === pana ? ziRO(de) : `${ziRO(de)} – ${ziRO(pana)}`
  const z = ocupate.map((r: any) => perioada(r.data_checkin, plusZile(r.data_checkout, -1)))
  const eroareRez = z.length ? (z.length === 1 ? `Există rezervare pentru perioada ${z[0]}` : `Există rezervări pentru perioadele: ${z.join(', ')}`) : ''
  const deja = blocari.filter(x => x.apt === apt && x.de_la <= pana_la && de_la <= x.pana_la)
  const eroareBl = deja.length ? `Zilele ${deja.map(x => perioada(x.de_la, x.pana_la)).join(', ')} sunt deja blocate.` : ''
  // verificare pe loc, cand proprietarul alege datele (inainte de „Blochează”)
  if (b.actiune === 'verifica') return NextResponse.json({ ok: true, liber: !eroareRez && !eroareBl, mesaj: eroareRez || eroareBl })
  if (eroareRez) return NextResponse.json({ ok: false, error: eroareRez }, { status: 409 })
  if (eroareBl) return NextResponse.json({ ok: false, error: eroareBl }, { status: 409 })

  const noua: Blocare = { id: Math.random().toString(36).slice(2, 10), apt, de_la, pana_la, nota, token, nume: link.nume, creat_la: new Date().toISOString() }
  const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_BLOCARI, valoare: JSON.stringify([...blocari, noua]) }, { onConflict: 'cheie' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const nopti = Math.round((new Date(pana_la).getTime() - new Date(de_la).getTime()) / 86400000) + 1
  await anunta(req, `🔒 ${link.nume} a blocat ${numeApt(apt)}: ${ziRO(de_la)} – ${ziRO(pana_la)} (${nopti} ${nopti === 1 ? 'noapte' : 'nopți'})`, nota || 'Blocare din calendarul proprietarului')
  return NextResponse.json({ ok: true, blocare: noua })
}
