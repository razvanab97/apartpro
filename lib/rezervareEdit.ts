import { supabase, calculeazaDecont, type Apartament } from '@/lib/supabase'

// Logica formularului complet de rezervare, comuna paginii Rezervari si calendarului (butonul
// „Editează” din cardul rezervarii) - aceeasi salvare in ambele locuri, nu doua variante diferite.

export const SELECT_REZERVARE = '*, apartament:apartamente(id,nume,nota,comision_tip,comision_procent,comision_fix,proprietar_id,proprietar:proprietari(id,nume,telefon)), proprietar:proprietari(id,nume)'

export function cuApartament(prev: any, aptId: string, apartamente: Apartament[]) {
  const apt = apartamente.find(a => a.id === aptId)
  return {
    ...prev,
    apartament_id: aptId,
    proprietar_id: apt?.proprietar_id || '',
    comision_platforma_procent: aptId.includes('booking') ? 15 : 0,
  }
}

export function cuComision(prev: any, brut: number | '', pct: number | '') {
  const val = Number(brut || 0) * Number(pct || 0) / 100
  const tva = val * 0.19
  return {
    ...prev,
    valoare_bruta: brut,
    comision_platforma_procent: pct,
    comision_platforma_valoare: Math.round(val * 100) / 100,
    tva_comision_platforma: Math.round(tva * 100) / 100,
  }
}

export function decont(editing: any, apartamente: Apartament[]) {
  const apt = apartamente.find(a => a.id === editing?.apartament_id)
  return apt ? calculeazaDecont(editing, apt) : null
}

// Valideaza si salveaza (insert pentru rezervare noua, update altfel). Intoarce mesajul de eroare sau null.
export async function salveazaRezervare(editing: any, apartamente: Apartament[]): Promise<string | null> {
  if (!editing.nume_client) return 'Completează numele clientului'
  if (!editing.data_checkin || !editing.data_checkout) return 'Completează datele'
  if (editing.data_checkout <= editing.data_checkin) return 'Data checkout trebuie să fie după check-in'

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
  for (const k of ['id', 'apartament', 'proprietar', 'nr_nopti', 'created_at', 'updated_at', 'rezervare_id']) delete payload[k]

  const { error } = editing.id
    ? await supabase.from('rezervari').update(payload).eq('id', editing.id)
    : await supabase.from('rezervari').insert(payload)
  return error ? error.message : null
}
