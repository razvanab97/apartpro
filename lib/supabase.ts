import { createClient } from '@supabase/supabase-js'

const DIRECT_URL = 'https://lsmraxevzkmupaidianv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbXJheGV2emttdXBhaWRpYW52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkwMDA5NywiZXhwIjoyMDk1NDc2MDk3fQ.CagkIVPFE6r8D1oZPoxvs3jzJDR3HSwtx0GzM0etpss'

// În browser: rutăm prin proxy Next.js (/api/supa) ca să ocolim blocările de extensii/ETP
// Pe server: merge direct la Supabase
const supabaseUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/api/supa`
  : DIRECT_URL

// Retry automat cu timeout per-cerere: o blocare tranzitorie de retea/proxy se repara
// singura (2 reincercari) inainte ca pagina sa afiseze vreo eroare catre utilizator.
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ATTEMPTS = 3
  const TIMEOUT_MS = 5000
  let lastErr: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(input, { ...init, signal: controller.signal })
      clearTimeout(timer)
      return res
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (attempt < ATTEMPTS) await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
  throw lastErr
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithRetry as typeof fetch },
})

// URL public STABIL pentru fisiere din storage - NU folosi supabase.storage.from(...).getPublicUrl()
// in browser, pentru ca acela foloseste window.location.origin (prin proxy-ul /api/supa de mai sus),
// deci link-ul salvat in baza de date ramane legat de domeniul de PE CARE s-a facut upload-ul
// (ex: un URL de preview Vercel efemer). Cand acel deployment expira, link-ul da 404 permanent.
// Aici mergem mereu direct la domeniul real Supabase, indiferent de unde se face upload-ul.
export function getStorageUrl(bucket: string, path: string): string {
  return `${DIRECT_URL}/storage/v1/object/public/${bucket}/${path}`
}

// Reordoneaza doar elementele din subsetIds (identificate prin id) in interiorul
// listei complete fullApts, pastrand neatinsa pozitia oricarui element care nu
// face parte din subset — necesar pentru ca Apartamente/Cheltuieli/Facturi grupeaza
// apartamentele diferit (dupa nota, dupa cod AB, dupa cine are facturi), deci nu putem
// presupune ca subsetul afisat pe o pagina corespunde unui bloc contiguu in lista completa.
export function reorderAptsSubset<T extends { id: string }>(fullApts: T[], subsetIds: string[], oldIndex: number, newIndex: number): T[] {
  const positions: number[] = []
  fullApts.forEach((a, idx) => { if (subsetIds.includes(a.id)) positions.push(idx) })
  const reorderedIds = [...subsetIds]
  const [moved] = reorderedIds.splice(oldIndex, 1)
  reorderedIds.splice(newIndex, 0, moved)
  const byId = new Map(fullApts.map(a => [a.id, a]))
  const newFull = [...fullApts]
  positions.forEach((pos, k) => { newFull[pos] = byId.get(reorderedIds[k])! })
  return newFull
}

// Salveaza ordinea curenta (indexul din array) ca valoare ordine pentru fiecare apartament
export async function persistAptOrdine(orderedApts: { id: string }[]) {
  await Promise.all(orderedApts.map((a, idx) => supabase.from('apartamente').update({ ordine: idx }).eq('id', a.id)))
}

export type Proprietar = {
  id: string; nume: string; email?: string; telefon?: string; iban?: string
  banca?: string; adresa?: string; cnp_cui?: string; nota?: string; activ: boolean; created_at: string
}
export type Apartament = {
  id: string; nume: string; adresa: string; zona?: string; nr_camere: number
  capacitate_max: number; pret_standard: number; proprietar_id?: string; proprietar?: Proprietar
  comision_tip: string; comision_procent: number; comision_fix: number; costuri_admin: string[]
  cost_curatenie_per_rezervare?: number
  link_airbnb?: string; link_booking?: string; link_site?: string; instructiuni_checkin?: string
  mesaj_checkin?: string; mesaj_checkout?: string
  link_maps?: string; booking_links?: string[]; airbnb_links?: string[]
  reguli?: string; dotari?: string[]; status: string; nota?: string; created_at: string
  utilitati_la_proprietar?: boolean
  cod_locker?: string
  ordine?: number
}
export type Rezervare = {
  id: string; apartament_id: string; apartament?: Apartament; proprietar_id?: string; proprietar?: Proprietar
  canal: string; nume_client: string; email_client?: string; telefon_client?: string
  data_checkin: string; data_checkout: string; nr_nopti: number; nr_persoane: number
  valoare_bruta: number; taxa_curatenie_incasata: number; suma_incasata: number; moneda: string
  status_plata: string; status_rezervare: string; comision_platforma_procent: number
  comision_platforma_valoare: number; tva_comision_platforma: number; cost_curatenie: number
  cost_spalatorie: number; cost_consumabile: number; cost_mentenanta: number; alte_costuri: number
  baza_calcul_comision: number; comision_administrator: number; suma_proprietar: number
  platit_proprietar?: boolean; suma_platita_proprietar?: number; data_plata_proprietar?: string
  status_decont: string; status_facturare?: string; observatii?: string; mesaj_checkin?: string; mesaj_checkout?: string; created_at: string
}
export type Cheltuiala = {
  id: string; apartament_id: string; apartament?: Apartament; proprietar_id?: string; rezervare_id?: string
  data: string; categorie: string; descriere: string; valoare: number; tva: number
  suportat_de: string; procent_impartit: number; atasament_url?: string; status: string; nota?: string; created_at: string
}
export type Decont = {
  id: string; apartament_id: string; apartament?: Apartament; proprietar_id?: string; proprietar?: Proprietar
  luna: number; an: number; perioada_start: string; perioada_sfarsit: string
  total_incasari: number; total_comisioane_platforme: number; total_tva_platforme: number
  total_costuri_operationale: number; baza_comision_administrator: number
  comision_administrator_procent: number; comision_administrator_valoare: number
  suma_neta_proprietar: number; nr_nopti_ocupate: number; nr_rezervari: number
  grad_ocupare: number; status: string; data_platii?: string; nota?: string; created_at: string
}
export type Task = {
  id: string; apartament_id: string; apartament?: Apartament; rezervare_id?: string
  tip: string; titlu: string; descriere?: string; data_limita?: string; ora_limita?: string
  responsabil?: string; status: string; prioritate: string; nota?: string; created_at: string
}

export function calculeazaDecont(
  rezervare: Partial<Rezervare>, apartament: Partial<Apartament>
): { baza: number; comision: number; suma_proprietar: number } {
  const brut = Number(rezervare.valoare_bruta || 0)
  const comPlatf = Number(rezervare.comision_platforma_valoare || 0)
  const tvaPlatf = Number(rezervare.tva_comision_platforma || 0)
  const costCuratenie = Number(rezervare.cost_curatenie || 0)
  const costSpalat = Number(rezervare.cost_spalatorie || 0)
  const costConsumabile = Number(rezervare.cost_consumabile || 0)
  const costMentenanta = Number(rezervare.cost_mentenanta || 0)
  const alteCosturi = Number(rezervare.alte_costuri || 0)
  const tip = apartament.comision_tip || 'procent_net_dupa_costuri'
  const procent = Number(apartament.comision_procent || 20) / 100
  const fix = Number(apartament.comision_fix || 0)
  const totalCosturi = costCuratenie + costSpalat + costConsumabile + costMentenanta + alteCosturi
  let baza = 0; let comision = 0
  if (tip === 'procent_brut') { baza = brut; comision = baza * procent }
  else if (tip === 'procent_net_platforme') { baza = brut - comPlatf - tvaPlatf; comision = baza * procent }
  else if (tip === 'procent_net_dupa_costuri') { baza = brut - comPlatf - tvaPlatf - totalCosturi; comision = baza * procent }
  else if (tip === 'fix_lunar') { baza = brut - comPlatf - tvaPlatf - totalCosturi; comision = fix }
  else if (tip === 'mixt') { baza = brut - comPlatf - tvaPlatf - totalCosturi; comision = fix + baza * procent }
  else if (tip === 'fara_comision') { baza = brut - comPlatf - tvaPlatf - totalCosturi; comision = 0 }
  const suma_proprietar = Math.max(0, baza - comision)
  return { baza: Math.round(baza*100)/100, comision: Math.round(comision*100)/100, suma_proprietar: Math.round(suma_proprietar*100)/100 }
}

export const CANALE_LABEL: Record<string, string> = { booking:'Booking.com', airbnb:'Airbnb', direct:'Direct', telefon:'Telefon', whatsapp:'WhatsApp', site:'Site propriu' }
export const STATUS_REZERVARE_LABEL: Record<string, string> = { cerere:'Cerere', confirmata:'Confirmată', anulata:'Anulată', finalizata:'Finalizată' }
export const STATUS_PLATA_LABEL: Record<string, string> = { neplatit:'Neplatit', avans:'Avans', achitat:'Achitat' }
export const STATUS_DECONT_LABEL: Record<string, string> = { nedecontat:'Nedecontat', inclus:'Inclus în decont', decontat:'Decontat' }
export const STATUS_FACTURARE_LABEL: Record<string, string> = { nefacturat:'Nefacturat', de_facturat:'De facturat', facturata:'Facturată' }
export const CATEGORII_CHELTUIELI = ['curatenie','spalatorie','consumabile','mentenanta','reparatii','comision_booking','comision_airbnb','tva_platforma','contabilitate','fotografii','alte']
export const CATEGORII_LABEL: Record<string, string> = { curatenie:'Curățenie', spalatorie:'Spălătorie / Lenjerii', consumabile:'Consumabile', mentenanta:'Mentenanță', reparatii:'Reparații', comision_booking:'Comision Booking', comision_airbnb:'Comision Airbnb', tva_platforma:'TVA / Taxă platformă', contabilitate:'Contabilitate', fotografii:'Fotografii / Promovare', alte:'Alte cheltuieli' }
export const LUNI = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

// Notificarile catre proprietar (rezervare noua / check-in azi / check-out azi, atat bannerele
// automate de pe Dashboard cat si butonul manual din Rezervari) raman active DOAR la aceste 3
// locatii, cerut direct: "functia asta de notifica proprietarii se pastreaza doar la locatiile
// urmatoare... Nu si la celelalte, ca dam sistemul peste cap" — restul proprietarilor nu se
// asteapta la aceste mesaje. Id-uri (nu nota/nume) fiindca 2 din cele 3 nu au nota setata.
// Proprietarii care primesc mesaje pe WhatsApp (rezervare noua, check-in azi, check-out azi).
// Dupa PROPRIETAR, nu dupa apartament - bug raportat: Cherry 3 (al Emmei, adaugat mai tarziu) nu
// aparea la „anunta proprietarii”, fiindca lista fixa avea doar ID-ul lui Cherry 2. Acum orice
// apartament nou al acestor proprietari e inclus automat.
export const PROPRIETAR_NOTIF_IDS = [
  'd6c82f18-14a2-4240-8f81-80086f38bd25', // Danut - VM07 Vila Păcurari
  'f9d803ec-571e-4db2-9a74-cc3daee35d4e', // Emma - Cherry 2 + Cherry 3 by AB Homes
  '38daf039-b044-4461-ad07-9bf79cb17eaa', // Petrică Ancuța - Comfy & Chic Apartment
]
// Pretul rezervarii pentru mesajele catre proprietar: valoarea bruta, iar daca e 0 (ex. rezervari
// interne din calendar, care au doar suma incasata) suma incasata. Text gata de pus in mesaj sau ''.
export function pretRezervareText(r: any): string {
  const v = Number(r?.valoare_bruta) > 0 ? Number(r.valoare_bruta) : Number(r?.suma_incasata) || 0
  if (!(v > 0)) return ''
  return `${v.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${r?.moneda || 'RON'}`
}
export function notificaProprietar(r: any): boolean {
  const prop = r?.apartament?.proprietar
  return !!prop?.telefon && PROPRIETAR_NOTIF_IDS.includes(prop?.id || r?.apartament?.proprietar_id)
}

// Inputuri numerice controlate — raportat direct: la orice input type="number" din aplicatie,
// stergerea completa a cifrelor revenea fortat la 0 la fiecare tasta, deci nu puteai goli
// campul ca sa scrii o cifra noua de la zero. numVal/numInput lasa campul gol cat timp editezi
// (o valoare '' e omisa/tratata ca 0 de restul codului, care oricum face `valoare||0` la citire).
export function numVal(v: number | '' | null | undefined, fallback: number): number | '' {
  return v === '' ? '' : (v ?? fallback)
}
export function numInput(raw: string, fallback: number = 0): number | '' {
  return raw === '' ? '' : (parseFloat(raw) || fallback)
}

// prefixul 40 se adauga DOAR la numere mobile romanesti reale (07xxxxxxxx, 10 cifre) -
// orice alt numar de 10 cifre care incepe cu 0 (ex. mobil strain scris local) ramane neatins
export function normalizeWaPhone(phone: string): string {
  const clean = (phone || '').replace(/\D/g, '')
  if (clean.startsWith('00')) return clean.slice(2)
  if (clean.length === 10 && clean.startsWith('07')) return '4' + clean
  return clean
}
