// Blocari pentru mentenanta (cerut direct: „să putem selecta în calendar date și să le blocăm ca mentenanță și astfel să
// se blocheze locația pe platforme până setăm: mentenanță rezolvată; la mentenanță să putem scrie și informații”).
// Fara migrare - in setari, cheia `blocari_mentenanta` = [ { id, apt, de_la, pana_la, nota, creat_la, rezolvata_la } ]
// de_la / pana_la = NOPTILE blocate, inclusiv (ca la blocarile proprietarilor). O mentenanta e activa (blocheaza) pana
// e marcata rezolvata; dupa aceea ramane doar in istoric (nu mai apare in calendar si nu mai blocheaza nimic).
// Blocarea pe platforme: intra in disponibilitatea trimisa prin 5starDesk PMS Connect (lib/pms5sd `allocation`), deci
// pleaca automat cand PMS Connect trece din test in activ; pana atunci se blocheaza si manual in 5starDesk.
export type Mentenanta = { id: string; apt: string; de_la: string; pana_la: string; nota: string; creat_la: string; rezolvata_la?: string | null }

export const CHEIE_MENTENANTA = 'blocari_mentenanta'

export function parseMentenanta(v: string | null | undefined): Mentenanta[] {
  try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x.filter(m => m && m.id && m.apt && m.de_la && m.pana_la) : [] } catch { return [] }
}
export const mentenantaActiva = (m: Mentenanta) => !m.rezolvata_la
export const active = (lista: Mentenanta[]) => lista.filter(mentenantaActiva)
// noaptea `zi` e blocata de mentenanta?
export const inMentenanta = (m: Pick<Mentenanta, 'de_la' | 'pana_la'>, zi: string) => m.de_la <= zi && zi <= m.pana_la
// ca blocari (forma folosita de allocation / disponibilitatea ofertelor)
export const caBlocari = (lista: Mentenanta[]) => active(lista).map(m => ({ apt: m.apt, de_la: m.de_la, pana_la: m.pana_la }))

// blocarile proprietarilor + mentenantele active, citite impreuna din setari (.in('cheie', CHEI_BLOCARE))
export const CHEI_BLOCARE = ['blocari_proprietari', CHEIE_MENTENANTA]
export function blocariDinSetari(rows: { cheie: string; valoare: string | null }[] | null | undefined): { apt: string; de_la: string; pana_la: string }[] {
  const prop = (rows || []).find(r => r.cheie === 'blocari_proprietari')?.valoare
  const ment = (rows || []).find(r => r.cheie === CHEIE_MENTENANTA)?.valoare
  let p: any[] = []
  try { const x = JSON.parse(prop || '[]'); p = Array.isArray(x) ? x : [] } catch {}
  return [...p, ...caBlocari(parseMentenanta(ment))]
}
