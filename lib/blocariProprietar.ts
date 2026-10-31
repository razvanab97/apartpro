// Calendar pentru proprietari (cerut direct: „un link pe baza căruia să apară rezervările de la Cherry 2 și 3, tip
// calendar, și să poată bloca și proprietarii alte zile — ceva simplu; în caz că e blocat, eu să știu”).
// Fara migrare - totul in setari:
//   linkuri_proprietari  = { <token>: { nume, apts: [aptId] } }        - cine vede ce
//   blocari_proprietari  = [ { id, apt, de_la, pana_la, nota, token, nume, creat_la } ]
// de_la / pana_la = NOPTILE blocate, inclusiv (ex. de_la 12, pana_la 14 = noptile 12, 13, 14; liber din 15).
// Blocarile NU sunt rezervari (n-ar trebui sa genereze curatenie, mesaje, rapoarte) - apar doar ca zile hasurate
// in Calendar si ca notificare.

export type LinkProprietar = { nume: string; apts: string[] }
export type Blocare = { id: string; apt: string; de_la: string; pana_la: string; nota: string; token: string; nume: string; creat_la: string }

export const CHEIE_LINKURI = 'linkuri_proprietari'
export const CHEIE_BLOCARI = 'blocari_proprietari'

// noaptea `zi` (YYYY-MM-DD) e blocata?
export const blocataIn = (b: Pick<Blocare, 'de_la' | 'pana_la'>, zi: string) => b.de_la <= zi && zi <= b.pana_la

export function parseBlocari(v: string | null | undefined): Blocare[] {
  try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : [] } catch { return [] }
}
