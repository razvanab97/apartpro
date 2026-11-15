import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CATEGORII_SUGESTII, cifreTel, telPotrivit } from '@/lib/sugestii'

// Formularul public de sugestii (vezi lib/sugestii.ts). Oaspetele se identifica prin telefon: il potrivim pe server
// cu o sedere recenta (ultimele 60 de zile sau in curs). Inapoi spre pagina trimitem DOAR prenumele - nu date,
// sume sau alte detalii ale rezervarii. Pe adresa oaspetilor e singura ruta permisa in afara de ghid (middleware.ts).

const zi = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d) }
const recente = new Map<string, number[]>()  // limita simpla: max 8 cereri / 10 min / IP (pe instanta)
function prea(ip: string) {
  const acum = Date.now(), l = (recente.get(ip) || []).filter(t => acum - t < 600_000)
  l.push(acum); recente.set(ip, l)
  return l.length > 8
}

async function gasesteSedere(tel: string) {
  if (cifreTel(tel).length < 8) return null
  const { data } = await supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout,apartament:apartamente(nota,nume)')
    .neq('status_rezervare', 'anulata').lte('data_checkin', zi(1)).gte('data_checkout', zi(-60)).order('data_checkout', { ascending: false }).limit(1000)
  return (data || []).find((r: any) => telPotrivit(r.telefon_client, tel)) as any || null
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'x'
  if (prea(ip)) return NextResponse.json({ ok: false, eroare: 'prea_multe' }, { status: 429 })
  let b: any = {}
  try { b = await req.json() } catch {}
  const tel = String(b.telefon || '').slice(0, 30).trim()
  if (cifreTel(tel).length < 8) return NextResponse.json({ ok: false, eroare: 'telefon' })
  const r = await gasesteSedere(tel)
  const prenume = r ? String(r.nume_client || '').trim().split(/\s+/)[0] || null : null
  if (b.pas === 'verifica') return NextResponse.json({ ok: true, gasit: !!r, prenume })

  const text = String(b.text || '').trim().slice(0, 3000)
  if (text.length < 3) return NextResponse.json({ ok: false, eroare: 'text' })
  const nota = Number.isInteger(b.nota) && b.nota >= 1 && b.nota <= 5 ? b.nota : null
  const categorii = (Array.isArray(b.categorii) ? b.categorii : []).filter((k: any) => CATEGORII_SUGESTII.some(c => c.k === k)).slice(0, 8)
  const apt = r ? (Array.isArray(r.apartament) ? r.apartament[0] : r.apartament) : null
  const { error } = await supabase.from('sugestii_oaspeti').insert({
    telefon: tel, rezervare_id: r?.id || null, apartament_id: r?.apartament_id || null, nume_client: r?.nume_client || null,
    apartament: apt ? [apt.nota, apt.nume].filter(Boolean).join(' · ') : null, data_checkout: r?.data_checkout || null,
    nota, categorii, text, limba: b.limba === 'en' ? 'en' : 'ro', status: 'noua',
  })
  if (error) { console.error('[sugestii]', error.message); return NextResponse.json({ ok: false, eroare: 'salvare' }, { status: 500 }) }
  supabase.from('notificari').insert({ mesaj: `💬 Sugestie nouă de la ${r?.nume_client || tel}${apt ? ' — ' + (apt.nota || apt.nume) : ''}`, tip: 'sugestie', citit: false, url: '/sugestii-oaspeti' }).then(() => {})
  return NextResponse.json({ ok: true })
}
