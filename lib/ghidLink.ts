import { supabase } from '@/lib/supabase'
import { GHID_BAZA } from '@/lib/gazdeGhid'

// Linkul ghidului de check-in in mesajul „Date acces” trimis la sosire (cerut direct: „la locatiile unde avem date de
// check in, informatia in mesajul pe care l trimitem clientilor la sosire - gasiti in acest link, va rog sa urmariti cu
// atentie”). Doar apartamentele care AU ghid salvat (setari ghid_apt_<id>); celelalte primesc mesajul neschimbat.

export const linkGhid = (apt: { id?: string; nota?: string | null } | null | undefined, scurt?: string | null) =>
  `${GHID_BAZA}/${encodeURIComponent(String(scurt || '').trim() || String(apt?.nota || '').trim() || String(apt?.id || ''))}`

// Datele de check-in din ghid, pentru mesajul trimis cand locatia e pregatita (cerut direct: „datele de check-in să apară
// și în mesajul general de acces după ce locația e pregătită”): adresa, codurile / Wi-Fi din „Acces rapid” (doar cele
// completate si neascunse) si orele de check-in / check-out.
export function textDateCheckin(g: any): string {
  if (!g || typeof g !== 'object') return ''
  const r: string[] = []
  const adresa = String(g.sub_ro || '').trim()
  if (adresa) r.push(`📍 ${adresa}`)
  for (const a of Array.isArray(g.acces) ? g.acces : []) {
    const v = String(a?.valoare || '').trim(), et = String(a?.ro || '').trim()
    if (!v || !et || a?.ascuns) continue
    const nota = String(a?.nota_ro || '').trim()
    r.push(`${a.cod ? '🔑' : /wi.?fi|parol/i.test(et) ? '📶' : '▪️'} ${et}: *${v}*${nota ? ` (${nota.replace(/^\(|\)$/g, '')})` : ''}`)
  }
  const ci = String(g.checkin || '').trim(), co = String(g.checkout || '').trim()
  if (ci || co) r.push(`🕒 ${[ci && `Check-in de la ${ci}`, co && `check-out până la ${co}`].filter(Boolean).join(' · ')}`)
  return r.length > 1 || (r.length === 1 && !r[0].startsWith('🕒')) ? `*Datele de check-in:*\n${r.join('\n')}` : ''
}
export type InfoGhid = { scurt: string; date: string }

// apartamentele cu ghid de check-in: id -> linkul scurt + datele de check-in
export async function aptCuGhid(): Promise<Map<string, InfoGhid>> {
  const { data } = await supabase.from('setari').select('cheie,valoare').like('cheie', 'ghid_apt_%')
  return new Map((data || []).map((s: any) => {
    let info: InfoGhid = { scurt: '', date: '' }
    try { const g = JSON.parse(s.valoare); info = { scurt: String(g?.link_scurt || '').trim(), date: textDateCheckin(g) } } catch { /* ignor */ }
    return [String(s.cheie).slice('ghid_apt_'.length), info] as [string, InfoGhid]
  }))
}

export const textGhid = (url: string) =>
  `📖 *Ghidul de check-in:* toate detaliile de acces (adresa, parcarea, intrarea, codul de acces, Wi-Fi-ul și regulile casei) le găsiți pas cu pas în linkul de mai jos. Vă rugăm să îl parcurgeți cu atenție înainte de sosire.\n👉 ${url}`

// Adauga paragraful cu linkul inaintea urarii de final („O ședere plăcută...”), altfel inaintea semnaturii.
export function cuLinkGhid(msg: string, apt: { id?: string; nota?: string | null } | null | undefined, cuGhid: Map<string, InfoGhid> | null | undefined, cuDate = false): string {
  if (!apt?.id || !cuGhid?.has(apt.id)) return msg
  const info = cuGhid.get(apt.id), url = linkGhid(apt, info?.scurt)
  if (msg.includes(url)) return msg
  const par = msg.split(/\n\s*\n/)
  let i = par.findIndex(p => /^\s*(o ședere|o sedere|vă dorim|va dorim|ședere plăcută)/i.test(p))
  if (i < 1) i = par.length > 1 ? par.length - 1 : par.length
  // mesajul „locatia e pregatita”: datele de check-in inaintea linkului ghidului
  par.splice(i, 0, ...(cuDate && info?.date && !msg.includes(info.date) ? [info.date] : []), textGhid(url))
  return par.join('\n\n')
}
