// Rezervari in valuta (cerut direct: „să putem seta prețurile și în euro, acolo unde vrem, în zonele unde setăm rezervările”
// → ales: „rezervarea rămâne în EUR”). Toate sumele unei rezervari sunt in moneda ei (coloana `moneda`); oriunde se ADUNA
// bani (Statistici, Rapoarte, Deconturi, panoul principal, calculatorul din Calendar …) sumele se trec in lei cu `laLei`,
// la cursul BNR din ziua check-in-ului (rezervarile viitoare: ultimul curs publicat) - rapoartele lunilor trecute raman fixe.
import { cursLaData, MONEDE_REZ, type Istoric } from '@/lib/cursBnr'
export { MONEDE_REZ }

// toate coloanele cu bani ale unei rezervari (in moneda rezervarii)
export const CAMPURI_BANI = ['valoare_bruta', 'suma_incasata', 'taxa_curatenie_incasata', 'avans', 'avans_cerut', 'comision_platforma_valoare', 'tva_comision_platforma',
  'cost_curatenie', 'cost_spalatorie', 'cost_consumabile', 'cost_mentenanta', 'alte_costuri', 'baza_calcul_comision', 'comision_administrator', 'suma_proprietar', 'suma_platita_proprietar'] as const

const monedaDe = (r: any) => String(r?.moneda || 'RON').toUpperCase()
export const eValuta = (r: any) => monedaDe(r) !== 'RON'

const aziIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
let istoric: Istoric = {}
const aniCeruti = new Map<number, Promise<void>>()
function incarcaAni(ani: number[]) {
  const lipsa = Array.from(new Set(ani)).filter(a => a >= 2005 && a <= new Date().getFullYear() && !aniCeruti.has(a))
  if (lipsa.length) {
    const p = fetch('/api/curs-bnr?ani=' + lipsa.join(',')).then(r => r.json()).then(j => { if (j?.istoric) istoric = { ...istoric, ...j.istoric } }).catch(() => {})
    lipsa.forEach(a => aniCeruti.set(a, p))
  }
  return Promise.all(Array.from(new Set(ani)).map(a => aniCeruti.get(a)).filter(Boolean))
}

// cursul (lei pentru 1 unitate) folosit pentru o rezervare; 0 daca nu e cunoscut
export function cursRezervare(r: any): number {
  const m = monedaDe(r)
  if (m === 'RON') return 1
  const zi = String(r?.data_checkin || '').slice(0, 10) || aziIso()
  return cursLaData(istoric, m, zi < aziIso() ? zi : aziIso())
}

// copia rezervarii cu toate sumele in lei (rezervarile in RON raman neatinse)
export function inLei<T>(r: T): T {
  if (!eValuta(r)) return r
  const k = cursRezervare(r)
  if (!k) return r
  const o: any = { ...(r as any) }
  for (const f of CAMPURI_BANI) if (o[f] != null && o[f] !== '') o[f] = Math.round(Number(o[f]) * k * 100) / 100
  o.moneda_originala = o.moneda; o.moneda = 'RON'
  return o
}

// trece o lista de rezervari in lei (incarca o singura data cursurile anilor necesari); fara valuta -> intoarce lista ca atare
export async function laLei<T>(randuri: T[] | null | undefined): Promise<T[]> {
  const rows = randuri || []
  if (!rows.some(eValuta)) return rows
  const ani = rows.filter(eValuta).map((r: any) => Number(String(r.data_checkin || aziIso()).slice(0, 4)) || new Date().getFullYear())
  await incarcaAni([...ani.map(a => Math.min(a, new Date().getFullYear())), new Date().getFullYear()])
  return rows.map(inLei)
}

// cursul de azi pentru o moneda (afisare „≈ X RON”); 0 daca nu s-a incarcat
export async function cursAzi(moneda: string): Promise<number> {
  const m = String(moneda || 'RON').toUpperCase()
  if (m === 'RON') return 1
  await incarcaAni([new Date().getFullYear()])
  return cursLaData(istoric, m, aziIso())
}

export const fmtBaniM = (v: number, moneda = 'RON') => `${(Number(v) || 0).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} ${moneda || 'RON'}`
