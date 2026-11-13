// Raportul de castiguri Airbnb (Câștiguri → Exportă CSV), adaugat din cand in cand (cerut direct: „putem să adăugăm acest
// document ocazional și să se factureze automat?”). Pe fiecare cod de rezervare: castigul brut (= suma facturata: incasarea +
// taxa de servicii Airbnb), ajustarile din Centrul de soluționare si firma in contul careia s-a platit (randul Payout de deasupra).

export type RandRaport = {
  cod: string; oaspete: string; checkin: string; checkout: string; nopti: number; anunt: string
  brut: number            // Câștiguri brute ale rezervarii
  incasat: number         // Suma (ce a ajuns la noi)
  ajustari: { tip: string; suma: number; detalii: string }[]
  firma: string           // „AB TEXTILE SRL”, „ABXHOMES SRL” ...
}

// CSV cu ghilimele ("346,12", "Transferă la ..., IBAN ...")
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let rand: string[] = [], camp = '', ghil = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (ghil) { if (c === '"') { if (t[i + 1] === '"') { camp += '"'; i++ } else ghil = false } else camp += c; continue }
    if (c === '"') ghil = true
    else if (c === ',') { rand.push(camp); camp = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; rand.push(camp); camp = ''; if (rand.some(x => x !== '')) out.push(rand); rand = [] }
    else camp += c
  }
  rand.push(camp); if (rand.some(x => x !== '')) out.push(rand)
  return out
}
// „1886.88”, „346,12”, „1.234,56”, „1,234.56”
export function numar(v?: string): number {
  let s = String(v || '').trim().replace(/\s/g, '')
  if (!s) return 0
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s); return isFinite(n) ? n : 0
}
// MM/DD/YYYY (exportul Airbnb) -> YYYY-MM-DD
export const dataUS = (d?: string) => { const m = String(d || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '' }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function citesteRaport(text: string): { randuri: RandRaport[]; eroare?: string } {
  const r = parseCsv(text)
  if (r.length < 2) return { randuri: [], eroare: 'Fișierul e gol' }
  const cap = r[0].map(norm)
  const col = (...nume: string[]) => cap.findIndex(c => nume.some(n => c === n))
  const I = {
    tip: col('tip', 'type'), cod: col('cod de confirmare', 'confirmation code'), ci: col('data de inceput', 'start date'), co: col('data de sfarsit', 'end date'),
    nopti: col('nopti', 'nights'), oaspete: col('oaspete', 'guest'), anunt: col('anunt', 'listing'), detalii: col('detalii', 'details'),
    suma: col('suma', 'amount'), brut: col('castiguri brute', 'gross earnings'),
  }
  if (I.tip < 0 || I.cod < 0 || I.brut < 0) return { randuri: [], eroare: 'Nu pare raportul de câștiguri Airbnb (lipsesc coloanele „Tip”, „Cod de confirmare” sau „Câștiguri brute”)' }
  const pe = new Map<string, RandRaport>()
  let firma = ''
  for (const x of r.slice(1)) {
    const tip = norm(x[I.tip] || ''), cod = String(x[I.cod] || '').trim().toUpperCase()
    if (tip === 'payout' || tip === 'plata' || tip === 'transfer') { firma = (String(x[I.detalii] || '').match(/(?:la|to)\s+(.+?),\s*IBAN/i)?.[1] || '').trim(); continue }
    if (!cod) continue
    let e = pe.get(cod)
    if (!e) { e = { cod, oaspete: String(x[I.oaspete] || '').trim(), checkin: dataUS(x[I.ci]), checkout: dataUS(x[I.co]), nopti: Number(x[I.nopti]) || 0, anunt: String(x[I.anunt] || '').trim(), brut: 0, incasat: 0, ajustari: [], firma }; pe.set(cod, e) }
    if (tip === 'rezervare' || tip === 'reservation') { e.brut = Math.round((e.brut + numar(x[I.brut])) * 100) / 100; e.incasat = Math.round((e.incasat + numar(x[I.suma])) * 100) / 100; e.firma = firma || e.firma }
    else e.ajustari.push({ tip: String(x[I.tip]).trim(), suma: numar(x[I.brut]) || numar(x[I.suma]), detalii: String(x[I.detalii] || '').trim() })
  }
  return { randuri: [...pe.values()].sort((a, b) => a.checkout.localeCompare(b.checkout)) }
}

export const eFirmaFacturare = (firma: string) => !firma || /ab\s*textile/i.test(firma)
