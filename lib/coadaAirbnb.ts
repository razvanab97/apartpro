// Coada de facturare Airbnb (cerut direct: „să rămână la îndemână aceste de facturat, să le luăm una câte una, să verificăm și
// să confirmăm - un sistem mai simplu, fiind direct de pe Airbnb”). Raportul CSV importat se pastreaza in setari; la fiecare
// deschidere se reconciliaza din nou cu aplicatia si cu Oblio, deci ce s-a facturat iese singur din coada.
import { supabase } from '@/lib/supabase'
import type { RandRaport } from '@/lib/raportAirbnb'
import type { ClientFactura } from '@/components/RezervareModal'
import { normNume, normTel, type Invatat } from '@/lib/invatareFactura'

export const CHEIE_COADA = 'coada_facturare_airbnb'
export type Coada = { randuri: RandRaport[]; ignorate: Record<string, string>; pendinte?: number; actualizat?: string }

export async function citesteCoada(): Promise<Coada> {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_COADA).maybeSingle()
  try { const v = JSON.parse(data?.valoare || 'null'); if (v && Array.isArray(v.randuri)) return { randuri: v.randuri, ignorate: v.ignorate || {}, pendinte: v.pendinte, actualizat: v.actualizat } } catch { /* gol */ }
  return { randuri: [], ignorate: {} }
}
export async function scrieCoada(c: Coada) {
  const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_COADA, valoare: JSON.stringify({ ...c, actualizat: new Date().toISOString() }) }, { onConflict: 'cheie' })
  if (error) throw new Error('Coada de facturare nu s-a putut salva: ' + error.message)
}
// un raport nou se adauga peste cel vechi (acelasi cod = randul nou, cu ajustarile la zi)
export async function adaugaInCoada(randuri: RandRaport[]): Promise<Coada> {
  const c = await citesteCoada()
  const pe = new Map(c.randuri.map(r => [r.cod, r]))
  for (const r of randuri) pe.set(r.cod, r)
  const nou = { ...c, randuri: [...pe.values()].sort((a, b) => a.checkout.localeCompare(b.checkout)) }
  await scrieCoada(nou)
  return nou
}

// ce a invatat aplicatia: datele de facturare salvate la rezervari (domiciliu) + numele / telefonul acelor rezervari
export async function incarcaInvatare(): Promise<{ salvate: Record<string, ClientFactura>; invatate: Invatat[] }> {
  const { data: cl } = await supabase.from('setari').select('cheie,valoare').like('cheie', 'client_factura_%').limit(5000)
  const salvate: Record<string, ClientFactura> = {}
  for (const x of cl || []) { try { const v = JSON.parse(x.valoare); if (v && typeof v === 'object') salvate[x.cheie.slice('client_factura_'.length)] = v } catch { /* ignor */ } }
  const ids = Object.keys(salvate), rand: Record<string, { nume_client: string; telefon_client: string | null; data_checkin: string }> = {}
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from('rezervari').select('id,nume_client,telefon_client,data_checkin').in('id', ids.slice(i, i + 150))
    for (const r of data || []) rand[r.id] = r
  }
  return { salvate, invatate: ids.filter(id => rand[id]).map(id => ({ rezId: id, nume: normNume(rand[id].nume_client), tel: normTel(rand[id].telefon_client), checkin: rand[id].data_checkin || '', client: salvate[id] })) }
}
