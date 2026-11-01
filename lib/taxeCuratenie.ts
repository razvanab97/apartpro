import { supabase } from '@/lib/supabase'

// Taxa de curatenie scazuta proprietarului (cerut direct pentru Cherry 3: „de fiecare data cand se bifeaza
// curatenie finalizata ... se adauga 75 RON (asta sa poata fi modificata) la suma pe care trebuie sa o scadem
// proprietarilor pentru curatenie”). Config in setari (cheie curatenie_taxe_proprietar) - fara migrare.
//
// EVIDENTA (cerut direct: „unde se salvează costul curățeniei, ca să avem o evidență? salvarea se face atunci când
// se setează că s-a făcut o curățenie”): in momentul in care staff-ul apasa „Gata”, se salveaza o inregistrare per
// curatenie in setari, cheie taxa_cur_<aptId>_<data> = { apt, data, suma, tarif, ora_gata, salvat_la, modificata }.
// O cheie separata pe curatenie (nu o lista comuna) - doua curatenii terminate in acelasi timp nu se suprascriu.
// Suma ramane cea de la momentul curateniei: daca tariful se schimba mai tarziu, se aplica doar curateniilor noi.
// „Reîncepe” (staff) / „Șterge” (Curățenie) sterg inregistrarea.

export type TaxaApt = { tarif: number; dela: string; activ: boolean }
export type TaxeCfg = { apt: Record<string, TaxaApt>; suprascrieri: Record<string, number> }
export type TaxaSalvata = { apt: string; data: string; suma: number; tarif: number; ora_gata: string | null; salvat_la: string; modificata?: boolean }
export type CurateniaTaxata = { apartament_id: string; data: string; ora_inceput: string | null; ora_gata: string | null; suma: number; modificata: boolean
  salvata: boolean; salvat_la: string | null; tarif: number }

export const CHEIE_TAXE = 'curatenie_taxe_proprietar'
export const CHERRY3 = '4491ccd1-34a1-4d32-9be6-3fb87aa799b7'
export const TAXE_IMPLICIT: TaxeCfg = { apt: { [CHERRY3]: { tarif: 75, dela: '2026-10-28', activ: true } }, suprascrieri: {} }
const PREFIX = 'taxa_cur_'
export const cheieTaxa = (aptId: string, data: string) => `${PREFIX}${aptId}_${data}`

export async function citesteTaxe(): Promise<TaxeCfg> {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_TAXE).maybeSingle()
  if (!data?.valoare) return TAXE_IMPLICIT
  try { const v = JSON.parse(data.valoare); return { apt: v.apt || {}, suprascrieri: v.suprascrieri || {} } } catch { return TAXE_IMPLICIT }
}

export async function salveazaTaxe(cfg: TaxeCfg): Promise<string | null> {
  const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_TAXE, valoare: JSON.stringify(cfg) }, { onConflict: 'cheie' })
  return error ? error.message : null
}

export const cheieCuratenie = (aptId: string, data: string) => `${aptId}_${data}`

// La „Gata”: salveaza costul curateniei in evidenta (doar pt apartamentele cu taxa activa, din data de inceput).
// Nu suprascrie o inregistrare existenta (ex. apasat de doua ori) - suma ramane cea salvata prima data.
export async function salveazaTaxaCuratenie(aptId: string, data: string, ora_gata?: string | null, suma?: number): Promise<TaxaSalvata | null> {
  const cfg = await citesteTaxe(), t = cfg.apt[aptId]
  if (suma == null && (!t?.activ || data < t.dela)) return null
  const v: TaxaSalvata = { apt: aptId, data, suma: suma ?? (Number(t?.tarif) || 0), tarif: Number(t?.tarif) || 0, ora_gata: ora_gata || null,
    salvat_la: new Date().toISOString(), ...(suma != null ? { modificata: true } : {}) }
  const { error } = await supabase.from('setari').upsert({ cheie: cheieTaxa(aptId, data), valoare: JSON.stringify(v) }, { onConflict: 'cheie', ignoreDuplicates: suma == null })
  return error ? null : v
}

export async function stergeTaxaCuratenie(aptId: string, data: string) {
  await supabase.from('setari').delete().eq('cheie', cheieTaxa(aptId, data))
}

// Suma modificata manual pentru o singura curatenie (din raportul „Taxe”) - se scrie direct in evidenta
export async function modificaSumaTaxa(aptId: string, data: string, suma: number, ora_gata?: string | null): Promise<string | null> {
  const { data: ex } = await supabase.from('setari').select('valoare').eq('cheie', cheieTaxa(aptId, data)).maybeSingle()
  let v: TaxaSalvata | null = null
  try { v = ex?.valoare ? JSON.parse(ex.valoare) : null } catch {}
  const cfg = await citesteTaxe()
  const nou: TaxaSalvata = { ...(v || { apt: aptId, data, tarif: Number(cfg.apt[aptId]?.tarif) || 0, ora_gata: ora_gata || null, salvat_la: new Date().toISOString() }), suma, modificata: true }
  const { error } = await supabase.from('setari').upsert({ cheie: cheieTaxa(aptId, data), valoare: JSON.stringify(nou) }, { onConflict: 'cheie' })
  return error ? error.message : null
}

async function citesteEvidenta(ids: string[]): Promise<TaxaSalvata[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('setari').select('valoare').or(ids.map(id => `cheie.like.${PREFIX}${id}_*`).join(','))
  return ((data || []) as any[]).map(r => { try { return JSON.parse(r.valoare) as TaxaSalvata } catch { return null } }).filter(Boolean) as TaxaSalvata[]
}

// Curateniile taxate intre start si end (inclusiv): din EVIDENTA (suma salvata la „Gata”) + eventualele curatenii
// marcate „gata” care n-au inca inregistrare (ex. dinainte de evidenta) - acestea apar cu tariful actual, ca „nesalvate”.
export async function curateniiTaxate(start: string, end: string, cfg: TaxeCfg, aptIds?: string[]): Promise<CurateniaTaxata[]> {
  const toate = Object.keys(cfg.apt).filter(id => !aptIds || aptIds.includes(id))
  if (!toate.length) return []
  const active = toate.filter(id => cfg.apt[id].activ)
  const [evidenta, { data: st }] = await Promise.all([
    citesteEvidenta(toate),
    active.length ? supabase.from('curatenie_status').select('apartament_id,data,status,ora_inceput,ora_gata')
      .in('apartament_id', active).eq('status', 'gata').gte('data', start).lte('data', end).order('data') : Promise.resolve({ data: [] as any[] }),
  ])
  const statusuri = (st || []) as any[]
  const rez: CurateniaTaxata[] = evidenta.filter(e => e.data >= start && e.data <= end).map(e => {
    const s = statusuri.find(x => x.apartament_id === e.apt && x.data === e.data)
    return { apartament_id: e.apt, data: e.data, ora_inceput: s?.ora_inceput || null, ora_gata: e.ora_gata || s?.ora_gata || null, suma: Number(e.suma) || 0,
      modificata: !!e.modificata, salvata: true, salvat_la: e.salvat_la || null, tarif: Number(e.tarif) || 0 }
  })
  for (const s of statusuri) {
    if (s.data < (cfg.apt[s.apartament_id]?.dela || '9999') || rez.some(r => r.apartament_id === s.apartament_id && r.data === s.data)) continue
    const t = Number(cfg.apt[s.apartament_id].tarif) || 0
    rez.push({ apartament_id: s.apartament_id, data: s.data, ora_inceput: s.ora_inceput, ora_gata: s.ora_gata, suma: t, modificata: false, salvata: false, salvat_la: null, tarif: t })
  }
  return rez.sort((a, b) => a.data.localeCompare(b.data))
}

// „Sterge” o curatenie finalizata: randul ramane (eliberat / lenjerii), doar nu mai e „gata”; costul iese din evidenta
export async function stergeCuratenieGata(aptId: string, data: string): Promise<string | null> {
  const { error } = await supabase.from('curatenie_status').update({ status: 'liber', ora_gata: null, ora_inceput: null })
    .eq('apartament_id', aptId).eq('data', data)
  if (error) return error.message
  await stergeTaxaCuratenie(aptId, data)
  return null
}
