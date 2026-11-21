import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const CRON_SECRET = process.env.CRON_SECRET || 'apartpro-cron-2026'

// Reamintire de incasare la ~16:00 (cerut direct: „în situații în care avem rezervare cu plată, să primim notificare și
// mesaj în jurul orei 16:00, să fim siguri că nu uităm că avem de încasat”). Rezervarile care sosesc azi sau sunt deja
// cazate, cu plata neincasata (status plata ≠ achitat; Airbnb incaseaza singur, deci nu intra), cu restul de plata
// = total - avans. Plus avansurile de incasat cu termenul („până la data”) azi sau depasit. Trimite o notificare push (pe toate telefoanele) + cate un mesaj 💰 in clopotel, o singura data pe zi.
// Cron Vercel la 13:00 si 14:00 UTC (Hobby: pornesc oricand in ora respectiva) -> trimite doar daca la Bucuresti e
// 16:00-19:59 (iarna merge cel de 14, vara cel de 13); ?fortat=1 ignora ora (test manual), dar nu si „o data pe zi”;
// ?simulare=1 = doar calculeaza si arata ce s-ar trimite, fara nicio scriere si fara push.
const oraRo = (d = new Date()) => Number(d.toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }))
const aziRo = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
const lei = (n: number) => Math.round(n).toLocaleString('ro-RO')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret')
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const simulare = req.nextUrl.searchParams.get('simulare') === '1'
  const fortat = simulare || req.nextUrl.searchParams.get('fortat') === '1'
  const ora = oraRo(), azi = aziRo()
  if (!fortat && (ora < 16 || ora >= 20)) return NextResponse.json({ ok: true, sarit: `ora ${ora} la București (se trimite între 16 și 20)` })

  const cheie = `incasari_notif_${azi}`
  const { data: deja } = await supabase.from('setari').select('valoare').eq('cheie', cheie).maybeSingle()
  if (deja && !simulare) return NextResponse.json({ ok: true, sarit: 'deja trimis azi', detalii: deja.valoare })

  const { data, error } = await supabase.from('rezervari')
    .select('id,nume_client,data_checkin,data_checkout,canal,status_plata,valoare_bruta,suma_incasata,avans,camera_semnalata,apartament:apartamente(nume,nota)')
    .neq('status_rezervare', 'anulata').lte('data_checkin', azi).gt('data_checkout', azi).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const deIncasat = (data || []).filter((r: any) => r.status_plata !== 'achitat' && r.canal !== 'airbnb' && r.camera_semnalata !== 'NEALOCAT')
    .map((r: any) => {
      const total = Number(r.valoare_bruta) || Number(r.suma_incasata) || 0
      return { r, rest: Math.round((total - (Number(r.avans) || 0)) * 100) / 100, sosesteAzi: r.data_checkin === azi }
    }).filter(x => x.rest > 0)
    .sort((a, b) => Number(b.sosesteAzi) - Number(a.sosesteAzi) || String(a.r.apartament?.nota || '').localeCompare(String(b.r.apartament?.nota || '')))

  // avansurile de incasat (avans_cerut, „până la data” avans_termen) cu termenul azi sau trecut, inca neprimite integral,
  // pe rezervari ne-anulate care nu s-au terminat; query separat: fara migrarea avans_cerut doar se sare peste ele
  const { data: dav } = await supabase.from('rezervari')
    .select('id,nume_client,data_checkin,avans,avans_cerut,avans_termen,status_plata,camera_semnalata,apartament:apartamente(nume,nota)')
    .neq('status_rezervare', 'anulata').gt('avans_cerut', 0).lte('avans_termen', azi).gt('data_checkout', azi).limit(500)
  // cine e deja cazat / soseste azi apare mai sus cu tot restul -> nu se numara de doua ori
  const dejaInLista = new Set(deIncasat.map(x => x.r.id))
  const avansuri = (dav || []).filter((r: any) => !dejaInLista.has(r.id) && r.status_plata !== 'achitat' && r.camera_semnalata !== 'NEALOCAT')
    .map((r: any) => ({ r, lipsa: Math.round((Number(r.avans_cerut) - (Number(r.avans) || 0)) * 100) / 100 })).filter(x => x.lipsa > 0)
    .sort((a, b) => String(a.r.avans_termen).localeCompare(String(b.r.avans_termen)))
  const ziLuna = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
  const linieAvans = (x: typeof avansuri[number]) => `${x.r.apartament?.nota || x.r.apartament?.nume || '?'} · ${x.r.nume_client} — avans ${lei(x.lipsa)} lei, ${x.r.avans_termen === azi ? 'termen azi' : `termen depășit (${ziLuna(x.r.avans_termen)})`}`

  if (!deIncasat.length && !avansuri.length) {
    if (simulare) return NextResponse.json({ ok: true, simulare: true, n: 0, dejaTrimisAzi: !!deja })
    await supabase.from('setari').upsert({ cheie, valoare: JSON.stringify({ n: 0, la: new Date().toISOString() }) }, { onConflict: 'cheie' })
    return NextResponse.json({ ok: true, n: 0 })
  }
  const total = deIncasat.reduce((s, x) => s + x.rest, 0) + avansuri.reduce((s, x) => s + x.lipsa, 0)
  const linie = (x: typeof deIncasat[number]) => `${x.r.apartament?.nota || x.r.apartament?.nume || '?'} · ${x.r.nume_client} — ${lei(x.rest)} lei${Number(x.r.avans) > 0 ? ' (rest după avans)' : ''}${x.sosesteAzi ? ', sosește azi' : ', cazat'}`
  const n = deIncasat.length + avansuri.length
  const titlu = `💰 De încasat azi: ${n} ${n === 1 ? 'rezervare' : 'rezervări'} · ${lei(total)} lei`
  const linii = [...deIncasat.map(linie), ...avansuri.map(linieAvans)]
  const corp = linii.slice(0, 4).join('\n') + (linii.length > 4 ? `\n+ încă ${linii.length - 4}` : '')

  if (simulare) return NextResponse.json({ ok: true, simulare: true, dejaTrimisAzi: !!deja, ora, titlu, body: corp, clopotel: linii.map(l => `💰 ${l}`) })
  // intai „o data pe zi” (ca doua rulari apropiate sa nu trimita de doua ori), apoi notificarile
  await supabase.from('setari').upsert({ cheie, valoare: JSON.stringify({ n, total, la: new Date().toISOString() }) }, { onConflict: 'cheie' })
  await supabase.from('notificari').insert(linii.map(l => ({ mesaj: `💰 ${l}`, tip: 'incasare', citit: false, url: '/calendar' })))
  let push: any = null
  try {
    // fara „tip”: ajunge pe toate telefoanele abonate, indiferent de categoriile alese (sa nu se piarda)
    const res = await fetch(`${req.nextUrl.origin}/api/push-send`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titlu, body: corp, url: '/calendar', tag: 'incasari-' + azi }) })
    push = await res.json().catch(() => null)
  } catch (e) { push = { eroare: e instanceof Error ? e.message : 'push' } }
  return NextResponse.json({ ok: true, n, total, push })
}
