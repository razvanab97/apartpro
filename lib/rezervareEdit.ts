import { supabase, calculeazaDecont, type Apartament } from '@/lib/supabase'
import { comisionPlatforma, procentPlatforma } from '@/lib/comisionPlatforma'

// Logica formularului complet de rezervare, comuna paginii Rezervari si calendarului (butonul
// „Editează” din cardul rezervarii) - aceeasi salvare in ambele locuri, nu doua variante diferite.

export const SELECT_REZERVARE = '*, apartament:apartamente(id,nume,nota,comision_tip,comision_procent,comision_fix,proprietar_id,proprietar:proprietari(id,nume,telefon)), proprietar:proprietari(id,nume)'

export function cuApartament(prev: any, aptId: string, apartamente: Apartament[]) {
  const apt = apartamente.find(a => a.id === aptId)
  return {
    ...prev,
    apartament_id: aptId,
    proprietar_id: apt?.proprietar_id || '',
    // (inainte: procentul se reseta la 0 la orice schimbare de apartament - comisionul platformei nu tine de apartament)
  }
}

// Schimbarea canalului: Airbnb 15% / Booking 17% + TVA 21% din comision; celelalte canale fara comision de platforma
export function cuCanal(prev: any, canal: string) {
  const fact = canal === 'airbnb' && (!prev.status_facturare || prev.status_facturare === 'nefacturat') ? { status_facturare: 'de_facturat' } : {}
  return { ...prev, canal, ...fact, ...comisionPlatforma(Number(prev.valoare_bruta) || 0, procentPlatforma(canal)) }
}

export function cuComision(prev: any, brut: number | '', pct: number | '') {
  // TVA intracomunitar 21% din comision (inainte 19%)
  return { ...prev, valoare_bruta: brut, ...comisionPlatforma(Number(brut || 0), Number(pct || 0)), comision_platforma_procent: pct }
}

export function decont(editing: any, apartamente: Apartament[]) {
  const apt = apartamente.find(a => a.id === editing?.apartament_id)
  return apt ? calculeazaDecont(editing, apt) : null
}

export function validareRezervare(editing: any): string | null {
  if (!editing.nume_client) return 'Completează numele clientului'
  if (!editing.data_checkin || !editing.data_checkout) return 'Completează datele'
  if (editing.data_checkout <= editing.data_checkin) return 'Data checkout trebuie să fie după check-in'
  return null
}

// Randul gata de scris in baza de date (decontul calculat, numerele curatate, campurile calculate scoase)
export function payloadRezervare(editing: any, apartamente: Apartament[]) {
  const apt = apartamente.find(a => a.id === editing.apartament_id)
  const c = calculeazaDecont(editing, apt || {})
  const payload = {
    ...editing,
    baza_calcul_comision: c.baza,
    comision_administrator: c.comision,
    suma_proprietar: c.suma_proprietar,
    // UUID-urile goale devin null
    apartament_id: editing.apartament_id || null,
    proprietar_id: editing.proprietar_id || null,
    // Campurile numerice pot fi ramase '' daca inputul a fost golit (vezi numVal/numInput) - trimise ca 0
    nr_persoane: Number(editing.nr_persoane) || 1,
    valoare_bruta: Number(editing.valoare_bruta) || 0,
    taxa_curatenie_incasata: Number(editing.taxa_curatenie_incasata) || 0,
    suma_incasata: Number(editing.suma_incasata) || 0,
    comision_platforma_procent: Number(editing.comision_platforma_procent) || 0,
    comision_platforma_valoare: Number(editing.comision_platforma_valoare) || 0,
    tva_comision_platforma: Number(editing.tva_comision_platforma) || 0,
    cost_curatenie: Number(editing.cost_curatenie) || 0,
    cost_spalatorie: Number(editing.cost_spalatorie) || 0,
    cost_consumabile: Number(editing.cost_consumabile) || 0,
    cost_mentenanta: Number(editing.cost_mentenanta) || 0,
    alte_costuri: Number(editing.alte_costuri) || 0,
    cod_rezervare_platforma: String(editing.cod_rezervare_platforma || '').trim() || null,
    platit_proprietar: !!editing.platit_proprietar,
    suma_platita_proprietar: editing.platit_proprietar ? (Number(editing.suma_platita_proprietar) || 0) : null,
    data_plata_proprietar: editing.platit_proprietar ? (editing.data_plata_proprietar || new Date().toISOString().slice(0, 10)) : null,
  }
  // avansul (coloanele avans / avans_data / avans_metoda): trimis doar daca rezervarea il are, ca o baza de date fara
  // migrarea de avans sa salveze in continuare rezervarile fara avans
  if ('avans' in editing || 'avans_data' in editing || 'avans_metoda' in editing) {
    const av = Math.round((Number(editing.avans) || 0) * 100) / 100
    Object.assign(payload, { avans: av, avans_data: av > 0 ? (editing.avans_data || new Date().toISOString().slice(0, 10)) : null, avans_metoda: av > 0 ? (editing.avans_metoda || null) : null })
  }
  // avansul de incasat (coloanele avans_cerut / avans_termen): la fel, trimis doar daca e pus, ca fara migrare sa nu blocheze
  if ('avans_cerut' in editing || 'avans_termen' in editing) {
    const ac = Math.round((Number(editing.avans_cerut) || 0) * 100) / 100
    Object.assign(payload, { avans_cerut: ac > 0 ? ac : null, avans_termen: ac > 0 ? (editing.avans_termen || null) : null })
  }
  // rezervare Airbnb noua -> „De facturat”
  if (!editing.id && payload.canal === 'airbnb' && (!payload.status_facturare || payload.status_facturare === 'nefacturat')) payload.status_facturare = 'de_facturat'
  for (const k of ['id', 'apartament', 'proprietar', 'nr_nopti', 'created_at', 'updated_at', 'rezervare_id']) delete payload[k]
  return payload
}

// Valideaza si salveaza (insert pentru rezervare noua, update altfel). Intoarce mesajul de eroare sau null.
export async function salveazaRezervare(editing: any, apartamente: Apartament[]): Promise<string | null> {
  const invalid = validareRezervare(editing)
  if (invalid) return invalid
  const payload = payloadRezervare(editing, apartamente)
  const { error } = editing.id
    ? await supabase.from('rezervari').update(payload).eq('id', editing.id)
    : await supabase.from('rezervari').insert(payload)
  if (error && /avans_cerut|avans_termen/i.test(error.message)) return 'Avansul de încasat nu se poate salva încă: rulează în Supabase migrarea (coloanele avans_cerut, avans_termen)'
  if (error && /avans/i.test(error.message)) return 'Avansul nu se poate salva încă: rulează în Supabase migrarea pentru avans (coloanele avans, avans_data, avans_metoda)'
  return error ? error.message : null
}
