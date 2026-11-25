// Reamintiri programate + mesajele care ajung in Asistent (cerut direct: „nu uita de notificările pentru plăți atunci
// când le avem de încasat; pot fi mesaje și în asistentul AI; să putem să-i zicem și lui să ne reamintească și să ne
// trimită un mesaj în ziua plății”).
// - reamintiri (setari „reamintiri”): [{ id, data: 'YYYY-MM-DD', text, rezervare_id?, creat_la, trimis_la? }] - se trimit
//   in ziua lor (cron dimineata ~9-10 si la ~16 odata cu incasarile): push pe telefon + 🔔 clopotel + mesaj in Asistent
// - inbox Asistent (setari „agent_inbox”): ultimele mesaje „din oficiu” (reamintiri, incasarile zilei); Asistentul le
//   afiseaza in conversatie la deschidere, o singura data pe dispozitiv
import { supabase } from '@/lib/supabase'

export const CHEIE_REAMINTIRI = 'reamintiri', CHEIE_INBOX = 'agent_inbox'
export type Reamintire = { id: string; data: string; text: string; rezervare_id?: string | null; creat_la: string; trimis_la?: string | null }
export type MesajInbox = { id: string; text: string; la: string; rezervare_id?: string | null }

const parse = <T,>(s: string | null | undefined, d: T): T => { try { const v = JSON.parse(s || ''); return Array.isArray(v) ? v as T : d } catch { return d } }
export const aziRo = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
const idNou = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export async function citesteReamintiri(): Promise<Reamintire[]> {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_REAMINTIRI).maybeSingle()
  return parse<Reamintire[]>(data?.valoare, [])
}
async function scrieReamintiri(l: Reamintire[]) {
  // pastram cele netrimise + ultimele 100 trimise
  const net = l.filter(r => !r.trimis_la), trim = l.filter(r => r.trimis_la).sort((a, b) => String(b.trimis_la).localeCompare(String(a.trimis_la))).slice(0, 100)
  const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_REAMINTIRI, valoare: JSON.stringify([...net, ...trim]) }, { onConflict: 'cheie' })
  if (error) throw new Error(error.message)
}

export async function adaugaReamintire(r: { data: string; text: string; rezervare_id?: string | null }): Promise<Reamintire> {
  const l = await citesteReamintiri()
  const nou: Reamintire = { id: idNou(), data: r.data, text: r.text.trim().slice(0, 500), rezervare_id: r.rezervare_id || null, creat_la: new Date().toISOString() }
  await scrieReamintiri([...l, nou])
  return nou
}
export async function stergeReamintire(id: string): Promise<boolean> {
  const l = await citesteReamintiri()
  if (!l.some(r => r.id === id)) return false
  await scrieReamintiri(l.filter(r => r.id !== id))
  return true
}

export async function citesteInbox(): Promise<MesajInbox[]> {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_INBOX).maybeSingle()
  return parse<MesajInbox[]>(data?.valoare, [])
}
export async function adaugaInbox(mesaje: { text: string; rezervare_id?: string | null }[]) {
  if (!mesaje.length) return
  const l = await citesteInbox(), la = new Date().toISOString()
  const noi = mesaje.map(m => ({ id: idNou(), text: m.text, la, rezervare_id: m.rezervare_id || null }))
  await supabase.from('setari').upsert({ cheie: CHEIE_INBOX, valoare: JSON.stringify([...l, ...noi].slice(-50)) }, { onConflict: 'cheie' })
}

// trimite reamintirile scadente (data <= azi, netrimise): push + clopotel + Asistent; intoarce ce s-a trimis
export async function livreazaReamintiri(origin: string, o: { simulare?: boolean } = {}) {
  const azi = aziRo(), l = await citesteReamintiri()
  const scadente = l.filter(r => !r.trimis_la && r.data <= azi)
  if (!scadente.length || o.simulare) return { n: scadente.length, simulare: !!o.simulare, texte: scadente.map(r => r.text) }
  const acum = new Date().toISOString()
  await scrieReamintiri(l.map(r => scadente.some(s => s.id === r.id) ? { ...r, trimis_la: acum } : r))   // intai marcate, ca sa nu plece de doua ori
  const linii = scadente.map(r => `${r.data < azi ? `(din ${r.data.slice(8, 10)}.${r.data.slice(5, 7)}) ` : ''}${r.text}`)
  await supabase.from('notificari').insert(linii.map(t => ({ mesaj: `⏰ ${t}`, tip: 'reamintire', citit: false, url: '/' })))
  await adaugaInbox(scadente.map((r, i) => ({ text: `⏰ Reamintire: ${linii[i]}`, rezervare_id: r.rezervare_id })))
  let push: any = null
  try {
    const res = await fetch(`${origin}/api/push-send`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: scadente.length === 1 ? '⏰ Reamintire' : `⏰ ${scadente.length} reamintiri`, body: linii.slice(0, 4).join('\n'), url: '/', tag: 'reamintiri-' + azi }) })
    push = await res.json().catch(() => null)
  } catch {}
  return { n: scadente.length, texte: linii, push }
}
