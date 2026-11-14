import { supabase } from '@/lib/supabase'
import { GHID_BAZA } from '@/lib/gazdeGhid'

// Linkul ghidului de check-in in mesajul „Date acces” trimis la sosire (cerut direct: „la locatiile unde avem date de
// check in, informatia in mesajul pe care l trimitem clientilor la sosire - gasiti in acest link, va rog sa urmariti cu
// atentie”). Doar apartamentele care AU ghid salvat (setari ghid_apt_<id>); celelalte primesc mesajul neschimbat.

export const linkGhid = (apt: { id?: string; nota?: string | null } | null | undefined, scurt?: string | null) =>
  `${GHID_BAZA}/${encodeURIComponent(String(scurt || '').trim() || String(apt?.nota || '').trim() || String(apt?.id || ''))}`

// apartamentele cu ghid de check-in: id -> linkul scurt al ghidului ('' daca nu are)
export async function aptCuGhid(): Promise<Map<string, string>> {
  const { data } = await supabase.from('setari').select('cheie,valoare').like('cheie', 'ghid_apt_%')
  return new Map((data || []).map((s: any) => {
    let scurt = ''
    try { scurt = String(JSON.parse(s.valoare)?.link_scurt || '').trim() } catch { /* ignor */ }
    return [String(s.cheie).slice('ghid_apt_'.length), scurt] as [string, string]
  }))
}

export const textGhid = (url: string) =>
  `📖 *Ghidul de check-in:* toate detaliile de acces (adresa, parcarea, intrarea, codul de acces, Wi-Fi-ul și regulile casei) le găsiți pas cu pas în linkul de mai jos. Vă rugăm să îl parcurgeți cu atenție înainte de sosire.\n👉 ${url}`

// Adauga paragraful cu linkul inaintea urarii de final („O ședere plăcută...”), altfel inaintea semnaturii.
export function cuLinkGhid(msg: string, apt: { id?: string; nota?: string | null } | null | undefined, cuGhid: Map<string, string> | null | undefined): string {
  if (!apt?.id || !cuGhid?.has(apt.id)) return msg
  const url = linkGhid(apt, cuGhid.get(apt.id))
  if (msg.includes(url)) return msg
  const par = msg.split(/\n\s*\n/)
  let i = par.findIndex(p => /^\s*(o ședere|o sedere|vă dorim|va dorim|ședere plăcută)/i.test(p))
  if (i < 1) i = par.length > 1 ? par.length - 1 : par.length
  par.splice(i, 0, textGhid(url))
  return par.join('\n\n')
}
