// Reconcilierea raportului Airbnb cu aplicatia (rezervari) si cu facturile RH reale din Oblio. Folosita de „📥 Raport Airbnb”
// si de coada „Facturare Airbnb pe rând”.
import { supabase } from '@/lib/supabase'
import { eFirmaFacturare, type RandRaport } from '@/lib/raportAirbnb'
import { normNume } from '@/lib/invatareFactura'

export type FacturaOblio = { numar: string; data: string; total: number | null; client: string; anulata: boolean }
export type Stare = 'diferenta' | 'de_pregatit' | 'lipsa' | 'marcata' | 'alta_firma' | 'anulata' | 'ok' | 'pregatita'
export type Rez = { id: string; nume_client: string; canal: string; cod_rezervare_platforma: string | null; status_facturare: string; status_rezervare: string; factura_serie: string | null; factura_numar: string | null; data_checkin: string; data_checkout: string; valoare_bruta: number; telefon_client?: string | null; apartament?: { nume?: string } | null }
export type Linie = { r: RandRaport; rez?: Rez; dupaNume?: boolean; factura?: FacturaOblio; facturaGhicita?: boolean; manuala?: { numar: string; suma?: number }; stare: Stare; detaliu: string }
export const fmt = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const zz = (d: string) => d ? d.split('-').reverse().join('.') : ''
const cheieFact = (serie?: string | null, nr?: string | null) => `${serie || 'RH'} ${String(nr || '').trim()}`.replace(/\s+/g, ' ').toUpperCase()
// de facturat = nefacturate (cu sau fara rezervare in aplicatie) + marcate „facturată” fara factura
export const deFacturat = (l: Linie) => l.stare === 'de_pregatit' || l.stare === 'lipsa' || l.stare === 'marcata'

export async function reconciliaza(randuri: RandRaport[]): Promise<{ linii: Linie[]; oblio: { ok: boolean; mesaj?: string }; ultimaRH: string | null }> {
  const coduri = randuri.map(r => r.cod)
  const SEL = 'id,nume_client,canal,cod_rezervare_platforma,status_facturare,status_rezervare,factura_serie,factura_numar,data_checkin,data_checkout,valoare_bruta,telefon_client,apartament:apartamente(nume)'
  const [{ data: dupaCod }, { data: dupaData }, { data: manuale }, lista] = await Promise.all([
    supabase.from('rezervari').select(SEL).in('cod_rezervare_platforma', coduri),
    supabase.from('rezervari').select(SEL).in('data_checkin', [...new Set(randuri.map(r => r.checkin).filter(Boolean))]),
    supabase.from('setari').select('cheie,valoare').in('cheie', coduri.map(c => `factura_manuala_${c}`)),
    fetch('/api/factura-oblio?lista=1', { cache: 'no-store' }).then(r => r.json().then(o => ({ ok: r.ok && !o.error, o }))).catch(() => ({ ok: false, o: { error: 'ContaFlow nu răspunde' } })),
  ])
  const facturi: FacturaOblio[] = lista.ok ? lista.o.facturi || [] : []
  const peNumar = new Map(facturi.map(f => [cheieFact(f.numar.split(' ')[0], f.numar.split(' ').slice(1).join(' ')), f]))
  const man = new Map((manuale || []).map(m => { try { const v = JSON.parse(m.valoare); return [m.cheie.slice('factura_manuala_'.length), { numar: cheieFact(v.serie, v.numar), suma: Number(v.suma) || undefined }] } catch { return [m.cheie, { numar: '' }] } }))
  // facturile din Oblio deja legate de o rezervare / factura manuala -> restul se pot ghici dupa numele clientului
  const legate = new Set<string>([...(dupaCod || []).filter(x => x.factura_numar).map(x => cheieFact(x.factura_serie, x.factura_numar)), ...[...man.values()].map(m => m.numar)])
  const out: Linie[] = randuri.map(r => {
    let rez = (dupaCod || []).find(x => String(x.cod_rezervare_platforma || '').trim().toUpperCase() === r.cod) as Rez | undefined, dupaNume = false
    if (!rez) {
  const n = new Set(normNume(r.oaspete).split(' ').filter(t => t.length >= 3))
  rez = (dupaData || []).find(x => x.data_checkin === r.checkin && x.status_rezervare !== 'anulata' && normNume(x.nume_client).split(' ').some(t => n.has(t))) as Rez | undefined
  dupaNume = !!rez
    }
    const manuala = man.get(r.cod)
    let factura = rez?.factura_numar ? peNumar.get(cheieFact(rez.factura_serie, rez.factura_numar)) : manuala ? peNumar.get(manuala.numar) : undefined
    let facturaGhicita = false
    if (!factura && !rez?.factura_numar && !manuala) {
  const n = normNume(r.oaspete)
  const g = facturi.filter(f => !f.anulata && !legate.has(cheieFact(f.numar.split(' ')[0], f.numar.split(' ').slice(1).join(' '))) && normNume(f.client) === n)
  if (g.length === 1) { factura = g[0]; facturaGhicita = true }
    }
    const nrFact = rez?.factura_numar ? cheieFact(rez.factura_serie, rez.factura_numar) : manuala?.numar || (factura ? factura.numar : '')
    const aj = r.ajustari.length ? ` · ajustare Airbnb ${r.ajustari.map(a => `${a.suma > 0 ? '+' : ''}${fmt(a.suma)}`).join(', ')} (nu e inclusă)` : ''
    let stare: Stare, detaliu: string
    if (!eFirmaFacturare(r.firma)) { stare = 'alta_firma'; detaliu = `banii au intrat la ${r.firma} — nu se facturează pe AB Textile (RH)${nrFact ? ` · are totuși factura ${nrFact}` : ''}` }
    else if (nrFact) {
  if (factura?.total == null) { stare = 'ok'; detaliu = `${nrFact}${lista.ok ? ' — nu am găsit-o în lista Oblio' : ' — suma nu s-a putut verifica acum (Oblio)'}` }
  else if (factura.anulata) { stare = 'diferenta'; detaliu = `${factura.numar} e ANULATĂ în Oblio` }
  else if (Math.abs(factura.total - r.brut) > 0.01) { stare = 'diferenta'; detaliu = `${factura.numar} din ${zz(factura.data)} are ${fmt(factura.total)} RON, câștigul brut Airbnb e ${fmt(r.brut)} RON (diferență ${fmt(r.brut - factura.total)})` }
  else { stare = 'ok'; detaliu = `${factura.numar} din ${zz(factura.data)} · ${fmt(factura.total)} RON${facturaGhicita ? ' · găsită după numele clientului' : ''}` }
  if (facturaGhicita && rez?.status_facturare !== 'facturata') detaliu += ' (rezervarea nu e legată de factură)'
    }
    else if (!rez) { stare = 'lipsa'; detaliu = 'nicio rezervare cu acest cod sau cu acest nume și check-in' }
    else if (rez.status_rezervare === 'anulata') { stare = 'anulata'; detaliu = `${rez.nume_client} e anulată în aplicație, dar Airbnb a plătit ${fmt(r.brut)} RON` }
    else if (rez.status_facturare === 'facturata') { stare = 'marcata'; detaliu = `${rez.nume_client} e marcată „facturată”, dar nu are factură RH${lista.ok ? ' și nu am găsit-o în Oblio după nume' : ''}` }
    else {
  stare = 'de_pregatit'
  const sch = [!rez.cod_rezervare_platforma && 'adaug codul', rez.canal !== 'airbnb' && `canal ${rez.canal} → airbnb`, rez.status_facturare !== 'de_facturat' && '→ de facturat'].filter(Boolean)
  detaliu = `${rez.nume_client}${dupaNume ? ' (găsită după nume + check-in — verifică)' : ''} · suma de facturat ${fmt(r.brut)} RON${sch.length ? ' · ' + sch.join(', ') : ''}`
    }
    return { r, rez, dupaNume, factura, facturaGhicita, manuala, stare, detaliu: detaliu + aj }
  })
  const ultimaRH = facturi.reduce<string | null>((m, f) => /^\d{4}-\d{2}-\d{2}$/.test(f.data) && (!m || f.data > m) ? f.data : m, null)
  return { linii: out, oblio: lista.ok ? { ok: true } : { ok: false, mesaj: lista.o.error }, ultimaRH }
}
