import { supabase, aziLocal } from '@/lib/supabase'

// Eliberarea unui apartament in Curatenie (curatenie_status.eliberat / eliberat_la), folosita si de Asistent
// (cerut direct: din captura mesajului „La ora 11:00 o să părăsim locația” sa se marcheze plecarea la ora respectiva,
// ca sa apara la curatenie ca liber). O ora din viitor = plecare PLANIFICATA: se afiseaza „Pleacă la HH:MM” pana atunci.

export const oraAcum = (d: Date = new Date()) => d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Bucharest' })

// ora plecarii planificate (inca in viitor) sau null daca e deja eliberat / nemarcat
export function plecarePlanificata(st: any, data: string, acum: Date = new Date()): string | null {
  if (!st?.eliberat || !st.eliberat_la) return null
  const azi = aziLocal(acum)
  return data > azi || (data === azi && st.eliberat_la > oraAcum(acum)) ? st.eliberat_la : null
}

type Prev = { exista: boolean; eliberat: boolean | null; eliberat_la: string | null; co_tarziu: string | null }

export async function marcheazaEliberat(aptId: string, nota: string, data: string, ora: string | null): Promise<{ ora: string; viitor: boolean; prev: Prev }> {
  const { data: ex, error: e0 } = await supabase.from('curatenie_status').select('id,eliberat,eliberat_la,co_tarziu').eq('apartament_id', aptId).eq('data', data).maybeSingle()
  if (e0) throw new Error(e0.message)
  const o = ora || oraAcum()
  const camp: any = { eliberat: true, eliberat_la: o }
  if (ora && ora > '11:00') camp.co_tarziu = ora
  const { error } = ex?.id
    ? await supabase.from('curatenie_status').update(camp).eq('id', ex.id)
    : await supabase.from('curatenie_status').insert({ apartament_id: aptId, data, status: 'liber', ...camp })
  if (error) throw new Error(error.message)
  const viitor = !!plecarePlanificata({ eliberat: true, eliberat_la: o }, data)
  const titlu = viitor ? `🕐 ${nota} — Oaspeții pleacă la ${o}` : `🚪 ${nota} — Eliberat! Poți merge`
  fetch('/api/push-send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: titlu, body: viitor ? `Plecare anunțată pentru ${o}` : `Eliberat la ${o}`, url: '/staff', tag: 'eliberat-' + aptId, tip: 'eliberat' }) }).catch(() => {})
  supabase.from('notificari').insert({ mesaj: titlu, tip: 'eliberat', citit: false, url: '/staff' }).then(() => {})
  return { ora: o, viitor, prev: { exista: !!ex?.id, eliberat: ex?.eliberat ?? null, eliberat_la: ex?.eliberat_la ?? null, co_tarziu: ex?.co_tarziu ?? null } }
}

export async function anuleazaEliberat(aptId: string, data: string, prev: Prev) {
  const { error } = await supabase.from('curatenie_status')
    .update({ eliberat: !!prev.eliberat, eliberat_la: prev.eliberat_la, co_tarziu: prev.co_tarziu }).eq('apartament_id', aptId).eq('data', data)
  if (error) throw new Error(error.message)
}
