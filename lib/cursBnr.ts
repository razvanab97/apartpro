// Cursul BNR (lei pentru 1 unitate de valuta) - folosit pe server: /api/curs-bnr, facturare, reamintirea de incasari.
// Istoricul vine din fisierul anual al BNR (o zi lucratoare = un <Cube date=…>); pastram doar monedele folosite la rezervari.

export const MONEDE_REZ = ['RON', 'EUR', 'USD', 'GBP'] as const
export type Istoric = Record<string, Record<string, number>>   // { '2026-01-05': { EUR: 5.09, USD: …, GBP: … } }

export function rateDinXml(txt: string): Record<string, number> {
  const o: Record<string, number> = {}
  for (const m of txt.matchAll(/<Rate currency="([A-Z]{3})"(?:\s+multiplier="(\d+)")?[^>]*>([\d.]+)<\/Rate>/g)) {
    const v = parseFloat(m[3]) / (Number(m[2]) || 1); if (v > 0) o[m[1]] = v
  }
  return o
}

export function istoricDinXml(txt: string, monede: readonly string[] = MONEDE_REZ): Istoric {
  const out: Istoric = {}
  for (const c of txt.matchAll(/<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g)) {
    const r = rateDinXml(c[2]), z: Record<string, number> = {}
    for (const m of monede) if (r[m]) z[m] = r[m]
    if (Object.keys(z).length) out[c[1]] = z
  }
  return out
}

// cursul valabil intr-o zi: ultima zi publicata <= ziua ceruta (weekend / sarbatori -> ziua lucratoare dinainte)
export function cursLaData(ist: Istoric, moneda: string, iso: string): number {
  const zile = Object.keys(ist).sort()
  let v = 0
  for (const z of zile) { if (z > iso) break; if (ist[z][moneda]) v = ist[z][moneda] }
  if (!v) for (const z of zile) if (ist[z][moneda]) { v = ist[z][moneda]; break }   // inainte de prima zi publicata
  return v
}

const cacheAn = new Map<number, { ist: Istoric; ts: number }>()
export async function istoricAn(an: number): Promise<Istoric> {
  const c = cacheAn.get(an), anCurent = new Date().getFullYear()
  if (c && (an < anCurent || Date.now() - c.ts < 3 * 3600 * 1000)) return c.ist
  try {
    const res = await fetch(`https://curs.bnr.ro/files/xml/years/nbrfxrates${an}.xml`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error('BNR ' + res.status)
    const ist = istoricDinXml(await res.text())
    cacheAn.set(an, { ist, ts: Date.now() })
    return ist
  } catch { return c?.ist || {} }
}

// lei pentru o suma in valuta, la cursul BNR al zilei (ziua trecuta / azi; viitorul -> ultimul curs publicat)
export async function cursServer(moneda: string, iso = new Date().toISOString().slice(0, 10)): Promise<number> {
  const m = String(moneda || 'RON').toUpperCase()
  if (m === 'RON') return 1
  const an = Number(iso.slice(0, 4)), azi = new Date().getFullYear()
  let ist = await istoricAn(Math.min(an, azi))
  if (!Object.keys(ist).length && an > 2005) ist = await istoricAn(Math.min(an, azi) - 1)
  return cursLaData(ist, m, iso)
}

// pe server: cursul folosit pentru o rezervare (ziua check-in-ului; rezervari viitoare -> ultimul curs publicat)
export async function cursRezervareServer(r: { moneda?: string | null; data_checkin?: string | null }): Promise<number> {
  const m = String(r?.moneda || 'RON').toUpperCase()
  if (m === 'RON') return 1
  const azi = new Date().toISOString().slice(0, 10), zi = String(r?.data_checkin || azi).slice(0, 10)
  return (await cursServer(m, zi < azi ? zi : azi)) || 1
}
