import { createClient } from '@supabase/supabase-js'

const DIRECT_URL = 'https://lsmraxevzkmupaidianv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbXJheGV2emttdXBhaWRpYW52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkwMDA5NywiZXhwIjoyMDk1NDc2MDk3fQ.CagkIVPFE6r8D1oZPoxvs3jzJDR3HSwtx0GzM0etpss'

// În browser: rutăm prin proxy Next.js (/api/supa) ca să ocolim blocările de extensii/ETP
// Pe server: merge direct la Supabase
const supabaseUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/api/supa`
  : DIRECT_URL

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Proprietar = {
  id: string; nume: string; email?: string; telefon?: string; iban?: string
  banca?: string; adresa?: string; cnp_cui?: string; nota?: string; activ: boolean; created_at: string
}
export type Apartament = {
  id: string; nume: string; adresa: string; zona?: string; nr_camere: number
  capacitate_max: number; pret_standard: number; proprietar_id?: string; proprietar?: Proprietar
  comision_tip: string; comision_procent: number; comision_fix: number; costuri_admin: string[]
  link_airbnb?: string; link_booking?: string; link_site?: string; instructiuni_checkin?: string
  mesaj_checkin?: string; mesaj_checkout?: string
  link_maps?: string; booking_links?: string[]; airbnb_links?: string[]
  reguli?: string; dotari?: string[]; status: string; nota?: string; created_at: string
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
  status_decont: string; observatii?: string; mesaj_checkin?: string; mesaj_checkout?: string; created_at: string
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
  const suma_proprietar = Math.max(0, baza - comision)
  return { baza: Math.round(baza*100)/100, comision: Math.round(comision*100)/100, suma_proprietar: Math.round(suma_proprietar*100)/100 }
}

export const CANALE_LABEL: Record<string, string> = { booking:'Booking.com', airbnb:'Airbnb', direct:'Direct', telefon:'Telefon', whatsapp:'WhatsApp', site:'Site propriu' }
export const STATUS_REZERVARE_LABEL: Record<string, string> = { cerere:'Cerere', confirmata:'Confirmată', anulata:'Anulată', finalizata:'Finalizată' }
export const STATUS_PLATA_LABEL: Record<string, string> = { neplatit:'Neplatit', avans:'Avans', achitat:'Achitat' }
export const STATUS_DECONT_LABEL: Record<string, string> = { nedecontat:'Nedecontat', inclus:'Inclus în decont', decontat:'Decontat' }
export const CATEGORII_CHELTUIELI = ['curatenie','spalatorie','consumabile','mentenanta','reparatii','comision_booking','comision_airbnb','tva_platforma','contabilitate','fotografii','alte']
export const CATEGORII_LABEL: Record<string, string> = { curatenie:'Curățenie', spalatorie:'Spălătorie / Lenjerii', consumabile:'Consumabile', mentenanta:'Mentenanță', reparatii:'Reparații', comision_booking:'Comision Booking', comision_airbnb:'Comision Airbnb', tva_platforma:'TVA / Taxă platformă', contabilitate:'Contabilitate', fotografii:'Fotografii / Promovare', alte:'Alte cheltuieli' }
export const LUNI = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
