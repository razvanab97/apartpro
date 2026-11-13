import { COM_PLATFORMA, TVA_INTRACOM } from '@/lib/decontComision'

// Comisionul platformei completat singur (cerut direct: „când e Booking sau Airbnb să vină direct procentul - Booking 17%,
// Airbnb 15% - la care se adaugă 21% TVA intracomunitar din suma comisionului. Ex: comision 100 RON → TVA 21 RON”).
// Aceleasi procente ca in decontul lunar (lib/decontComision.ts).
const r2 = (n: number) => Math.round(n * 100) / 100
export const procentPlatforma = (canal: string | null | undefined) => Math.round((COM_PLATFORMA[String(canal || '')] || 0) * 100)
export function comisionPlatforma(brut: number, procent: number) {
  const valoare = r2((Number(brut) || 0) * (Number(procent) || 0) / 100)
  return { comision_platforma_procent: Number(procent) || 0, comision_platforma_valoare: valoare, tva_comision_platforma: r2(valoare * TVA_INTRACOM) }
}
// La o rezervare noua (sincronizare 5starDesk, import, Sync): Airbnb / Booking fara comision completat il primesc
// din procentul platformei; un comision deja completat ramane neatins.
export function cuComisionImplicit<T extends Record<string, unknown>>(row: T): T {
  // rezervarile Airbnb noi intra direct „De facturat” (cerut direct; factura RH se emite din aplicatie)
  const r: T = row.canal === 'airbnb' && (!row.status_facturare || row.status_facturare === 'nefacturat') ? { ...row, status_facturare: 'de_facturat' } : row
  const pct = procentPlatforma(r.canal as string), brut = Number(r.valoare_bruta) || 0
  if (!pct || !(brut > 0) || Number(r.comision_platforma_valoare) > 0) return r
  return { ...r, ...comisionPlatforma(brut, pct) }
}
