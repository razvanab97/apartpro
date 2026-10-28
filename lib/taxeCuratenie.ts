import { supabase } from '@/lib/supabase'

// Taxa de curatenie scazuta proprietarului (cerut direct pentru Cherry 3: „de fiecare data cand se bifeaza
// curatenie finalizata ... se adauga 75 RON (asta sa poata fi modificata) la suma pe care trebuie sa o scadem
// proprietarilor pentru curatenie”). Fiecare rand curatenie_status cu status='gata' din data `dela` incolo
// = o curatenie taxata. Config in setari (cheie curatenie_taxe_proprietar) - fara migrare.
// `suprascrieri`: suma modificata pentru o singura curatenie (cheie <aptId>_<data>).

export type TaxaApt = { tarif: number; dela: string; activ: boolean }
export type TaxeCfg = { apt: Record<string, TaxaApt>; suprascrieri: Record<string, number> }
export type CurateniaTaxata = { apartament_id: string; data: string; ora_inceput: string | null; ora_gata: string | null; suma: number; modificata: boolean }

export const CHEIE_TAXE = 'curatenie_taxe_proprietar'
export const CHERRY3 = '4491ccd1-34a1-4d32-9be6-3fb87aa799b7'
export const TAXE_IMPLICIT: TaxeCfg = { apt: { [CHERRY3]: { tarif: 75, dela: '2026-10-28', activ: true } }, suprascrieri: {} }

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

// Curateniile finalizate si taxate intre start si end (inclusiv), doar pt apartamentele cu taxa activa
export async function curateniiTaxate(start: string, end: string, cfg: TaxeCfg, aptIds?: string[]): Promise<CurateniaTaxata[]> {
  const ids = Object.keys(cfg.apt).filter(id => cfg.apt[id].activ && (!aptIds || aptIds.includes(id)))
  if (!ids.length) return []
  const { data } = await supabase.from('curatenie_status').select('apartament_id,data,status,ora_inceput,ora_gata')
    .in('apartament_id', ids).eq('status', 'gata').gte('data', start).lte('data', end).order('data')
  return ((data || []) as any[])
    .filter(r => r.data >= (cfg.apt[r.apartament_id]?.dela || '0000'))
    .map(r => {
      const k = cheieCuratenie(r.apartament_id, r.data), s = cfg.suprascrieri[k]
      return { apartament_id: r.apartament_id, data: r.data, ora_inceput: r.ora_inceput, ora_gata: r.ora_gata,
        suma: s != null ? Number(s) : Number(cfg.apt[r.apartament_id].tarif) || 0, modificata: s != null }
    })
}

// „Sterge” o curatenie finalizata: randul ramane (eliberat / lenjerii), doar nu mai e „gata”
export async function stergeCuratenieGata(aptId: string, data: string): Promise<string | null> {
  const { error } = await supabase.from('curatenie_status').update({ status: 'liber', ora_gata: null, ora_inceput: null })
    .eq('apartament_id', aptId).eq('data', data)
  return error ? error.message : null
}
