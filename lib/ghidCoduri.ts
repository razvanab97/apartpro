import type { Acces, Ghid } from '@/lib/ghid'
// fara alte importuri: e folosit si de pagina publica a ghidului (components/GhidView.tsx) - nu trebuie sa traga clientul bazei de date
// Coduri din „Acces rapid” scrise automat in pasi (cerut direct: „nu putem trece aici automat codul pe care îl avem în
// partea de sus, pe care cineva îl omite? și de fiecare dată când se modifică sus, să se modifice și aici”).
// In textul unui pas scrii {cod} (codul marcat portocaliu / primul), {wifi}, {parola wifi} sau eticheta exacta
// din Acces rapid, ex. {Cod locker cheie} - pe pagina oaspetelui apare valoarea de sus, mereu cea actuala.
export type BucataText = { text: string } | { cod: string }
const normEt = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function valoareAcces(cheie: string, acces: Acces[]): string | null {
  const k = normEt(cheie), cu = acces.filter(a => a.valoare.trim())
  const dupaEticheta = cu.find(a => normEt(a.ro) === k || normEt(a.en) === k)
  if (dupaEticheta) return dupaEticheta.valoare
  const parola = (a: Acces) => /parol|password|pass/.test(normEt(a.ro + ' ' + a.en))
  if (k === 'cod' || k === 'code') return (cu.find(a => a.cod) || cu[0])?.valoare || null
  if (/^(parola|parola wifi|wifi password|password)$/.test(k)) return cu.find(parola)?.valoare || null
  if (k === 'wifi' || k === 'wi fi') return cu.find(a => /wi ?fi/.test(normEt(a.ro + ' ' + a.en)) && !parola(a))?.valoare || null
  return null
}
export function cuCoduri(text: string, acces: Acces[]): BucataText[] {
  const out: BucataText[] = []; let last = 0
  for (const m of Array.from(text.matchAll(/\{([^{}\n]{1,40})\}/g))) {
    const v = valoareAcces(m[1], acces)
    if (v == null) continue
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    out.push({ cod: v }); last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

// Ghidul asa cum il vede oaspetele: fara pasii / pozele / regulile / randurile din Acces rapid marcate „ascuns”
export function doarVizibile(g: Ghid): Ghid {
  return { ...g, acces: g.acces.filter(a => !a.ascuns), reguli: g.reguli.filter(r => !r.ascuns),
    pasi: g.pasi.filter(p => !p.ascuns).map(p => ({ ...p, media: p.media.filter(m => !m.ascuns) })) }
}
