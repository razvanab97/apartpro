// Decontul lunar al apartamentelor pe COMISION (cerut direct: „încasările − cheltuielile de la Booking / Airbnb − TVA
// intracomunitar = o sumă − comision 20% − curățenie = altă sumă pe care o transmitem proprietarului”).
// Rezervarile confirmate / finalizate care se suprapun cu luna, pro-rata pe noptile din luna (ca o sedere lunga, ex.
// 10 sept. – 20 dec., sa intre in fiecare luna cu partea ei - in Rapoarte, atribuite lunii de check-out, se pierdeau
// lunile dinainte); curatenia se numara la check-out (rezervarile cu check-out in luna). In rest, ca in Rapoarte: valoarea = suma incasata; comision platforma Airbnb 15% / Booking 17% + TVA
// intracomunitar 21% din comision. Se scade DOAR curatenia (decis direct: utilitatile din Cheltuieli nu se scad):
// taxa de curatenie din evidenta (ex. Cherry 3, lib/taxeCuratenie.ts) sau „Cost curățenie / rezervare” × nr. rezervari.
// Comisionul AB dupa tipul setat la apartament (Apartamente → Plăți).

export const COM_PLATFORMA: Record<string, number> = { airbnb: 0.15, booking: 0.17 }
export const TVA_INTRACOM = 0.21

export const TIP_COMISION_LABEL: Record<string, string> = {
  procent_brut: '% din încasări', procent_net_platforme: '% după platforme', procent_net_dupa_costuri: '% net după costuri',
  fix_lunar: 'fix lunar', mixt: 'fix + %', fara_comision: 'fără comision',
}

export const valoareRez = (r: any) => Number(r?.suma_incasata) || 0

export function proRata(r: any, start: string, end: string): number {
  const brut = valoareRez(r), nopti = Number(r.nr_nopti || 1)
  if (!nopti) return brut
  const a = r.data_checkin > start ? r.data_checkin : start
  const b = r.data_checkout < end ? r.data_checkout : end
  const zile = Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
  if (zile <= 0) return 0
  if (zile >= nopti) return brut
  return Math.round(brut / nopti * zile * 100) / 100
}

export type DecontComision = {
  nrRezervari: number; nrCheckout: number; brut: number; comPlatforme: number; tvaIntracom: number; netPlatforme: number
  curatenie: number; curatenieText: string; baza: number; comision: number; comisionText: string; deVirat: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

// rezervari = ale apartamentului care se suprapun cu luna (confirmate / finalizate, fara cele excluse din raport)
export function decontComision(apt: any, rezervari: any[], start: string, end: string, curatenieEvidenta?: { total: number; nr: number } | null): DecontComision | null {
  const tip = apt.comision_tip || 'fara_comision'
  if (tip === 'fara_comision') return null
  // noptile se numara pana la 1 ale lunii urmatoare (end = ultima zi a lunii; noaptea de pe 31 face parte din luna)
  const d = new Date(end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); const endEx = d.toISOString().slice(0, 10)
  let brut = 0, com = 0
  for (const r of rezervari) {
    const v = proRata(r, start, endEx)
    brut += v; com += v * (COM_PLATFORMA[r.canal] || 0)
  }
  const tva = com * TVA_INTRACOM
  const netPlatforme = brut - com - tva
  const costRez = Number(apt.cost_curatenie_per_rezervare) || 0
  const nrCheckout = rezervari.filter(r => r.data_checkout >= start && r.data_checkout <= end).length
  const curatenie = curatenieEvidenta ? curatenieEvidenta.total : costRez * nrCheckout
  const curatenieText = curatenieEvidenta ? `${curatenieEvidenta.nr} ${curatenieEvidenta.nr === 1 ? 'curățenie' : 'curățenii'} (evidență)` : costRez ? `${nrCheckout} × ${costRez} RON` : 'fără cost setat'
  const p = (Number(apt.comision_procent) || 0) / 100, fix = Number(apt.comision_fix) || 0
  let baza = netPlatforme - curatenie, comision = 0
  if (tip === 'procent_brut') { baza = brut; comision = brut * p }
  else if (tip === 'procent_net_platforme') { baza = netPlatforme; comision = netPlatforme * p }
  else if (tip === 'procent_net_dupa_costuri') comision = baza * p
  else if (tip === 'fix_lunar') comision = fix
  else if (tip === 'mixt') comision = fix + baza * p
  const comisionText = tip === 'fix_lunar' ? `fix ${fix} RON` : tip === 'mixt' ? `${fix} RON + ${apt.comision_procent}% net după costuri` : `${apt.comision_procent}% ${TIP_COMISION_LABEL[tip]?.replace('% ', '') || ''}`
  // proprietarul primeste: net dupa platforme − curatenie − comision AB (indiferent pe ce se calculeaza comisionul)
  const deVirat = netPlatforme - curatenie - comision
  return { nrRezervari: rezervari.filter(r => proRata(r, start, endEx) > 0 || (r.data_checkout >= start && r.data_checkout <= end)).length, nrCheckout, brut: r2(brut), comPlatforme: r2(com), tvaIntracom: r2(tva), netPlatforme: r2(netPlatforme),
    curatenie: r2(curatenie), curatenieText, baza: r2(baza), comision: r2(comision), comisionText, deVirat: r2(deVirat) }
}
